import mongoose from "mongoose";

const mongoUri = process.env.MONGODB_URI;
const secretKey = process.env.CHAPA_SECRET_KEY?.trim();
const sandbox = process.env.CHAPA_SANDBOX !== "false";

if (!mongoUri) throw new Error("MONGODB_URI is required to reconcile Chapa payments.");
if (!secretKey) throw new Error("CHAPA_SECRET_KEY is required to reconcile Chapa payments.");
if (sandbox ? !secretKey.startsWith("CHASECK_TEST-") : !secretKey.startsWith("CHASECK-")) {
  throw new Error("CHAPA_SECRET_KEY does not match CHAPA_SANDBOX.");
}

const olderThan = new Date(Date.now() - 30 * 60 * 1000);
let compared = 0;
let failed = 0;

try {
  await mongoose.connect(mongoUri);
  const payments = mongoose.connection.collection("payments");
  const pending = await payments.find({
    status: "pending",
    createdAt: { $lte: olderThan },
  }).toArray();

  for (const payment of pending) {
    compared += 1;
    try {
      const response = await fetch(
        `https://api.chapa.co/v1/transaction/verify/${encodeURIComponent(String(payment.txRef))}`,
        {
          headers: {
            Authorization: `Bearer ${secretKey}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(12_000),
        },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok || !body || body.status === "failed" || body.status === "error") {
        throw new Error("Chapa verify endpoint did not return a verifiable transaction.");
      }
      const transaction = body.data ?? {};
      const providerStatus = String(transaction.status ?? body.status ?? "").toLowerCase();
      const providerTxRef = String(transaction.tx_ref ?? transaction.txRef ?? "");
      const providerCurrency = String(transaction.currency ?? "").toUpperCase();
      const providerAmount = Number(transaction.amount);
      const reference = typeof transaction.reference === "string" ? transaction.reference : null;
      const matches = providerTxRef === String(payment.txRef)
        && providerCurrency === String(payment.currency ?? "ETB").toUpperCase()
        && Number.isFinite(providerAmount)
        && Math.abs(providerAmount - Number(payment.amountEtb)) < 0.0001;
      const reconciliationStatus = !matches
        ? "mismatch"
        : providerStatus === "success"
          ? "provider-success-webhook-pending"
          : providerStatus === "failed"
            ? "provider-failed-webhook-pending"
            : "provider-pending";

      await payments.updateOne(
        { _id: payment._id, status: "pending" },
        {
          $set: {
            reconciliationStatus,
            reconciledAt: new Date(),
            reconciliationDetails: {
              providerStatus,
              providerTxRef,
              providerAmount: Number.isFinite(providerAmount) ? providerAmount : null,
              providerCurrency,
              reference,
            },
          },
        },
      );
    } catch (error) {
      failed += 1;
      await payments.updateOne(
        { _id: payment._id, status: "pending" },
        {
          $set: {
            reconciliationStatus: "verification-error",
            reconciledAt: new Date(),
          },
        },
      );
      process.stderr.write(`Could not reconcile payment ${String(payment._id)}: ${error instanceof Error ? error.message : "verification failed"}\n`);
    }
  }

  process.stdout.write(`Compared ${compared} pending payments older than 30 minutes; ${failed} provider checks failed. Payment status and access were not changed.\n`);
} finally {
  await mongoose.disconnect();
}

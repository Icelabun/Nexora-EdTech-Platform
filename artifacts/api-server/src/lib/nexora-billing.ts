import { randomUUID } from "node:crypto";
import { PaymentModel, TournamentEntryModel } from "./nexora-models";
import { paymentProvider } from "./nexora-payments";

export type PaymentIntentInput = {
  user: any;
  purpose: string;
  amountEtb: number;
  returnPath: "/subscription" | "/tournaments";
  relatedTournamentId?: unknown;
  relatedEntryId?: unknown;
};

export function publicAppOrigin(): string {
  const configured = process.env.NEXORA_APP_URL?.trim();
  const runtimeDomain = process.env.REPLIT_DOMAINS?.split(",").map((value) => value.trim()).find(Boolean);
  const devDomain = process.env.NODE_ENV !== "production" ? process.env.REPLIT_DEV_DOMAIN?.trim() : undefined;
  const value = configured || runtimeDomain || devDomain;
  if (!value) throw new Error("Set NEXORA_APP_URL so Chapa can return students to Nexora.");
  const url = new URL(value.includes("://") ? value : `https://${value}`);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("NEXORA_APP_URL must be a valid http(s) application origin.");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

function createTxRef(purpose: string): string {
  const label = purpose.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 16);
  return `nexora-${label}-${Date.now()}-${randomUUID().slice(0, 12)}`;
}

export async function createHostedPayment(input: PaymentIntentInput): Promise<any> {
  const origin = publicAppOrigin();
  const txRef = createTxRef(input.purpose);
  const payment = await PaymentModel.create({
    userId: input.user._id,
    purpose: input.purpose,
    amountEtb: input.amountEtb,
    currency: "ETB",
    provider: "chapa",
    txRef,
    status: "pending",
    relatedTournamentId: input.relatedTournamentId ?? null,
    relatedEntryId: input.relatedEntryId ?? null,
  });
  const [firstName = "Nexora", ...lastNames] = String(input.user.name ?? "Student").trim().split(/\s+/);
  const returnUrl = new URL(`${origin}${input.returnPath}`);
  returnUrl.searchParams.set("payment", "processing");
  returnUrl.searchParams.set("tx_ref", txRef);
  try {
    const checkout = await paymentProvider.initializeCheckout({
      txRef,
      amountEtb: input.amountEtb,
      email: input.user.email,
      firstName,
      lastName: lastNames.join(" ") || "Student",
      returnUrl: returnUrl.toString(),
    });
    await PaymentModel.updateOne({ _id: payment._id }, { $set: { checkoutUrl: checkout.checkoutUrl } });
    if (input.relatedEntryId) {
      await TournamentEntryModel.updateOne(
        { _id: input.relatedEntryId },
        { $set: { paymentId: payment._id, checkoutUrl: checkout.checkoutUrl } },
      );
    }
    return { ...payment.toObject(), checkoutUrl: checkout.checkoutUrl };
  } catch (error) {
    await PaymentModel.updateOne(
      { _id: payment._id, status: "pending" },
      { $set: { status: "failed" } },
    );
    throw error;
  }
}

export async function requestPaymentRefund(payment: any, reason: string): Promise<string> {
  if (payment.status === "refund_pending" || payment.status === "refunded") return payment.status;
  if (!["successful", "refund_failed"].includes(payment.status)) {
    throw new Error("Only a confirmed payment can be refunded.");
  }
  const refundRequestReference = payment.refundRequestReference
    ?? `nexora-refund-${String(payment.txRef).replace(/[^a-z0-9-]/gi, "").slice(-70)}`;
  const claimed = await PaymentModel.findOneAndUpdate(
    { _id: payment._id, status: { $in: ["successful", "refund_failed"] } },
    {
      $set: {
        status: "refund_pending",
        refundStatus: "initiating",
        refundAmountEtb: payment.amountEtb,
        refundRequestReference,
      },
    },
    { new: true },
  );
  if (!claimed) {
    const current = await PaymentModel.findById(payment._id);
    return current?.status ?? "refund_pending";
  }
  if (payment.relatedEntryId) {
    await TournamentEntryModel.updateOne(
      { _id: payment.relatedEntryId, paymentStatus: { $in: ["paid", "pending", "refund_pending"] } },
      { $set: { paymentStatus: "refund_pending" } },
    );
  }
  try {
    const result = await paymentProvider.initiateRefund({
      txRef: payment.txRef,
      refundReference: refundRequestReference,
      reason,
    });
    await PaymentModel.updateOne(
      { _id: payment._id, status: "refund_pending" },
      { $set: { refundReference: result.refundReference, refundStatus: "initiated" } },
    );
    return "refund_pending";
  } catch (error) {
    await PaymentModel.updateOne(
      { _id: payment._id, status: "refund_pending" },
      { $set: { status: "refund_failed", refundStatus: "failed" } },
    );
    throw error;
  }
}

export function paymentRecordView(payment: any) {
  return {
    id: String(payment._id),
    txRef: payment.txRef,
    purpose: payment.purpose,
    amountEtb: Number(payment.amountEtb),
    currency: payment.currency ?? "ETB",
    status: payment.status,
    createdAt: new Date(payment.createdAt).toISOString(),
    updatedAt: new Date(payment.updatedAt).toISOString(),
    checkoutUrl: payment.status === "pending" ? payment.checkoutUrl ?? null : null,
    refundStatus: payment.refundStatus ?? null,
    refundAmountEtb: payment.refundAmountEtb ?? null,
  };
}

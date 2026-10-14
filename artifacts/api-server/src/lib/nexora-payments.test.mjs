import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  processConfirmedChapaPayment,
  verifyChapaWebhookSignature,
} from "./nexora-payments.ts";

const webhookSecret = "test-webhook-secret";
const rawBody = Buffer.from(JSON.stringify({
  event: "charge.success",
  data: { tx_ref: "nexora-arena-test-1", amount: "150", currency: "ETB" },
}));

function rawBodySignature() {
  return createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
}

function successfulTransaction(overrides = {}) {
  return {
    status: "success",
    txRef: "nexora-arena-test-1",
    amount: 150,
    currency: "ETB",
    reference: "chapa-transaction-1",
    ...overrides,
  };
}

test("accepts a valid x-chapa-signature over the raw webhook body", () => {
  assert.equal(verifyChapaWebhookSignature({
    rawBody,
    xChapaSignature: rawBodySignature(),
    secret: webhookSecret,
  }), true);
});

test("rejects an invalid signature and a signature in the wrong header", () => {
  assert.equal(verifyChapaWebhookSignature({
    rawBody,
    xChapaSignature: "0".repeat(64),
    secret: webhookSecret,
  }), false);
  const secretHash = createHmac("sha256", webhookSecret).update(webhookSecret).digest("hex");
  assert.equal(verifyChapaWebhookSignature({
    rawBody,
    xChapaSignature: secretHash,
    secret: webhookSecret,
  }), false);
});

test("duplicate success webhook applies entitlements once", async () => {
  let status = "pending";
  let appliedCount = 0;
  const process = () => processConfirmedChapaPayment({
    transaction: successfulTransaction(),
    paymentStatus: status,
    expected: { txRef: "nexora-arena-test-1", amountEtb: 150, currency: "ETB" },
    claim: async () => {
      if (status !== "pending") return false;
      status = "processing";
      return true;
    },
    apply: async () => {
      appliedCount += 1;
      status = "successful";
    },
  });

  const first = await process();
  const duplicate = await process();
  assert.deepEqual(first, { accepted: true, duplicate: false });
  assert.deepEqual(duplicate, { accepted: true, duplicate: true });
  assert.equal(appliedCount, 1);
});

test("amount mismatch rejects the webhook before claiming or granting access", async () => {
  let claimed = false;
  let applied = false;
  const result = await processConfirmedChapaPayment({
    transaction: successfulTransaction({ amount: 50 }),
    paymentStatus: "pending",
    expected: { txRef: "nexora-arena-test-1", amountEtb: 150, currency: "ETB" },
    claim: async () => {
      claimed = true;
      return true;
    },
    apply: async () => {
      applied = true;
    },
  });
  assert.deepEqual(result, { accepted: false, duplicate: false });
  assert.equal(claimed, false);
  assert.equal(applied, false);
});

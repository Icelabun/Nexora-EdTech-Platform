import { createHmac, timingSafeEqual } from "node:crypto";

export type ChapaCheckoutInput = {
  txRef: string;
  amountEtb: number;
  email: string;
  firstName: string;
  lastName: string;
  returnUrl: string;
};

export type ChapaTransaction = {
  status: string;
  txRef: string;
  amount: number;
  currency: string;
  reference: string | null;
};

export class PaymentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentConfigurationError";
  }
}

export class ChapaApiError extends Error {
  constructor(message: string, readonly httpStatus = 502) {
    super(message);
    this.name = "ChapaApiError";
  }
}

export interface PaymentProvider {
  initializeCheckout(input: ChapaCheckoutInput): Promise<{ checkoutUrl: string }>;
  verifyTransaction(txRef: string): Promise<ChapaTransaction>;
  initiateRefund(input: { txRef: string; refundReference: string; reason: string }): Promise<{ refundReference: string }>;
  verifyRefund(refundReference: string): Promise<{ status: string }>;
}

type ChapaResponse = {
  status?: string;
  message?: string;
  data?: Record<string, unknown>;
};

const chapaApiRoot = "https://api.chapa.co/v1";

function chapaSecret(): string {
  const key = process.env.CHAPA_SECRET_KEY?.trim();
  if (!key) throw new PaymentConfigurationError("Chapa payments are not configured. Add CHAPA_SECRET_KEY in Secrets.");
  const testMode = process.env.CHAPA_SANDBOX !== "false";
  const keyMatchesMode = testMode ? key.startsWith("CHASECK_TEST-") : key.startsWith("CHASECK-");
  if (!keyMatchesMode) {
    throw new PaymentConfigurationError(
      `CHAPA_SECRET_KEY must be a ${testMode ? "test" : "live"} Chapa secret key to match CHAPA_SANDBOX.`,
    );
  }
  return key;
}

async function chapaRequest(path: string, init: RequestInit = {}): Promise<ChapaResponse> {
  const key = chapaSecret();
  let response: Response;
  try {
    response = await fetch(`${chapaApiRoot}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new ChapaApiError("Chapa could not be reached. Try again shortly.", 503);
  }
  const body = (await response.json().catch(() => null)) as ChapaResponse | null;
  if (!response.ok || !body) {
    throw new ChapaApiError("Chapa did not accept the request. Check payment configuration and try again.", 502);
  }
  if (body.status === "failed" || body.status === "error") {
    throw new ChapaApiError("Chapa could not complete the payment operation.", 502);
  }
  return body;
}

export class ChapaPaymentProvider implements PaymentProvider {
  async initializeCheckout(input: ChapaCheckoutInput): Promise<{ checkoutUrl: string }> {
    const body = await chapaRequest("/transaction/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: String(input.amountEtb),
        currency: "ETB",
        email: input.email,
        first_name: input.firstName,
        last_name: input.lastName,
        tx_ref: input.txRef,
        return_url: input.returnUrl,
        customization: {
          title: "Nexora",
          description: "Nexora learning access",
        },
      }),
    });
    const checkoutUrl = body.data?.checkout_url;
    if (typeof checkoutUrl !== "string" || !/^https:\/\/(checkout\.)?chapa\.co\//i.test(checkoutUrl)) {
      throw new ChapaApiError("Chapa returned an invalid checkout link.");
    }
    return { checkoutUrl };
  }

  async verifyTransaction(txRef: string): Promise<ChapaTransaction> {
    const body = await chapaRequest(`/transaction/verify/${encodeURIComponent(txRef)}`);
    const data = body.data ?? {};
    return {
      status: String(data.status ?? body.status ?? "").toLowerCase(),
      txRef: String(data.tx_ref ?? data.txRef ?? ""),
      amount: Number(data.amount),
      currency: String(data.currency ?? "").toUpperCase(),
      reference: typeof data.reference === "string" ? data.reference : null,
    };
  }

  async initiateRefund(input: {
    txRef: string;
    refundReference: string;
    reason: string;
  }): Promise<{ refundReference: string }> {
    const body = await chapaRequest(`/refund/${encodeURIComponent(input.txRef)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        reason: input.reason,
        reference: input.refundReference,
      }),
    });
    const returnedReference = body.data?.ref_id;
    if (typeof returnedReference !== "string" || !returnedReference) {
      throw new ChapaApiError("Chapa did not return a refund reference.");
    }
    return { refundReference: returnedReference };
  }

  async verifyRefund(refundReference: string): Promise<{ status: string }> {
    const body = await chapaRequest(`/refund/${encodeURIComponent(refundReference)}/verify`);
    return { status: String(body.data?.status ?? body.status ?? "").toLowerCase() };
  }
}

export const paymentProvider: PaymentProvider = new ChapaPaymentProvider();

export function verifyChapaWebhookSignature(input: {
  rawBody: Buffer;
  chapaSignature?: string;
  xChapaSignature?: string;
  secret?: string;
}): boolean {
  const secret = input.secret ?? process.env.CHAPA_WEBHOOK_SECRET;
  if (!secret) return false;
  const candidates: string[] = [];
  if (input.xChapaSignature) {
    candidates.push(createHmac("sha256", secret).update(input.rawBody).digest("hex"));
  }
  if (input.chapaSignature) {
    candidates.push(createHmac("sha256", secret).update(secret).digest("hex"));
  }
  const provided = [input.xChapaSignature, input.chapaSignature]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.replace(/^sha256=/i, "").trim().toLowerCase());
  return candidates.some((expected) =>
    provided.some((actual) => {
      const expectedBuffer = Buffer.from(expected, "hex");
      const actualBuffer = Buffer.from(actual, "hex");
      return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
    }),
  );
}

export function transactionMatchesPayment(
  transaction: ChapaTransaction,
  expected: { txRef: string; amountEtb: number; currency?: string },
): boolean {
  return transaction.status === "success"
    && transaction.txRef === expected.txRef
    && transaction.currency === (expected.currency ?? "ETB")
    && Number.isFinite(transaction.amount)
    && Math.abs(transaction.amount - expected.amountEtb) < 0.0001;
}

export async function applySuccessfulPaymentOnce(input: {
  claim: () => Promise<boolean>;
  apply: () => Promise<void>;
}): Promise<boolean> {
  const claimed = await input.claim();
  if (!claimed) return false;
  await input.apply();
  return true;
}

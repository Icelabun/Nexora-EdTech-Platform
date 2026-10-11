export type PaymentResult = { status: "mock-approved"; reference: string };

export interface PaymentProvider {
  collect(input: { userId: string; amountEtb: number; purpose: string }): Promise<PaymentResult>;
}

export class MockPaymentProvider implements PaymentProvider {
  async collect(input: { userId: string; amountEtb: number; purpose: string }): Promise<PaymentResult> {
    return {
      status: "mock-approved",
      reference: `mock-${input.purpose}-${input.userId.slice(-6)}-${Date.now()}`,
    };
  }
}

export const paymentProvider: PaymentProvider = new MockPaymentProvider();

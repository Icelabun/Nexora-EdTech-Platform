import { Router, type IRouter, type Request } from "express";
import rateLimit from "express-rate-limit";
import {
  CancelTournamentParams,
  CancelTournamentResponse,
  GetPaymentHistoryResponse,
  GetSubscriptionResponse,
  RefundPaymentParams,
  RefundPaymentResponse,
  SelectSubscriptionBody,
  SelectSubscriptionResponse,
  WebhookAcknowledgement,
} from "@workspace/api-zod";
import {
  authenticatedUserId,
  type AuthenticatedRequest,
  requireNexoraAuth,
  requireNexoraRole,
} from "../middlewares/nexora-auth";
import {
  PaymentModel,
  SubscriptionModel,
  TournamentEntryModel,
  TournamentModel,
  UserModel,
} from "../lib/nexora-models";
import {
  createHostedPayment,
  paymentRecordView,
  requestPaymentRefund,
} from "../lib/nexora-billing";
import {
  applySuccessfulPaymentOnce,
  ChapaApiError,
  PaymentConfigurationError,
  paymentProvider,
  transactionMatchesPayment,
  verifyChapaWebhookSignature,
} from "../lib/nexora-payments";
import { sweepExpiredSubscriptions } from "../lib/nexora-subscriptions";

const router: IRouter = Router();
const webhookLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
const monthlyArenaPriceEtb = 150;
const subscriptionPeriodMs = 30 * 24 * 60 * 60 * 1000;

type RequestWithRawBody = Request & { rawBody?: Buffer };
type ChapaWebhook = {
  event?: string;
  type?: string;
  data?: Record<string, unknown>;
};

function paymentError(res: any, error: unknown): void {
  if (error instanceof PaymentConfigurationError) {
    res.status(503).json({ error: error.message });
    return;
  }
  if (error instanceof ChapaApiError) {
    res.status(error.httpStatus).json({ error: error.message });
    return;
  }
  res.status(503).json({ error: "The payment service is temporarily unavailable." });
}

function webhookEventType(event: ChapaWebhook): string {
  return String(event.event ?? event.type ?? "").toLowerCase();
}

function eventTxRef(data: Record<string, unknown>): string {
  return String(data.tx_ref ?? data.txRef ?? data.merchant_reference ?? "");
}

function addGracePeriod(now = new Date()): Date {
  return new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
}

async function recordSubscriptionFailure(payment: any): Promise<void> {
  const user = await UserModel.findById(payment.userId);
  if (!user || user.subscriptionTier !== "arena") return;
  const subscription = await SubscriptionModel.findOne({ userId: user._id });
  const graceEndsAt = addGracePeriod();
  await SubscriptionModel.updateOne(
    { userId: user._id, tier: "arena" },
    { $set: { billingStatus: "past_due", graceEndsAt } },
  );
  user.arenaAccessUntil = graceEndsAt;
  await user.save();
  if (subscription && subscription.currentPeriodEnd && subscription.currentPeriodEnd > graceEndsAt) {
    await SubscriptionModel.updateOne(
      { userId: user._id },
      { $set: { graceEndsAt: subscription.currentPeriodEnd } },
    );
    user.arenaAccessUntil = subscription.currentPeriodEnd;
    await user.save();
  }
}

async function applyConfirmedPayment(payment: any): Promise<"successful" | "refund_pending" | "refund_failed"> {
  if (payment.purpose === "arena-monthly-subscription") {
    const now = new Date();
    await SubscriptionModel.updateOne(
      { userId: payment.userId },
      { $setOnInsert: { tier: "free", priceEtb: 0, billingStatus: "free" } },
      { upsert: true },
    );
    const current = await SubscriptionModel.findOne({ userId: payment.userId });
    const base = current?.currentPeriodEnd && current.currentPeriodEnd.getTime() > now.getTime()
      ? current.currentPeriodEnd
      : now;
    const periodEnd = new Date(base.getTime() + subscriptionPeriodMs);
    const applied = await SubscriptionModel.findOneAndUpdate(
      { userId: payment.userId, appliedPaymentIds: { $ne: payment._id } },
      {
        $set: {
          tier: "arena",
          priceEtb: monthlyArenaPriceEtb,
          billingStatus: "active",
          currentPeriodEnd: periodEnd,
          graceEndsAt: null,
          renewalDueAt: periodEnd,
          renewalCheckoutUrl: null,
          lastPaymentId: payment._id,
        },
        $addToSet: { appliedPaymentIds: payment._id },
      },
      { new: true },
    );
    const subscription = applied ?? await SubscriptionModel.findOne({ userId: payment.userId });
    if (subscription) {
      await UserModel.updateOne(
        { _id: payment.userId },
        { $set: { subscriptionTier: "arena", arenaAccessUntil: subscription.currentPeriodEnd } },
      );
    }
    return "successful";
  }

  if (payment.relatedTournamentId) {
    const tournament = await TournamentModel.findById(payment.relatedTournamentId);
    const entry = payment.relatedEntryId
      ? await TournamentEntryModel.findById(payment.relatedEntryId)
      : await TournamentEntryModel.findOne({ tournamentId: payment.relatedTournamentId, userId: payment.userId });
    const paymentAlreadyReserved = tournament?.processedPaymentIds?.some(
      (id: unknown) => String(id) === String(payment._id),
    );
    if (paymentAlreadyReserved && entry) {
      await TournamentEntryModel.updateOne(
        { _id: entry._id },
        { $set: { paymentStatus: "paid", checkoutUrl: null, paymentId: payment._id } },
      );
      return "successful";
    }
    const seat = await TournamentModel.findOneAndUpdate(
      {
        _id: payment.relatedTournamentId,
        active: true,
        cancelledAt: null,
        $expr: { $lt: ["$participantCount", "$capacity"] },
        processedPaymentIds: { $ne: payment._id },
      },
      {
        $inc: { participantCount: 1 },
        $addToSet: { processedPaymentIds: payment._id },
      },
      { new: true },
    );
    if (seat && entry) {
      await TournamentEntryModel.updateOne(
        { _id: entry._id },
        { $set: { paymentStatus: "paid", checkoutUrl: null, paymentId: payment._id } },
      );
      return "successful";
    }
    if (entry) {
      await TournamentEntryModel.updateOne(
        { _id: entry._id },
        { $set: { paymentStatus: "refund_pending" } },
      );
    }
    await PaymentModel.updateOne(
      { _id: payment._id, status: "processing" },
      { $set: { status: "successful" } },
    );
    const confirmedPayment = await PaymentModel.findById(payment._id);
    if (!confirmedPayment) return "refund_failed";
    try {
      const result = await requestPaymentRefund(confirmedPayment, "Tournament was full or cancelled before the paid entry could be confirmed.");
      return result === "refund_failed" ? "refund_failed" : "refund_pending";
    } catch {
      return "refund_failed";
    }
  }

  return "successful";
}

async function finishRefundWebhook(payment: any, data: Record<string, unknown>): Promise<boolean> {
  const refundRef = payment.refundReference ?? (typeof data.ref_id === "string" ? data.ref_id : null);
  if (!refundRef) return false;
  const verified = await paymentProvider.verifyRefund(refundRef);
  if (verified.status === "refunded") {
    await PaymentModel.updateOne(
      { _id: payment._id, status: { $in: ["refund_pending", "refund_failed", "successful"] } },
      { $set: { status: "refunded", refundStatus: "refunded", refundReference: refundRef } },
    );
    if (payment.relatedEntryId) {
      await TournamentEntryModel.updateOne(
        { _id: payment.relatedEntryId },
        { $set: { paymentStatus: "refunded", checkoutUrl: null } },
      );
    }
    return true;
  }
  if (verified.status === "reversed") {
    await PaymentModel.updateOne(
      { _id: payment._id },
      { $set: { status: "refund_failed", refundStatus: "reversed", refundReference: refundRef } },
    );
    return true;
  }
  return false;
}

router.get("/subscriptions", requireNexoraAuth, async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  await sweepExpiredSubscriptions();
  const user = await UserModel.findById(userId);
  if (!user) {
    res.status(404).json({ error: "Account not found." });
    return;
  }
  const subscription = await SubscriptionModel.findOne({ userId });
  const tier = subscription?.tier ?? user.subscriptionTier ?? "free";
  res.json(GetSubscriptionResponse.parse({
    tier,
    priceEtb: subscription?.priceEtb ?? (tier === "arena" ? monthlyArenaPriceEtb : 0),
    billingStatus: subscription?.billingStatus ?? "free",
    currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
    graceEndsAt: subscription?.graceEndsAt?.toISOString() ?? null,
    renewalDueAt: subscription?.renewalDueAt?.toISOString() ?? null,
    checkoutUrl: subscription?.renewalCheckoutUrl ?? null,
  }));
});

router.post("/subscriptions", requireNexoraAuth, async (req, res): Promise<void> => {
  const parsed = SelectSubscriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = authenticatedUserId(req);
  const user = await UserModel.findById(userId);
  if (!user) {
    res.status(404).json({ error: "Account not found." });
    return;
  }
  const requesterRole = (req as AuthenticatedRequest).auth?.role;
  if (parsed.data.tier === "institution" && requesterRole !== "teacher" && requesterRole !== "admin") {
    res.status(403).json({ error: "Institution plans are available to teacher and admin accounts." });
    return;
  }
  if (parsed.data.tier === "free") {
    await UserModel.updateOne({ _id: userId }, { $set: { subscriptionTier: "free", arenaAccessUntil: null } });
    await SubscriptionModel.findOneAndUpdate(
      { userId },
      {
        $set: {
          userId,
          tier: "free",
          priceEtb: 0,
          billingStatus: "free",
          currentPeriodEnd: null,
          graceEndsAt: null,
          renewalDueAt: null,
          renewalCheckoutUrl: null,
        },
      },
      { upsert: true, new: true },
    );
    res.json(SelectSubscriptionResponse.parse({
      tier: "free",
      priceEtb: 0,
      billingStatus: "free",
      currentPeriodEnd: null,
      graceEndsAt: null,
      renewalDueAt: null,
      checkoutUrl: null,
    }));
    return;
  }
  if (parsed.data.tier === "institution") {
    res.json(SelectSubscriptionResponse.parse({
      tier: "institution",
      priceEtb: 0,
      billingStatus: "contact-school",
      currentPeriodEnd: null,
      graceEndsAt: null,
      renewalDueAt: null,
      checkoutUrl: null,
    }));
    return;
  }
  const existingPending = await PaymentModel.findOne({
    userId,
    purpose: "arena-monthly-subscription",
    status: "pending",
    createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) },
    checkoutUrl: { $ne: null },
  }).sort({ createdAt: -1 });
  try {
    const payment = existingPending ?? await createHostedPayment({
      user,
      purpose: "arena-monthly-subscription",
      amountEtb: monthlyArenaPriceEtb,
      returnPath: "/subscription",
    });
    const currentSubscription = await SubscriptionModel.findOneAndUpdate(
      { userId },
      {
        $set: {
          userId,
          priceEtb: monthlyArenaPriceEtb,
          billingStatus: user.subscriptionTier === "arena" ? "active" : "pending-payment",
          renewalCheckoutUrl: payment.checkoutUrl,
        },
        $setOnInsert: {
          tier: user.subscriptionTier === "arena" ? "arena" : "free",
        },
      },
      { upsert: true, new: true },
    );
    res.json(SelectSubscriptionResponse.parse({
      tier: currentSubscription?.tier ?? "free",
      priceEtb: monthlyArenaPriceEtb,
      billingStatus: currentSubscription?.billingStatus ?? "pending-payment",
      currentPeriodEnd: currentSubscription?.currentPeriodEnd?.toISOString() ?? null,
      graceEndsAt: currentSubscription?.graceEndsAt?.toISOString() ?? null,
      renewalDueAt: currentSubscription?.renewalDueAt?.toISOString() ?? null,
      checkoutUrl: payment.checkoutUrl,
    }));
  } catch (error) {
    paymentError(res, error);
  }
});

router.get("/payments", requireNexoraAuth, async (req, res): Promise<void> => {
  const auth = (req as AuthenticatedRequest).auth;
  const adminView = auth?.role === "admin";
  const payments = await PaymentModel.find(adminView ? {} : { userId: authenticatedUserId(req) })
    .sort({ createdAt: -1 })
    .limit(adminView ? 200 : 100);
  res.json(GetPaymentHistoryResponse.parse({
    payments: payments.map(paymentRecordView),
    adminView,
  }));
});

router.post("/payments/chapa/webhook", webhookLimiter, async (req, res): Promise<void> => {
  const rawBody = (req as RequestWithRawBody).rawBody;
  const signature = req.get("chapa-signature") ?? undefined;
  const xSignature = req.get("x-chapa-signature") ?? undefined;
  if (!rawBody || !verifyChapaWebhookSignature({
    rawBody,
    chapaSignature: signature,
    xChapaSignature: xSignature,
  })) {
    req.log.warn("Rejected Chapa webhook with an invalid signature.");
    res.status(400).json({ error: "Invalid Chapa webhook signature." });
    return;
  }
  const webhook = req.body as ChapaWebhook;
  const eventType = webhookEventType(webhook);
  const data = webhook.data ?? {};
  const txRef = eventTxRef(data);
  if (!eventType || !txRef) {
    res.status(400).json({ error: "Malformed Chapa webhook event." });
    return;
  }
  const payment = await PaymentModel.findOne({ txRef });
  if (!payment) {
    req.log.warn({ txRef }, "Signed Chapa webhook did not match a Nexora payment.");
    res.json(WebhookAcknowledgement.parse({ received: true, duplicate: false }));
    return;
  }

  if (eventType === "charge.refunded") {
    try {
      const verified = await finishRefundWebhook(payment, data);
      res.json(WebhookAcknowledgement.parse({ received: true, duplicate: !verified }));
    } catch (error) {
      req.log.error({ err: error, paymentId: String(payment._id) }, "Could not verify Chapa refund webhook.");
      res.status(503).json({ error: "Refund status could not be verified yet." });
    }
    return;
  }

  if (eventType === "charge.failed" || eventType === "charge.cancelled" || eventType === "charge.canceled") {
    const updated = await PaymentModel.findOneAndUpdate(
      { _id: payment._id, status: "pending" },
      { $set: { status: "failed", webhookProcessedAt: new Date() } },
      { new: true },
    );
    if (updated) {
      if (updated.relatedEntryId) {
        await TournamentEntryModel.updateOne(
          { _id: updated.relatedEntryId, paymentStatus: "pending" },
          { $set: { paymentStatus: "failed", checkoutUrl: null } },
        );
      }
      if (updated.purpose === "arena-monthly-subscription") await recordSubscriptionFailure(updated);
    }
    res.json(WebhookAcknowledgement.parse({ received: true, duplicate: !updated }));
    return;
  }

  if (eventType !== "charge.success") {
    res.json(WebhookAcknowledgement.parse({ received: true, duplicate: false }));
    return;
  }
  if (payment.status === "successful" || payment.status === "refund_pending" || payment.status === "refunded") {
    res.json(WebhookAcknowledgement.parse({ received: true, duplicate: true }));
    return;
  }
  try {
    const verified = await paymentProvider.verifyTransaction(txRef);
    if (!transactionMatchesPayment(verified, { txRef, amountEtb: Number(payment.amountEtb), currency: "ETB" })) {
      req.log.warn(
        { txRef, verifiedStatus: verified.status, verifiedAmount: verified.amount, verifiedCurrency: verified.currency },
        "Chapa webhook transaction did not match the pending Nexora payment.",
      );
      res.status(422).json({ error: "The verified transaction does not match the expected payment." });
      return;
    }
    const staleProcessingTime = new Date(Date.now() - 2 * 60 * 1000);
    let finalStatus: "successful" | "refund_pending" | "refund_failed" = "successful";
    const applied = await applySuccessfulPaymentOnce({
      claim: async () => Boolean(await PaymentModel.findOneAndUpdate(
        {
          _id: payment._id,
          $or: [
            { status: "pending" },
            { status: "processing", updatedAt: { $lte: staleProcessingTime } },
          ],
        },
        {
          $set: {
            status: "processing",
            providerReference: verified.reference,
            webhookProcessedAt: new Date(),
          },
        },
        { new: true },
      )),
      apply: async () => {
        finalStatus = await applyConfirmedPayment(payment);
        await PaymentModel.updateOne(
          { _id: payment._id, status: "processing" },
          { $set: { status: finalStatus, entitlementAppliedAt: new Date() } },
        );
      },
    });
    res.json(WebhookAcknowledgement.parse({ received: true, duplicate: !applied }));
  } catch (error) {
    await PaymentModel.updateOne(
      { _id: payment._id, status: "processing" },
      { $set: { status: "pending" } },
    );
    req.log.error({ err: error, paymentId: String(payment._id) }, "Chapa webhook processing failed.");
    paymentError(res, error);
  }
});

router.post("/payments/:paymentId/refund", requireNexoraAuth, requireNexoraRole("admin"), async (req, res): Promise<void> => {
  const params = RefundPaymentParams.safeParse({ paymentId: Array.isArray(req.params.paymentId) ? req.params.paymentId[0] : req.params.paymentId });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const payment = await PaymentModel.findById(params.data.paymentId);
  if (!payment) {
    res.status(404).json({ error: "Payment not found." });
    return;
  }
  try {
    const status = await requestPaymentRefund(payment, "Refund requested by Nexora administrator.");
    res.json(RefundPaymentResponse.parse({ status, message: status === "refund_pending" ? "Refund processing has started." : `Refund status: ${status}.` }));
  } catch (error) {
    paymentError(res, error);
  }
});

router.post("/admin/tournaments/:tournamentId/cancel", requireNexoraAuth, requireNexoraRole("admin"), async (req, res): Promise<void> => {
  const params = CancelTournamentParams.safeParse({
    tournamentId: Array.isArray(req.params.tournamentId) ? req.params.tournamentId[0] : req.params.tournamentId,
  });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const tournament = await TournamentModel.findByIdAndUpdate(
    params.data.tournamentId,
    { $set: { active: false, cancelledAt: new Date() } },
    { new: true },
  );
  if (!tournament) {
    res.status(404).json({ error: "Tournament not found." });
    return;
  }
  const entries = await TournamentEntryModel.find({ tournamentId: tournament._id });
  const payments = await PaymentModel.find({ relatedTournamentId: tournament._id });
  const paymentByEntry = new Map(payments.map((payment: any) => [String(payment.relatedEntryId), payment]));
  for (const entry of entries) {
    const payment: any = paymentByEntry.get(String(entry._id));
    if (!payment) {
      await TournamentEntryModel.updateOne({ _id: entry._id }, { $set: { paymentStatus: "cancelled" } });
      continue;
    }
    if (payment.status === "pending") {
      await PaymentModel.updateOne({ _id: payment._id, status: "pending" }, { $set: { status: "cancelled" } });
      await TournamentEntryModel.updateOne({ _id: entry._id }, { $set: { paymentStatus: "cancelled", checkoutUrl: null } });
    } else if (payment.status === "successful" || payment.status === "refund_failed") {
      try {
        await requestPaymentRefund(payment, "Tournament was cancelled by an administrator.");
      } catch (error) {
        req.log.error({ err: error, paymentId: String(payment._id) }, "Tournament cancellation refund failed.");
      }
    }
  }
  res.json(CancelTournamentResponse.parse({
    message: "Tournament cancelled. Confirmed paid entries are being refunded; students will see the final status in payment history.",
  }));
});

export default router;

import { logger } from "./logger";
import { SubscriptionModel, UserModel } from "./nexora-models";

const gracePeriodMs = 3 * 24 * 60 * 60 * 1000;

export async function sweepExpiredSubscriptions(now = new Date()): Promise<void> {
  const activePastDue = await SubscriptionModel.find({
    tier: "arena",
    billingStatus: "active",
    currentPeriodEnd: { $lte: now },
  }).select("userId currentPeriodEnd");
  for (const subscription of activePastDue) {
    const periodEnd = subscription.currentPeriodEnd ?? now;
    const graceEndsAt = new Date(periodEnd.getTime() + gracePeriodMs);
    await SubscriptionModel.updateOne(
      { _id: subscription._id, billingStatus: "active", currentPeriodEnd: { $lte: now } },
      { $set: { billingStatus: "past_due", graceEndsAt } },
    );
    await UserModel.updateOne(
      { _id: subscription.userId, subscriptionTier: "arena" },
      { $set: { arenaAccessUntil: graceEndsAt } },
    );
  }

  const expired = await SubscriptionModel.find({
    tier: "arena",
    billingStatus: "past_due",
    graceEndsAt: { $lte: now },
  }).select("userId");
  if (!expired.length) return;
  const userIds = expired.map((subscription) => subscription.userId);
  await SubscriptionModel.updateMany(
    { userId: { $in: userIds }, tier: "arena", billingStatus: "past_due", graceEndsAt: { $lte: now } },
    {
      $set: {
        tier: "free",
        priceEtb: 0,
        billingStatus: "free",
        currentPeriodEnd: null,
        graceEndsAt: null,
        renewalDueAt: null,
        renewalCheckoutUrl: null,
      },
    },
  );
  await UserModel.updateMany(
    { _id: { $in: userIds }, subscriptionTier: "arena" },
    { $set: { subscriptionTier: "free", arenaAccessUntil: null } },
  );
  logger.info({ count: userIds.length }, "Arena subscriptions downgraded after grace period.");
}

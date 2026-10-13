import { Router, type IRouter } from "express";
import {
  ClaimDailyRewardResponse,
  GetDailyRewardResponse,
} from "@workspace/api-zod";
import { authenticatedUserId, requireNexoraAuth } from "../middlewares/nexora-auth";
import { UserModel } from "../lib/nexora-models";

const router: IRouter = Router();
const rewardXp = 50;
const rewardItem = { itemId: "focus-spark", name: "Focus Spark", quantity: 1 };

function ethiopianDay(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Addis_Ababa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function previousDay(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function welcomeBack(lastClaimedDay: string | null | undefined, today: string): boolean {
  return Boolean(lastClaimedDay && lastClaimedDay !== today && lastClaimedDay !== previousDay(today));
}

function rankForXp(xp: number): string {
  if (xp >= 10_000) return "S";
  if (xp >= 6_000) return "A";
  if (xp >= 3_000) return "B";
  if (xp >= 1_500) return "C";
  if (xp >= 500) return "D";
  return "E";
}

function responseStatus(user: any, today: string) {
  return {
    claimedToday: user.dailyRewardDate === today,
    welcomeBack: welcomeBack(user.dailyRewardDate, today),
    claimedAt: user.dailyRewardClaimedAt?.toISOString() ?? null,
    xpReward: rewardXp,
    itemName: rewardItem.name,
    itemQuantity: rewardItem.quantity,
  };
}

router.get("/daily-reward", requireNexoraAuth, async (req, res): Promise<void> => {
  const user = await UserModel.findById(authenticatedUserId(req));
  if (!user) {
    res.status(404).json({ error: "Account not found." });
    return;
  }
  res.json(GetDailyRewardResponse.parse(responseStatus(user, ethiopianDay())));
});

router.post("/daily-reward/claim", requireNexoraAuth, async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  const today = ethiopianDay();
  const before = await UserModel.findById(userId);
  if (!before) {
    res.status(404).json({ error: "Account not found." });
    return;
  }
  const previousHunterRank = before.hunterRank ?? "E";
  const now = new Date();
  const claimedUser = await UserModel.findOneAndUpdate(
    { _id: userId, dailyRewardDate: { $ne: today } },
    [
      {
        $set: {
          dailyRewardDate: today,
          dailyRewardClaimedAt: now,
          xp: { $add: [{ $ifNull: ["$xp", 0] }, rewardXp] },
          inventory: {
            $concatArrays: [
              { $ifNull: ["$inventory", []] },
              [{ ...rewardItem }],
            ],
          },
        },
      },
      {
        $set: {
          level: { $add: [{ $floor: { $divide: ["$xp", 500] } }, 1] },
          hunterRank: {
            $switch: {
              branches: [
                { case: { $gte: ["$xp", 10_000] }, then: "S" },
                { case: { $gte: ["$xp", 6_000] }, then: "A" },
                { case: { $gte: ["$xp", 3_000] }, then: "B" },
                { case: { $gte: ["$xp", 1_500] }, then: "C" },
                { case: { $gte: ["$xp", 500] }, then: "D" },
              ],
              default: "E",
            },
          },
        },
      },
    ] as any,
    { new: true },
  );
  if (!claimedUser) {
    const current = await UserModel.findById(userId);
    res.json(ClaimDailyRewardResponse.parse({
      claimed: false,
      welcomeBack: welcomeBack(current?.dailyRewardDate, today),
      xpAwarded: 0,
      itemName: rewardItem.name,
      itemQuantity: 0,
      claimedAt: current?.dailyRewardClaimedAt?.toISOString() ?? null,
      hunterRank: current?.hunterRank ?? previousHunterRank,
      previousHunterRank,
      rankUp: false,
    }));
    return;
  }
  const hunterRank = claimedUser.hunterRank ?? "E";
  res.json(ClaimDailyRewardResponse.parse({
    claimed: true,
    welcomeBack: welcomeBack(before.dailyRewardDate, today),
    xpAwarded: rewardXp,
    itemName: rewardItem.name,
    itemQuantity: rewardItem.quantity,
    claimedAt: claimedUser.dailyRewardClaimedAt?.toISOString() ?? now.toISOString(),
    hunterRank,
    previousHunterRank,
    rankUp: hunterRank !== previousHunterRank,
  }));
});

export default router;

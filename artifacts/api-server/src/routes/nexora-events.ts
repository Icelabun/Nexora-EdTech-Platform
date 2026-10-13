import { Router, type IRouter } from "express";
import {
  AnswerEventProblemResponse,
  AnswerEventProblemBody,
  GetEventSessionResponse,
  StartEventSessionResponse,
} from "@workspace/api-zod";
import { authenticatedUserId, requireNexoraAuth } from "../middlewares/nexora-auth";
import { EventCaseModel, EventSessionModel, UserModel } from "../lib/nexora-models";

const router: IRouter = Router();

function rankForXp(xp: number): string {
  if (xp >= 10_000) return "S";
  if (xp >= 6_000) return "A";
  if (xp >= 3_000) return "B";
  if (xp >= 1_500) return "C";
  if (xp >= 500) return "D";
  return "E";
}

function problemView(step: any, finale: boolean) {
  return {
    stepId: step.id,
    title: step.title,
    scene: step.scene,
    subject: step.subject,
    difficulty: step.difficulty,
    prompt: step.prompt,
    options: step.options,
    finale,
    hpDamage: finale ? step.hpDamage : 0,
  };
}

function sessionView(session: any, eventCase: any, now = new Date()) {
  const isActive = session.status === "active";
  const leads = eventCase.leads as any[];
  const currentLeadIndex = Number(session.currentLeadIndex ?? 0);
  const clues = leads.map((lead: any, index: number) => {
    const revealed = session.status === "completed" || index <= currentLeadIndex;
    return {
      id: lead.id,
      position: lead.position,
      title: lead.title,
      scene: revealed ? lead.scene : "",
      clue: revealed ? lead.clue : "Unrevealed",
      revealed,
      solved: (session.solvedLeadIds as string[]).includes(lead.id),
    };
  });
  let currentProblem: ReturnType<typeof problemView> | null = null;
  let monster: { name: string; hp: number; maxHp: number } | null = null;
  if (isActive && currentLeadIndex < leads.length) {
    currentProblem = problemView(leads[currentLeadIndex], false);
  } else if (isActive) {
    const finaleSteps = eventCase.finaleSteps as any[];
    const finaleStep = finaleSteps[Number(session.finaleStep ?? 0)];
    monster = {
      name: eventCase.monsterName,
      hp: Math.max(0, Number(session.monsterHp)),
      maxHp: Number(eventCase.monsterHp),
    };
    if (finaleStep) currentProblem = problemView(finaleStep, true);
  }
  return {
    id: String(session._id),
    status: session.status,
    caseTitle: eventCase.title,
    intro: eventCase.intro,
    startedAt: new Date(session.startedAt).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
    timeRemainingSeconds: Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - now.getTime()) / 1000)),
    focusRemaining: Number(session.focusRemaining),
    focusTotal: Number(eventCase.focusTotal),
    currentLeadIndex,
    leadCount: leads.length,
    clues,
    currentProblem,
    monster,
    reward: {
      xp: Number(eventCase.rewardXp),
      badge: eventCase.rewardBadge,
      title: eventCase.rewardTitle,
    },
    rewardGranted: Boolean(session.rewardApplied),
  };
}

async function eventReady(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user) return { user: null, eventCase: null };
  if (user.branchChoice !== "event") return { user, eventCase: null };
  const eventCase = await EventCaseModel.findOne({ active: true }).sort({ createdAt: 1 });
  return { user, eventCase };
}

async function expireIfNeeded(session: any): Promise<boolean> {
  if (session.status !== "active" || new Date(session.expiresAt).getTime() > Date.now()) return false;
  await EventSessionModel.updateOne(
    { _id: session._id, status: "active" },
    { $set: { status: "expired" } },
  );
  session.status = "expired";
  return true;
}

async function applyEventReward(session: any, eventCase: any, userId: string): Promise<{ rankUp: boolean; hunterRank: string }> {
  const before = await UserModel.findById(userId);
  const previousRank = before?.hunterRank ?? "E";
  await UserModel.updateOne(
    { _id: userId, eventRewardSessionIds: { $ne: session._id } },
    {
      $inc: { xp: Number(eventCase.rewardXp) },
      $addToSet: {
        badges: eventCase.rewardBadge,
        eventRewardSessionIds: session._id,
      },
      $set: { cosmeticTitle: eventCase.rewardTitle },
    },
  );
  const user = await UserModel.findById(userId);
  if (!user) return { rankUp: false, hunterRank: previousRank };
  const hunterRank = rankForXp(user.xp);
  user.hunterRank = hunterRank;
  user.level = Math.floor(user.xp / 500) + 1;
  await user.save();
  await EventSessionModel.updateOne(
    { _id: session._id, rewardApplied: false },
    { $set: { rewardApplied: true } },
  );
  session.rewardApplied = true;
  return { rankUp: hunterRank !== previousRank, hunterRank };
}

router.get("/event/session", requireNexoraAuth, async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  const { user, eventCase } = await eventReady(userId);
  if (!user) {
    res.status(404).json({ error: "Account not found." });
    return;
  }
  if (user.branchChoice !== "event") {
    res.json(GetEventSessionResponse.parse({
      available: false,
      message: user.branchChoice === "solo"
        ? "You chose the Solo Leveling path. Your dungeon runs continue as normal."
        : "Beat your first dungeon boss with at least 95% accuracy to unlock Two Doors.",
      session: null,
    }));
    return;
  }
  if (!eventCase) {
    res.json(GetEventSessionResponse.parse({ available: false, message: "The next case is being prepared.", session: null }));
    return;
  }
  let session = await EventSessionModel.findOne({ userId });
  if (!session) {
    res.json(GetEventSessionResponse.parse({ available: true, message: "Your investigation is ready when you are.", session: null }));
    return;
  }
  await expireIfNeeded(session);
  if (session.status === "completed" && !session.rewardApplied) {
    await applyEventReward(session, await EventCaseModel.findOne({ caseId: session.caseId }), userId);
  }
  const caseForSession = await EventCaseModel.findOne({ caseId: session.caseId });
  if (!caseForSession) {
    res.status(410).json({ error: "This investigation is no longer available." });
    return;
  }
  res.json(GetEventSessionResponse.parse({
    available: true,
    message: session.status === "expired"
      ? "This 60-minute case has expired. Your saved clues are still on the board."
      : session.status === "completed"
        ? "Case closed. Your reward is recorded."
        : "Your case is saved. Continue where you left off.",
    session: sessionView(session, caseForSession),
  }));
});

router.post("/event/session/start", requireNexoraAuth, async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  const { user, eventCase } = await eventReady(userId);
  if (!user) {
    res.status(404).json({ error: "Account not found." });
    return;
  }
  if (user.branchChoice !== "event") {
    res.status(403).json({ error: "The supernatural investigation is available only after choosing that door." });
    return;
  }
  if (!eventCase) {
    res.status(503).json({ error: "No supernatural case is currently available." });
    return;
  }
  let session = await EventSessionModel.findOne({ userId });
  if (!session) {
    const startedAt = new Date();
    try {
      session = await EventSessionModel.create({
        userId,
        caseId: eventCase.caseId,
        startedAt,
        expiresAt: new Date(startedAt.getTime() + Number(eventCase.durationSeconds) * 1000),
        focusRemaining: eventCase.focusTotal,
        monsterHp: eventCase.monsterHp,
      });
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      session = await EventSessionModel.findOne({ userId });
    }
  }
  if (!session) {
    res.status(500).json({ error: "The investigation could not be started." });
    return;
  }
  await expireIfNeeded(session);
  const caseForSession = await EventCaseModel.findOne({ caseId: session.caseId });
  if (!caseForSession) {
    res.status(410).json({ error: "This investigation is no longer available." });
    return;
  }
  res.status(201).json(StartEventSessionResponse.parse({
    available: true,
    message: session.status === "active" ? "The case is open. Your progress is saved automatically." : "This case has already been used.",
    session: sessionView(session, caseForSession),
  }));
});

router.post("/event/session/answer", requireNexoraAuth, async (req, res): Promise<void> => {
  const parsed = AnswerEventProblemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = authenticatedUserId(req);
  const session = await EventSessionModel.findOne({ userId });
  if (!session) {
    res.status(404).json({ error: "No investigation is in progress." });
    return;
  }
  if (await expireIfNeeded(session)) {
    res.status(410).json({ error: "The 60-minute investigation window has ended. Your progress remains saved." });
    return;
  }
  if (session.status !== "active") {
    res.status(409).json({ error: "This investigation is no longer active." });
    return;
  }
  const eventCase = await EventCaseModel.findOne({ caseId: session.caseId });
  if (!eventCase) {
    res.status(410).json({ error: "This investigation is no longer available." });
    return;
  }
  const leads = eventCase.leads as any[];
  const currentLeadIndex = Number(session.currentLeadIndex);
  const isFinale = currentLeadIndex >= leads.length;
  const step = isFinale
    ? (eventCase.finaleSteps as any[])[Number(session.finaleStep)]
    : leads[currentLeadIndex];
  if (!step || parsed.data.stepId !== step.id) {
    res.status(409).json({ error: "That answer does not match the current case step." });
    return;
  }
  const correct = parsed.data.answerIndex === step.correctAnswerIndex;
  const now = new Date();
  const filter: Record<string, unknown> = {
    _id: session._id,
    userId,
    status: "active",
    currentLeadIndex,
    finaleStep: session.finaleStep,
  };
  const update: Record<string, unknown> = {
    $push: {
      answerEvents: {
        stepId: step.id,
        answerIndex: parsed.data.answerIndex,
        correct,
        answeredAt: now,
      },
    },
  };
  if (!correct) {
    update.$inc = { wrongAnswers: 1 };
    update.$set = { focusRemaining: Math.max(0, Number(session.focusRemaining) - 1) };
  } else if (!isFinale) {
    update.$set = { currentLeadIndex: currentLeadIndex + 1 };
    update.$addToSet = { solvedLeadIds: step.id };
  } else {
    const nextFinaleStep = Number(session.finaleStep) + 1;
    const monsterHp = Math.max(0, Number(session.monsterHp) - Number(step.hpDamage));
    const finaleComplete = nextFinaleStep >= (eventCase.finaleSteps as any[]).length;
    update.$set = {
      finaleStep: nextFinaleStep,
      monsterHp,
      ...(finaleComplete ? { status: "completed", completedAt: now } : {}),
    };
  }
  const updated = await EventSessionModel.findOneAndUpdate(filter, update, { new: true });
  if (!updated) {
    res.status(409).json({ error: "This case step was already submitted. Continue from the saved board." });
    return;
  }
  let rankUp = false;
  let hunterRank = (await UserModel.findById(userId))?.hunterRank ?? "E";
  let xpAwarded = 0;
  if (updated.status === "completed") {
    const reward = await applyEventReward(updated, eventCase, userId);
    rankUp = reward.rankUp;
    hunterRank = reward.hunterRank;
    xpAwarded = Number(eventCase.rewardXp);
  }
  res.json(AnswerEventProblemResponse.parse({
    correct,
    explanation: step.explanation,
    focusRemaining: updated.focusRemaining,
    session: sessionView(updated, eventCase),
    rankUp,
    hunterRank,
    xpAwarded,
    rewardGranted: updated.rewardApplied,
    message: !correct
      ? "Not quite. You lost one Focus, but the case stays open; take another look."
      : updated.status === "completed"
        ? `Case closed. +${eventCase.rewardXp} XP, ${eventCase.rewardBadge}, and the ${eventCase.rewardTitle} title are yours.`
        : isFinale
          ? "The monster staggers. Work the next part to finish the case."
          : "The clue is yours. The next lead is on the board.",
  }));
});

export default router;

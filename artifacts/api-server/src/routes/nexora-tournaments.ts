import { Router, type IRouter } from "express";
import {
  AnswerTournamentRoundBody,
  AnswerTournamentRoundParams,
  AnswerTournamentRoundResponse,
  GetTournamentLeaderboardParams,
  GetTournamentLeaderboardResponse,
  GetTournamentsResponse,
  JoinTournamentParams,
  JoinTournamentResponse,
  StartTournamentRoundParams,
  StartTournamentRoundResponse,
} from "@workspace/api-zod";
import { authenticatedUserId, requireNexoraAuth } from "../middlewares/nexora-auth";
import {
  PaymentModel,
  QuestionModel,
  TournamentEntryModel,
  TournamentModel,
  UserModel,
} from "../lib/nexora-models";
import { hasArenaAccess } from "../lib/nexora-access";
import { paymentProvider } from "../lib/nexora-payments";

const router: IRouter = Router();
const fallbackRanks = ["E", "C", "A"];
const fallbackTitles = ["Foundation", "Ascension", "Apex"];
const questionsPerRound = 5;

function rankForXp(xp: number): string {
  if (xp >= 10_000) return "S";
  if (xp >= 6_000) return "A";
  if (xp >= 3_000) return "B";
  if (xp >= 1_500) return "C";
  if (xp >= 500) return "D";
  return "E";
}

function asId(raw: string | string[] | undefined): string {
  return Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
}

function roundRanks(tournament: any): string[] {
  return Array.isArray(tournament.roundRanks) && tournament.roundRanks.length
    ? tournament.roundRanks
    : fallbackRanks;
}

function questionResponse(tournament: any, entry: any, question: any, now = new Date()) {
  const startedAt = entry.roundStartedAt ? new Date(entry.roundStartedAt).getTime() : now.getTime();
  const seconds = Number(tournament.roundDurationSeconds ?? 300);
  return {
    tournamentId: String(tournament._id),
    roundNumber: entry.roundIndex + 1,
    totalRounds: roundRanks(tournament).length,
    roundTitle: fallbackTitles[entry.roundIndex] ?? `Round ${entry.roundIndex + 1}`,
    rank: roundRanks(tournament)[entry.roundIndex] ?? "E",
    timeRemainingSeconds: Math.max(0, seconds - Math.floor((now.getTime() - startedAt) / 1000)),
    questionId: String(question._id),
    questionNumber: entry.currentIndex + 1,
    totalQuestions: entry.questionIds.length,
    prompt: question.prompt,
    options: question.options,
    isBoss: entry.currentIndex === entry.questionIds.length - 1,
  };
}

async function expireTimedEntry(entry: any): Promise<void> {
  entry.completed = true;
  entry.completedAt = new Date();
  await entry.save();
}

router.get("/tournaments", requireNexoraAuth, async (req, res): Promise<void> => {
  const tournaments = await TournamentModel.find({ active: true }).sort({ startsAt: 1 });
  const userId = authenticatedUserId(req);
  const result = await Promise.all(tournaments.map(async (tournament: any) => {
    const participantFilter = {
      tournamentId: tournament._id,
      paymentStatus: tournament.paid ? "mock-approved" : "free",
    };
    const participants = await TournamentEntryModel.countDocuments(participantFilter);
    const pool = tournament.paid ? participants * tournament.entryFeeEtb : 0;
    const entry = await TournamentEntryModel.findOne({ tournamentId: tournament._id, userId });
    const payouts = !tournament.paid
      ? ["XP, rank badges, and 24 hours of Arena Pass access for finishing"]
      : participants <= 25
        ? [`1st: ${Math.floor(pool * 0.4)} ETB (40%)`, `2nd: ${Math.floor(pool * 0.2)} ETB (20%)`, `Nexora: ${Math.floor(pool * 0.4)} ETB (40%)`]
        : [`1st: ${Math.floor(pool * 0.35)} ETB (35%)`, `2nd: ${Math.floor(pool * 0.15)} ETB (15%)`, `3rd: ${Math.floor(pool * 0.1)} ETB (10%)`, `Nexora: ${Math.floor(pool * 0.4)} ETB (40%)`];
    return {
      id: String(tournament._id),
      name: tournament.name,
      subject: tournament.subject,
      paid: tournament.paid,
      entryFeeEtb: tournament.entryFeeEtb,
      participants,
      prizePoolEtb: pool,
      payoutBreakdown: payouts,
      startsAt: new Date(tournament.startsAt).toISOString(),
      joined: Boolean(entry),
      completed: Boolean(entry?.completed),
      totalRounds: roundRanks(tournament).length,
      roundDurationSeconds: tournament.roundDurationSeconds ?? 300,
    };
  }));
  res.json(GetTournamentsResponse.parse(result));
});

router.post("/tournaments/:tournamentId/join", requireNexoraAuth, async (req, res): Promise<void> => {
  const params = JoinTournamentParams.safeParse({ tournamentId: asId(req.params.tournamentId) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = authenticatedUserId(req);
  const tournament = await TournamentModel.findById(params.data.tournamentId);
  if (!tournament || !tournament.active) {
    res.status(404).json({ error: "Tournament not found." });
    return;
  }
  const user = await UserModel.findById(userId);
  if (tournament.paid && (!user || !hasArenaAccess(user))) {
    res.status(403).json({ error: "Arena Pass is required to enter paid tournaments." });
    return;
  }
  if (await TournamentEntryModel.exists({ tournamentId: tournament._id, userId })) {
    res.status(409).json({ error: "You're already entered in this tournament." });
    return;
  }
  let paymentStatus = "free";
  let message = "You're in. Good luck in the arena.";
  if (tournament.paid) {
    const payment = await paymentProvider.collect({
      userId,
      amountEtb: tournament.entryFeeEtb,
      purpose: `tournament-${String(tournament._id)}`,
    });
    paymentStatus = payment.status;
    message = "Mock payment recorded for this demo; no real funds were collected.";
    await PaymentModel.create({
      userId,
      purpose: `tournament-${String(tournament._id)}`,
      amountEtb: tournament.entryFeeEtb,
      provider: "mock",
      status: payment.status,
    });
  }
  await TournamentEntryModel.create({ tournamentId: tournament._id, userId, paymentStatus });
  res.json(JoinTournamentResponse.parse({
    tournamentId: String(tournament._id),
    joined: true,
    paymentStatus,
    message,
  }));
});

router.post("/tournaments/:tournamentId/rounds/start", requireNexoraAuth, async (req, res): Promise<void> => {
  const params = StartTournamentRoundParams.safeParse({ tournamentId: asId(req.params.tournamentId) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = authenticatedUserId(req);
  const tournament = await TournamentModel.findOne({ _id: params.data.tournamentId, active: true });
  if (!tournament) {
    res.status(404).json({ error: "Tournament not found." });
    return;
  }
  if (tournament.startsAt.getTime() > Date.now()) {
    res.status(409).json({ error: "This tournament has not opened yet." });
    return;
  }
  const entry = await TournamentEntryModel.findOne({ tournamentId: tournament._id, userId });
  if (!entry) {
    res.status(403).json({ error: "Join this tournament before starting a round." });
    return;
  }
  if (entry.completed) {
    res.status(409).json({ error: "Your tournament run is complete. Open the standings to see your position." });
    return;
  }
  const now = new Date();
  if (entry.roundStartedAt && entry.questionIds.length) {
    const elapsed = now.getTime() - new Date(entry.roundStartedAt).getTime();
    if (elapsed >= Number(tournament.roundDurationSeconds ?? 300) * 1000) {
      await expireTimedEntry(entry);
      res.status(410).json({ error: "The round timer expired. Your score is on the standings." });
      return;
    }
  }
  const ranks = roundRanks(tournament);
  if (entry.roundIndex >= ranks.length) {
    res.status(409).json({ error: "There are no remaining rounds in this tournament." });
    return;
  }
  if (!entry.questionIds.length) {
    const questions = await QuestionModel.aggregate([
      { $match: { subject: tournament.subject, rank: ranks[entry.roundIndex] } },
      { $sample: { size: questionsPerRound } },
      { $project: { _id: 1 } },
    ]);
    if (questions.length < questionsPerRound) {
      res.status(503).json({ error: "This tournament round is still being prepared." });
      return;
    }
    entry.questionIds = questions.map((question: any) => question._id) as any;
    entry.currentIndex = 0;
    entry.roundStartedAt = now;
    entry.questionStartedAt = now;
    entry.startedAt ??= now;
    await entry.save();
  } else if (!entry.questionStartedAt) {
    entry.questionStartedAt = now;
    await entry.save();
  }
  const question = await QuestionModel.findById(entry.questionIds[entry.currentIndex]);
  if (!question) {
    res.status(500).json({ error: "A tournament question is unavailable." });
    return;
  }
  res.json(StartTournamentRoundResponse.parse(questionResponse(tournament, entry, question, now)));
});

router.post("/tournaments/:tournamentId/rounds/answer", requireNexoraAuth, async (req, res): Promise<void> => {
  const params = AnswerTournamentRoundParams.safeParse({ tournamentId: asId(req.params.tournamentId) });
  const parsed = AnswerTournamentRoundBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = authenticatedUserId(req);
  const tournament = await TournamentModel.findOne({ _id: params.data.tournamentId, active: true });
  if (!tournament) {
    res.status(404).json({ error: "Tournament not found." });
    return;
  }
  const entry = await TournamentEntryModel.findOne({ tournamentId: tournament._id, userId });
  if (!entry || entry.completed || !entry.questionIds.length || !entry.roundStartedAt || !entry.questionStartedAt) {
    res.status(409).json({ error: "Start or resume your tournament round first." });
    return;
  }
  const now = new Date();
  if (now.getTime() - new Date(entry.roundStartedAt).getTime() >= Number(tournament.roundDurationSeconds ?? 300) * 1000) {
    await expireTimedEntry(entry);
    res.status(410).json({ error: "The round timer expired. Your score is on the standings." });
    return;
  }
  if (parsed.data.questionId !== String(entry.questionIds[entry.currentIndex])) {
    res.status(409).json({ error: "That question does not match your current tournament step." });
    return;
  }
  const question = await QuestionModel.findById(parsed.data.questionId).select("+correctAnswerIndex");
  if (!question) {
    res.status(500).json({ error: "The tournament question is unavailable." });
    return;
  }
  const correct = parsed.data.answerIndex === question.correctAnswerIndex;
  const elapsedMs = Math.max(500, now.getTime() - new Date(entry.questionStartedAt).getTime());
  const speedBonus = Math.max(0, 25 - Math.floor(elapsedMs / 2000));
  const pointsAwarded = correct ? 100 + entry.roundIndex * 25 + speedBonus : 0;
  const currentIndex = entry.currentIndex + 1;
  const answeredCount = entry.answeredCount + 1;
  const correctCount = entry.correctCount + (correct ? 1 : 0);
  const accuracy = Math.round((correctCount / answeredCount) * 100);
  const roundComplete = currentIndex >= entry.questionIds.length;
  const tournamentComplete = roundComplete && entry.roundIndex === roundRanks(tournament).length - 1;
  const updatedRoundIndex = roundComplete && !tournamentComplete ? entry.roundIndex + 1 : entry.roundIndex;
  const updatedCurrentIndex = roundComplete ? 0 : currentIndex;
  const updatedQuestionIds = roundComplete ? [] : entry.questionIds;
  const updatedEntry = await TournamentEntryModel.findOneAndUpdate(
    {
      _id: entry._id,
      roundIndex: entry.roundIndex,
      currentIndex: entry.currentIndex,
      completed: false,
    },
    {
      $set: {
        currentIndex: updatedCurrentIndex,
        roundIndex: updatedRoundIndex,
        questionIds: updatedQuestionIds,
        roundStartedAt: roundComplete && !tournamentComplete ? null : entry.roundStartedAt,
        questionStartedAt: roundComplete ? null : now,
        points: entry.points + pointsAwarded,
        totalTimeMs: entry.totalTimeMs + elapsedMs,
        correctCount,
        answeredCount,
        accuracy,
        ...(tournamentComplete && !tournament.paid ? { rankBadge: "Apex Finisher" } : {}),
        ...(tournamentComplete ? { completed: true, completedAt: now } : {}),
      },
    },
    { new: true },
  );
  if (!updatedEntry) {
    res.status(409).json({ error: "This answer was already resolved. Resume from the current round." });
    return;
  }
  let message = roundComplete && !tournamentComplete
    ? `Round ${entry.roundIndex + 1} cleared. The next round increases the difficulty.`
    : tournamentComplete
      ? "Tournament complete. Your result is now on the standings."
      : correct
        ? "Correct answer. Points recorded."
        : "Answer recorded. Use the explanation to prepare for the next question.";
  if (tournamentComplete && !tournament.paid) {
    const user = await UserModel.findById(userId);
    if (user) {
      const currentAccessUntil = user.arenaAccessUntil?.getTime() ?? 0;
      user.arenaAccessUntil = new Date(Math.max(Date.now(), currentAccessUntil) + 24 * 60 * 60 * 1000);
      const tournamentXp = Math.max(50, updatedEntry.points);
      user.xp += tournamentXp;
      user.level = Math.floor(user.xp / 500) + 1;
      user.hunterRank = rankForXp(user.xp);
      await user.save();
      message += ` You earned +${tournamentXp} XP, the Apex Finisher badge, and 24 hours of Arena Pass access.`;
    }
  }
  const nextQuestion = !roundComplete
    ? await QuestionModel.findById(updatedEntry.questionIds[updatedEntry.currentIndex])
    : null;
  res.json(AnswerTournamentRoundResponse.parse({
    correct,
    explanation: question.explanation,
    pointsAwarded,
    totalPoints: updatedEntry.points,
    accuracy,
    roundComplete,
    tournamentComplete,
    nextQuestion: nextQuestion ? questionResponse(tournament, updatedEntry, nextQuestion, now) : null,
    message,
  }));
});

router.get("/tournaments/:tournamentId/leaderboard", requireNexoraAuth, async (req, res): Promise<void> => {
  const params = GetTournamentLeaderboardParams.safeParse({ tournamentId: asId(req.params.tournamentId) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const tournament = await TournamentModel.findById(params.data.tournamentId);
  if (!tournament) {
    res.status(404).json({ error: "Tournament not found." });
    return;
  }
  const entries = await TournamentEntryModel.find({ tournamentId: tournament._id }).sort({
    points: -1,
    totalTimeMs: 1,
    accuracy: -1,
  }).limit(100);
  const users = await UserModel.find({ _id: { $in: entries.map((entry: any) => entry.userId) } });
  const byId = new Map(users.map((user: any) => [String(user._id), user]));
  const rows = entries.map((entry: any, index: number) => {
    const user: any = byId.get(String(entry.userId));
    return {
      position: index + 1,
      name: user?.name ?? "Hunter",
      school: user?.school ?? "",
      points: entry.points,
      timeSeconds: Math.round(entry.totalTimeMs / 1000),
      accuracy: entry.accuracy,
      completed: Boolean(entry.completed),
      rankBadge: entry.rankBadge ?? null,
    };
  });
  res.json(GetTournamentLeaderboardResponse.parse(rows));
});

export default router;

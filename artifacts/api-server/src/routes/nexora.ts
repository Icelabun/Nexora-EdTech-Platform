import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import OpenAI from "openai";
import rateLimit from "express-rate-limit";
import { Router, type IRouter, type Request } from "express";
import {
  AbandonDungeonParams,
  AbandonDungeonResponse,
  AbandonDungeonBody,
  PauseDungeonParams,
  PauseDungeonResponse,
  ResumeDungeonParams,
  ResumeDungeonResponse,
  AnswerDungeonQuestionBody,
  AnswerDungeonQuestionParams,
  AnswerDungeonQuestionResponse,
  AskTutorBody,
  AskTutorResponse,
  ChooseDungeonBranchBody,
  ChooseDungeonBranchResponse,
  CreateAssignmentBody,
  CreateAssignmentResponse,
  CreateClassBody,
  CreateClassResponse,
  GetClassStudentsParams,
  GetClassStudentsResponse,
  GetClassesResponse,
  GetAssignmentsResponse,
  GetCurrentUserResponse,
  GetDashboardResponse,
  GetLeaderboardsQueryParams,
  GetLeaderboardsResponse,
  GetSubjectsResponse,
  JoinClassBody,
  JoinClassResponse,
  LoginBody,
  LoginResponse,
  LogoutResponse,
  RegisterBody,
  RegisterResponse,
  SaveOnboardingBody,
  SaveOnboardingResponse,
  StartDungeonBody,
  StartDungeonResponse,
} from "@workspace/api-zod";
import {
  authenticatedUserId,
  type AuthenticatedRequest,
  requireNexoraAuth,
  requireNexoraRole,
  setSessionCookie,
  signSession,
} from "../middlewares/nexora-auth";
import {
  AITutorSessionModel,
  AssignmentModel,
  ClassModel,
  DungeonAuditEventModel,
  DungeonRunModel,
  QuestionModel,
  SubjectModel,
  SubscriptionModel,
  UserModel,
} from "../lib/nexora-models";
import { sendAssignmentNotification, sendWelcomeEmail } from "../lib/nexora-email";
import { hasArenaAccess } from "../lib/nexora-access";

const router: IRouter = Router();
const subjects = ["Math", "Physics", "Chemistry", "Biology", "English", "Aptitude"];
const ranks = ["E", "D", "C", "B", "A", "S"];
const dailyFreeRuns = 3;
const dungeonSize = 5;
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
});

function userPayload(user: any) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    grade: user.grade,
    school: user.school ?? "",
    xp: user.xp ?? 0,
    level: user.level ?? 1,
    hunterRank: user.hunterRank ?? "E",
    streak: user.streak ?? 0,
    weakestSubjects: user.weakestSubjects ?? [],
    subscriptionTier: user.subscriptionTier ?? "free",
    arenaAccessUntil: user.arenaAccessUntil?.toISOString() ?? null,
    onboardingComplete: Boolean(user.onboardingComplete),
    branchUnlocked: Boolean(user.branchUnlocked),
    branchChoice: user.branchChoice ?? null,
  };
}

function questionPayload(run: any, question: any, index: number, enemyHp = 100) {
  const now = Date.now();
  const isPaused = Boolean(run.pausedAt && run.pauseExpiresAt && new Date(run.pauseExpiresAt).getTime() > now);
  const timeRemainingSeconds = run.mode === "quick"
    ? Math.max(0, isPaused
      ? Number(run.pausedRemainingSeconds ?? 0)
      : Math.ceil((new Date(run.expiresAt).getTime() - now) / 1000))
    : 0;
  return {
    runId: String(run._id),
    subject: run.subject,
    rank: run.rank,
    mode: run.mode ?? "standard",
    questionId: String(question._id),
    prompt: question.prompt,
    options: question.options,
    questionNumber: index + 1,
    totalQuestions: run.questionIds.length,
    isBoss: index === run.questionIds.length - 1,
    playerHp: run.playerHp,
    enemyHp,
    expiresAt: run.expiresAt?.toISOString() ?? null,
    timeRemainingSeconds,
    pauseUsed: Boolean(run.pauseUsed),
    paused: isPaused,
    pauseExpiresAt: isPaused ? run.pauseExpiresAt.toISOString() : null,
  };
}

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

function authRole(req: Request): string | undefined {
  return (req as AuthenticatedRequest).auth?.role;
}

function subjectMap(user: any): Record<string, number> {
  const value = user.subjectMastery;
  if (value instanceof Map) return Object.fromEntries(value.entries());
  return value && typeof value === "object" ? value : {};
}

router.post("/auth/register", authLimiter, async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const email = parsed.data.email.toLowerCase().trim();
  if (await UserModel.exists({ email })) {
    res.status(409).json({ error: "An account already exists for that email." });
    return;
  }
  const user = await UserModel.create({
    name: parsed.data.name.trim(),
    email,
    passwordHash: await bcrypt.hash(parsed.data.password, 12),
    role: parsed.data.role === "teacher" ? "teacher" : "student",
    grade: parsed.data.grade || 12,
    school: parsed.data.school.trim(),
  });
  await SubscriptionModel.updateOne(
    { userId: user._id },
    { $setOnInsert: { userId: user._id, tier: "free", priceEtb: 0, billingStatus: "free" } },
    { upsert: true },
  );
  setSessionCookie(res, signSession(String(user._id), user.role));
  void sendWelcomeEmail(user.email, user.name).catch((error: unknown) => {
    req.log.warn({ err: error }, "Could not send welcome email");
  });
  res.status(201).json(RegisterResponse.parse(userPayload(user)));
});

router.post("/auth/login", authLimiter, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = await UserModel.findOne({ email: parsed.data.email.toLowerCase().trim() }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: "Email or password is incorrect." });
    return;
  }
  setSessionCookie(res, signSession(String(user._id), user.role));
  res.json(LoginResponse.parse(userPayload(user)));
});

router.post("/auth/logout", (_req, res) => {
  res.clearCookie("nexora_session", { path: "/" });
  res.json(LogoutResponse.parse({ message: "Signed out." }));
});

router.get("/auth/me", requireNexoraAuth, async (req, res): Promise<void> => {
  const user = await UserModel.findById(authenticatedUserId(req));
  if (!user) {
    res.status(401).json({ error: "Account not found. Please sign in again." });
    return;
  }
  res.json(GetCurrentUserResponse.parse(userPayload(user)));
});

router.get("/subjects", async (req, res): Promise<void> => {
  const rows = await SubjectModel.find({ name: { $in: subjects } }).sort({ name: 1 });
  const mastery: Record<string, number> = {};
  const byName = new Map(rows.map((row: any) => [row.name, row.questionCount]));
  const result = subjects.map((name) => ({
    id: name,
    name,
    questionCount: byName.get(name) ?? 0,
    mastery: Number(mastery[name] ?? 0),
  }));
  res.json(GetSubjectsResponse.parse(result));
});

router.post("/onboarding", requireNexoraAuth, async (req, res): Promise<void> => {
  const parsed = SaveOnboardingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const selected = [...new Set(parsed.data.weakestSubjects)];
  if (selected.some((subject) => !subjects.includes(subject))) {
    res.status(400).json({ error: "Choose from the available EUEE subjects." });
    return;
  }
  const user = await UserModel.findByIdAndUpdate(
    authenticatedUserId(req),
    { $set: { weakestSubjects: selected, onboardingComplete: true } },
    { new: true },
  );
  if (!user) {
    res.status(404).json({ error: "Account not found." });
    return;
  }
  res.json(SaveOnboardingResponse.parse(userPayload(user)));
});

router.get("/dashboard", requireNexoraAuth, async (req, res): Promise<void> => {
  const user = await UserModel.findById(authenticatedUserId(req));
  if (!user) {
    res.status(404).json({ error: "Account not found." });
    return;
  }
  const recent = await DungeonRunModel.find({ userId: user._id }).sort({ createdAt: -1 }).limit(5);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const runsToday = await DungeonRunModel.countDocuments({ userId: user._id, createdAt: { $gte: today } });
  const mastery = subjectMap(user);
  const response = {
    user: userPayload(user),
    subjectMastery: subjects.map((subject) => ({ subject, mastery: Number(mastery[subject] ?? 0) })),
    recentRuns: recent.map((run: any) => ({
      id: String(run._id),
      subject: run.subject,
      rank: run.rank,
      accuracy: run.accuracy,
      xpEarned: run.xpEarned,
      completedAt: (run.completedAt ?? run.createdAt).toISOString(),
    })),
    dailyRunsRemaining: hasArenaAccess(user) ? 999 : Math.max(0, dailyFreeRuns - runsToday),
  };
  res.json(GetDashboardResponse.parse(response));
});

router.post("/dungeons", requireNexoraAuth, requireNexoraRole("student", "teacher", "admin"), async (req, res): Promise<void> => {
  const parsed = StartDungeonBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!subjects.includes(parsed.data.subject) || !ranks.includes(parsed.data.rank)) {
    res.status(400).json({ error: "Choose a valid EUEE subject and hunter rank." });
    return;
  }
  const userId = authenticatedUserId(req);
  const user = await UserModel.findById(userId);
  if (!user) {
    res.status(404).json({ error: "Account not found." });
    return;
  }
  if (!hasArenaAccess(user)) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayRuns = await DungeonRunModel.countDocuments({ userId, createdAt: { $gte: today } });
    if (todayRuns >= dailyFreeRuns) {
      res.status(403).json({ error: "You've used today's free dungeon runs. Arena Pass unlocks unlimited runs." });
      return;
    }
  }
  const mode = parsed.data.mode ?? "standard";
  const questions = await QuestionModel.aggregate([
    { $match: { subject: parsed.data.subject, rank: parsed.data.rank } },
    { $sample: { size: mode === "quick" ? 5 : dungeonSize } },
    { $project: { prompt: 1, options: 1, explanation: 1, correctAnswerIndex: 1 } },
  ]);
  if (questions.length < dungeonSize) {
    res.status(503).json({ error: "This dungeon is still being prepared. Try another subject or rank." });
    return;
  }
  const run = await DungeonRunModel.create({
    userId,
    subject: parsed.data.subject,
    rank: parsed.data.rank,
    mode,
    ...(mode === "quick" ? { expiresAt: new Date(Date.now() + 5 * 60 * 1000) } : {}),
    questionIds: questions.map((question: any) => question._id),
  });
  const firstQuestion = await QuestionModel.findById(run.questionIds[0]);
  res.status(201).json(StartDungeonResponse.parse(questionPayload(run, firstQuestion, 0)));
});

router.post("/dungeons/:runId/answer", requireNexoraAuth, async (req, res): Promise<void> => {
  const params = AnswerDungeonQuestionParams.safeParse({ runId: asId(req.params.runId) });
  const parsed = AnswerDungeonQuestionBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = authenticatedUserId(req);
  const run = await DungeonRunModel.findOne({ _id: params.data.runId, userId });
  if (!run) {
    res.status(404).json({ error: "Dungeon run not found." });
    return;
  }
  if (run.status !== "active" || run.currentIndex >= run.questionIds.length) {
    res.status(409).json({ error: "This dungeon run is no longer active." });
    return;
  }
  const now = new Date();
  if (run.pausedAt && run.pauseExpiresAt && new Date(run.pauseExpiresAt).getTime() > now.getTime()) {
    res.status(409).json({ error: "This run is paused. Resume it before answering." });
    return;
  }
  if (run.pausedAt && run.pauseExpiresAt && new Date(run.pauseExpiresAt).getTime() <= now.getTime()) {
    const elapsedPauseMs = Math.min(60_000, Math.max(0, now.getTime() - new Date(run.pausedAt).getTime()));
    const expiresAt = run.expiresAt
      ? new Date(new Date(run.expiresAt).getTime() + elapsedPauseMs)
      : null;
    await DungeonRunModel.updateOne(
      { _id: run._id, userId, status: "active", pausedAt: run.pausedAt },
      { $set: { pausedAt: null, pauseExpiresAt: null, ...(expiresAt ? { expiresAt } : {}) } },
    );
    await DungeonAuditEventModel.create({ userId, runId: run._id, eventType: "resume", reason: "pause-time-limit" });
    run.pausedAt = null;
    run.pauseExpiresAt = null;
    if (expiresAt) run.expiresAt = expiresAt;
  }
  if (run.mode === "quick" && run.expiresAt && new Date(run.expiresAt).getTime() <= now.getTime()) {
    await DungeonRunModel.updateOne(
      { _id: run._id, userId, status: "active" },
      { $set: { status: "failed", completedAt: now } },
    );
    res.status(410).json({ error: "The five-minute Quick Dungeon timer expired." });
    return;
  }
  const expectedQuestionId = String(run.questionIds[run.currentIndex]);
  if (parsed.data.questionId !== expectedQuestionId) {
    res.status(409).json({ error: "That question does not belong to the current step of this run." });
    return;
  }
  const question = await QuestionModel.findById(expectedQuestionId).select("+correctAnswerIndex");
  if (!question) {
    res.status(500).json({ error: "The question for this run is unavailable." });
    return;
  }
  const correct = parsed.data.answerIndex === question.correctAnswerIndex;
  const answeredCount = run.answeredCount + 1;
  const correctCount = run.correctCount + (correct ? 1 : 0);
  const currentIndex = run.currentIndex + 1;
  const playerHp = Math.max(0, run.playerHp - (correct ? 0 : 25));
  const enemyHp = correct ? 0 : 100;
  const accuracy = Math.round((correctCount / answeredCount) * 100);
  const completed = currentIndex >= run.questionIds.length || playerHp <= 0;
  const succeeded = completed && playerHp > 0 && correct && currentIndex === run.questionIds.length;
  const baseXp = correct ? 20 + Math.max(0, ranks.indexOf(run.rank) * 5) : 0;
  const awardedXp = baseXp + (succeeded ? 25 : 0);
  const xpEarned = run.xpEarned + awardedXp;
  const updatedRun = await DungeonRunModel.findOneAndUpdate(
    { _id: run._id, userId, status: "active", currentIndex: run.currentIndex },
    {
      $set: {
        currentIndex,
        playerHp,
        enemyHp,
        correctCount,
        answeredCount,
        xpEarned,
        accuracy,
        ...(completed ? {
          status: succeeded ? "success" : "failed",
          completedAt: new Date(),
          ...(succeeded ? { bossDefeated: true } : {}),
        } : {}),
      },
      ...(!correct
        ? {
            $push: {
              missedQuestions: {
                questionId: question._id,
                selectedAnswerIndex: parsed.data.answerIndex,
                correctAnswerIndex: question.correctAnswerIndex,
                answeredAt: new Date(),
              },
            },
          }
        : {}),
    },
    { new: true },
  );
  if (!updatedRun) {
    res.status(409).json({ error: "This question was already resolved. Continue from the latest step." });
    return;
  }

  const user = await UserModel.findById(userId);
  if (!user) {
    res.status(404).json({ error: "Account not found." });
    return;
  }
  const oldLevel = user.level;
  const previousHunterRank = user.hunterRank ?? "E";
  user.xp += awardedXp;
  user.level = Math.floor(user.xp / 500) + 1;
  const levelUp = user.level > oldLevel;
  let branchUnlocked = false;
  let hunterRank = rankForXp(user.xp);
  user.hunterRank = hunterRank;
  const rankUp = hunterRank !== previousHunterRank;
  const currentDay = new Date(now);
  currentDay.setHours(0, 0, 0, 0);
  if (user.lastActiveAt) {
    const previousDay = new Date(user.lastActiveAt);
    previousDay.setHours(0, 0, 0, 0);
    const dayDifference = Math.floor((currentDay.getTime() - previousDay.getTime()) / 86_400_000);
    if (dayDifference === 1) user.streak += 1;
    else if (dayDifference > 1) user.streak = 1;
  } else {
    user.streak = 1;
  }
  user.lastActiveAt = now;
  if (completed && succeeded) {
    const mastery = subjectMap(user);
    mastery[run.subject] = Math.min(100, Math.round(Number(mastery[run.subject] ?? 0) + accuracy * 0.1));
    user.subjectMastery = mastery as any;
    if (updatedRun.bossDefeated && accuracy >= 95 && !user.branchUnlocked && !user.branchChoice) {
      user.branchUnlocked = true;
      branchUnlocked = true;
    }
  }
  await user.save();

  const nextQuestion =
    !completed && currentIndex < run.questionIds.length
      ? await QuestionModel.findById(updatedRun.questionIds[currentIndex])
      : null;
  const response = {
    correct,
    explanation: question.explanation,
    playerHp,
    enemyHp,
    xpEarned: awardedXp,
    completed,
    accuracy,
    levelUp,
    hunterRank,
    previousHunterRank,
    rankUp,
    branchUnlocked,
    nextQuestion: nextQuestion ? questionPayload(updatedRun, nextQuestion, currentIndex) : null,
  };
  res.json(AnswerDungeonQuestionResponse.parse(response));
});

router.post("/dungeons/:runId/abandon", requireNexoraAuth, async (req, res): Promise<void> => {
  const params = AbandonDungeonParams.safeParse({ runId: asId(req.params.runId) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsedReason = AbandonDungeonBody.safeParse(req.body ?? {});
  if (!parsedReason.success) {
    res.status(400).json({ error: parsedReason.error.message });
    return;
  }
  const reason = parsedReason.data.reason ?? "manual";
  const userId = authenticatedUserId(req);
  const run = await DungeonRunModel.findOneAndUpdate(
    { _id: params.data.runId, userId, status: "active" },
    { $set: { status: reason === "timer-expired" ? "failed" : "abandoned", completedAt: new Date() } },
  );
  if (!run) {
    res.status(404).json({ error: "Active dungeon run not found." });
    return;
  }
  await DungeonAuditEventModel.create({ userId, runId: run._id, eventType: "reset", reason });
  res.json(AbandonDungeonResponse.parse({ message: "Dungeon reset. Leaving the active session ends this run." }));
});

router.post("/dungeons/:runId/pause", requireNexoraAuth, async (req, res): Promise<void> => {
  const params = PauseDungeonParams.safeParse({ runId: asId(req.params.runId) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = authenticatedUserId(req);
  const run = await DungeonRunModel.findOne({ _id: params.data.runId, userId });
  if (!run || run.status !== "active") {
    res.status(404).json({ error: "Active dungeon run not found." });
    return;
  }
  const now = new Date();
  if (run.pausedAt && run.pauseExpiresAt && new Date(run.pauseExpiresAt).getTime() > now.getTime()) {
    res.json(PauseDungeonResponse.parse({
      paused: true,
      pauseUsed: true,
      pauseExpiresAt: run.pauseExpiresAt.toISOString(),
      timeRemainingSeconds: run.mode === "quick" ? Number(run.pausedRemainingSeconds) : 0,
    }));
    return;
  }
  if (run.pauseUsed) {
    res.status(409).json({ error: "This run's one free pause has already been used." });
    return;
  }
  if (run.mode === "quick" && run.expiresAt && run.expiresAt.getTime() <= now.getTime()) {
    res.status(410).json({ error: "The five-minute Quick Dungeon timer expired." });
    return;
  }
  const remainingSeconds = run.mode === "quick" && run.expiresAt
    ? Math.max(0, Math.ceil((run.expiresAt.getTime() - now.getTime()) / 1000))
    : 0;
  const pauseExpiresAt = new Date(now.getTime() + 60_000);
  const updated = await DungeonRunModel.findOneAndUpdate(
    { _id: run._id, userId, status: "active", pauseUsed: false, pausedAt: null },
    {
      $set: {
        pauseUsed: true,
        pausedAt: now,
        pauseExpiresAt,
        pausedRemainingSeconds: remainingSeconds,
      },
    },
    { new: true },
  );
  if (!updated) {
    res.status(409).json({ error: "The pause could not be started. Refresh the run state and try again." });
    return;
  }
  await DungeonAuditEventModel.create({ userId, runId: run._id, eventType: "pause", reason: "one-time-pause" });
  res.json(PauseDungeonResponse.parse({
    paused: true,
    pauseUsed: true,
    pauseExpiresAt: pauseExpiresAt.toISOString(),
    timeRemainingSeconds: remainingSeconds,
  }));
});

router.post("/dungeons/:runId/resume", requireNexoraAuth, async (req, res): Promise<void> => {
  const params = ResumeDungeonParams.safeParse({ runId: asId(req.params.runId) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const userId = authenticatedUserId(req);
  const run = await DungeonRunModel.findOne({ _id: params.data.runId, userId, status: "active" });
  if (!run) {
    res.status(404).json({ error: "Active dungeon run not found." });
    return;
  }
  if (!run.pausedAt || !run.pauseExpiresAt) {
    res.status(409).json({ error: "This run is not paused." });
    return;
  }
  const now = new Date();
  const pauseMs = Math.min(60_000, Math.max(0, now.getTime() - run.pausedAt.getTime()));
  const expiresAt = run.expiresAt
    ? new Date(run.expiresAt.getTime() + pauseMs)
    : null;
  const updated = await DungeonRunModel.findOneAndUpdate(
    { _id: run._id, userId, status: "active", pausedAt: run.pausedAt },
    {
      $set: {
        pausedAt: null,
        pauseExpiresAt: null,
        ...(expiresAt ? { expiresAt } : {}),
      },
    },
    { new: true },
  );
  if (!updated) {
    res.status(409).json({ error: "This run was already resumed." });
    return;
  }
  await DungeonAuditEventModel.create({
    userId,
    runId: run._id,
    eventType: "resume",
    reason: now.getTime() >= run.pauseExpiresAt.getTime() ? "pause-time-limit" : "student-resume",
  });
  const expired = updated.mode === "quick" && updated.expiresAt && updated.expiresAt.getTime() <= now.getTime();
  if (expired) {
    await DungeonRunModel.updateOne({ _id: updated._id, status: "active" }, { $set: { status: "failed", completedAt: now } });
  }
  res.json(ResumeDungeonResponse.parse({
    paused: false,
    pauseUsed: true,
    pauseExpiresAt: null,
    timeRemainingSeconds: expired || !updated.expiresAt
      ? 0
      : Math.max(0, Math.ceil((updated.expiresAt.getTime() - now.getTime()) / 1000)),
  }));
});

router.post("/dungeons/branch-choice", requireNexoraAuth, async (req, res): Promise<void> => {
  const parsed = ChooseDungeonBranchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const user = await UserModel.findById(authenticatedUserId(req));
  if (!user?.branchUnlocked || user.branchChoice) {
    res.status(409).json({ error: "The Two Doors choice is not available." });
    return;
  }
  user.branchChoice = parsed.data.choice;
  await user.save();
  res.json(ChooseDungeonBranchResponse.parse({
    message: parsed.data.choice === "event" ? "The investigation path is open." : "The Solo Leveling path continues.",
  }));
});

router.get("/leaderboards", async (req, res): Promise<void> => {
  const parsed = GetLeaderboardsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const users = await UserModel.find({ role: "student" }).sort({ xp: -1 }).limit(200);
  const filtered = parsed.data.subject
    ? users.filter((user: any) => Number(subjectMap(user)[parsed.data.subject!] ?? 0) > 0)
    : users;
  const response = filtered.slice(0, 50).map((user: any, index: number) => ({
    position: index + 1,
    name: user.name,
    school: user.school ?? "",
    xp: user.xp,
    hunterRank: user.hunterRank,
  }));
  res.json(GetLeaderboardsResponse.parse(response));
});

const tutorRequests = new Map<string, { count: number; resetAt: number }>();
router.post("/ai/tutor", requireNexoraAuth, async (req, res): Promise<void> => {
  const parsed = AskTutorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = authenticatedUserId(req);
  const now = Date.now();
  const bucket = tutorRequests.get(userId);
  if (bucket && bucket.resetAt > now && bucket.count >= 12) {
    res.status(429).json({ error: "Tutor break: you can ask up to 12 questions each minute." });
    return;
  }
  tutorRequests.set(userId, bucket && bucket.resetAt > now
    ? { count: bucket.count + 1, resetAt: bucket.resetAt }
    : { count: 1, resetAt: now + 60_000 });
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "The AI tutor is not configured yet." });
    return;
  }
  const user = await UserModel.findById(userId);
  if (user && !hasArenaAccess(user)) {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const questionsToday = await AITutorSessionModel.countDocuments({ userId, createdAt: { $gte: midnight } });
    if (questionsToday >= 8) {
      res.status(403).json({ error: "You've used today's basic tutor limit. Arena Pass unlocks more tutor sessions." });
      return;
    }
  }
  const client = new OpenAI({ apiKey });
  const recentRuns = await DungeonRunModel.find({ userId })
    .sort({ createdAt: -1 })
    .limit(3)
    .select("subject rank missedQuestions");
  const missed = recentRuns.flatMap((run: any) =>
    (run.missedQuestions ?? []).map((miss: any) => ({
      questionId: miss.questionId,
      selectedAnswerIndex: miss.selectedAnswerIndex,
      correctAnswerIndex: miss.correctAnswerIndex,
      subject: run.subject,
      rank: run.rank,
    })),
  ).slice(0, 8);
  const missedQuestionIds = missed.map((miss: any) => miss.questionId);
  const missedQuestions = missedQuestionIds.length
    ? await QuestionModel.find({ _id: { $in: missedQuestionIds } }).select("+correctAnswerIndex")
    : [];
  const missedQuestionById = new Map(missedQuestions.map((question: any) => [String(question._id), question]));
  const studyFeedback = missed.map((miss: any) => {
    const question: any = missedQuestionById.get(String(miss.questionId));
    if (!question) return "";
    return `${miss.subject} (${miss.rank}-Rank): ${question.prompt} Student chose “${question.options[miss.selectedAnswerIndex]}”; correct answer: “${question.options[miss.correctAnswerIndex]}”. Explanation: ${question.explanation}`;
  }).filter(Boolean).join("\n");
  const prompt = [
    parsed.data.message,
    parsed.data.subject ? `Subject: ${parsed.data.subject}.` : "",
    parsed.data.context ? `Learning context: ${parsed.data.context}.` : "",
  ].filter(Boolean).join("\n");
  const completion = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    max_tokens: 900,
    messages: [
      {
        role: "system",
        content: `You are Nexora's supportive game master and Grade 12 EUEE tutor. Explain concepts step by step, use clear examples suited to Ethiopian Grade 12, encourage effort without pressure, and give personalized feedback after dungeon runs. The student's name is ${user?.name ?? "Hunter"}. Their focus subjects are ${(user?.weakestSubjects ?? []).join(", ") || "not yet selected"}. When useful, refer to these recent missed questions and explain the correction gently:\n${studyFeedback || "No missed answers are recorded yet."}\nBe accurate, concise, and never invent exam policies.`,
      },
      { role: "user", content: prompt },
    ],
  });
  const answer = completion.choices[0]?.message?.content?.trim() || "I couldn't form a clear answer. Try asking in a different way.";
  await AITutorSessionModel.create({
    userId,
    subject: parsed.data.subject ?? "",
    messages: [{ role: "user", content: parsed.data.message }, { role: "assistant", content: answer }],
  });
  res.json(AskTutorResponse.parse({ answer }));
});

router.get("/classes", requireNexoraAuth, requireNexoraRole("teacher", "admin"), async (req, res): Promise<void> => {
  const classes = await ClassModel.find({ teacherId: authenticatedUserId(req) });
  const result = await Promise.all(classes.map(async (room: any) => {
    const students = await UserModel.find({ _id: { $in: room.students } });
    const averages = students.map((student: any) => {
      const values = Object.values(subjectMap(student)) as number[];
      return values.length ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : 0;
    });
    return {
      id: String(room._id),
      name: room.name,
      joinCode: room.joinCode,
      studentCount: students.length,
      averageMastery: averages.length ? Math.round(averages.reduce((sum, value) => sum + value, 0) / averages.length) : 0,
    };
  }));
  res.json(GetClassesResponse.parse(result));
});

router.post("/classes", requireNexoraAuth, requireNexoraRole("teacher", "admin"), async (req, res): Promise<void> => {
  const parsed = CreateClassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const room = await ClassModel.create({
    teacherId: authenticatedUserId(req),
    name: parsed.data.name.trim(),
    joinCode: randomBytes(4).toString("hex").slice(0, 6).toUpperCase(),
  });
  res.status(201).json(CreateClassResponse.parse({
    id: String(room._id),
    name: room.name,
    joinCode: room.joinCode,
    studentCount: 0,
    averageMastery: 0,
  }));
});

router.post("/classes/join", requireNexoraAuth, requireNexoraRole("student"), async (req, res): Promise<void> => {
  const parsed = JoinClassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const room = await ClassModel.findOne({ joinCode: parsed.data.joinCode.toUpperCase().trim() });
  if (!room) {
    res.status(404).json({ error: "That class code wasn't found." });
    return;
  }
  const userId = authenticatedUserId(req);
  if (!room.students.some((student: any) => String(student) === userId)) {
    room.students.push(userId as any);
    await room.save();
    await UserModel.findByIdAndUpdate(userId, { $addToSet: { classIds: room._id } });
  }
  const students = await UserModel.find({ _id: { $in: room.students } });
  const averages = students.flatMap((student: any) => Object.values(subjectMap(student)) as number[]);
  const averageMastery = averages.length
    ? Math.round(averages.reduce((sum, value) => sum + Number(value), 0) / averages.length)
    : 0;
  res.json(JoinClassResponse.parse({
    id: String(room._id),
    name: room.name,
    joinCode: room.joinCode,
    studentCount: students.length,
    averageMastery,
  }));
});

router.get("/classes/:classId/students", requireNexoraAuth, requireNexoraRole("teacher", "admin"), async (req, res): Promise<void> => {
  const params = GetClassStudentsParams.safeParse({ classId: asId(req.params.classId) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const room = await ClassModel.findOne({
    _id: params.data.classId,
    ...(authRole(req) === "admin" ? {} : { teacherId: authenticatedUserId(req) }),
  });
  if (!room) {
    res.status(404).json({ error: "Class not found." });
    return;
  }
  const students = await UserModel.find({ _id: { $in: room.students } }).sort({ xp: -1 });
  res.json(GetClassStudentsResponse.parse(students.map((student: any) => ({
    id: String(student._id),
    name: student.name,
    school: student.school ?? "",
    xp: student.xp,
    hunterRank: student.hunterRank,
    subjectMastery: subjectMap(student),
  }))));
});

router.get("/assignments", requireNexoraAuth, async (req, res): Promise<void> => {
  const userId = authenticatedUserId(req);
  const role = authRole(req);
  const userClasses = role === "admin"
    ? await ClassModel.find({}).select("_id name")
    : role === "teacher"
      ? await ClassModel.find({ teacherId: userId }).select("_id name")
      : await ClassModel.find({ students: userId }).select("_id name");
  const classNames = new Map((userClasses as any[]).map((room) => [String(room._id), room.name]));
  const assignments = await AssignmentModel.find({
    classId: { $in: userClasses.map((room: any) => room._id) },
    ...(role === "admin" ? {} : role === "teacher" ? { teacherId: userId } : {}),
  }).sort({ dueAt: 1 });
  res.json(GetAssignmentsResponse.parse(assignments.map((assignment: any) => ({
    id: String(assignment._id),
    title: assignment.title,
    classId: String(assignment.classId),
    className: classNames.get(String(assignment.classId)) ?? "Class",
    subject: assignment.subject,
    rank: assignment.rank,
    dueAt: assignment.dueAt.toISOString(),
  }))));
});

router.post("/assignments", requireNexoraAuth, requireNexoraRole("teacher", "admin"), async (req, res): Promise<void> => {
  const parsed = CreateAssignmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const dueAt = new Date(parsed.data.dueAt);
  if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= Date.now()) {
    res.status(400).json({ error: "Choose a due date in the future." });
    return;
  }
  const room = await ClassModel.findOne({
    _id: parsed.data.classId,
    ...(authRole(req) === "admin" ? {} : { teacherId: authenticatedUserId(req) }),
  });
  if (!room) {
    res.status(404).json({ error: "Class not found." });
    return;
  }
  const assignment = await AssignmentModel.create({
    ...parsed.data,
    teacherId: authenticatedUserId(req),
    dueAt,
  });
  const learners = await UserModel.find({ _id: { $in: room.students } }).select("email");
  for (const learner of learners as any[]) {
    void sendAssignmentNotification(learner.email, assignment.title, dueAt).catch((error: unknown) => {
      req.log.warn({ err: error }, "Could not send assignment notification");
    });
  }
  res.status(201).json(CreateAssignmentResponse.parse({
    id: String(assignment._id),
    title: assignment.title,
    classId: String(assignment.classId),
    subject: assignment.subject,
    rank: assignment.rank,
    dueAt: assignment.dueAt.toISOString(),
  }));
});

export default router;

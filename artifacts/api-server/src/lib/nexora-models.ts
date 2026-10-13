import mongoose from "mongoose";

const { model, models, Schema } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["student", "teacher", "admin"], default: "student" },
    grade: { type: Number, default: 12 },
    school: { type: String, default: "" },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    hunterRank: { type: String, default: "E" },
    streak: { type: Number, default: 0 },
    lastActiveAt: { type: Date, default: null },
    weakestSubjects: { type: [String], default: [] },
    subjectMastery: { type: Map, of: Number, default: {} },
    subscriptionTier: { type: String, enum: ["free", "arena", "institution"], default: "free" },
    arenaAccessUntil: { type: Date, default: null },
    onboardingComplete: { type: Boolean, default: false },
    branchUnlocked: { type: Boolean, default: false },
    branchChoice: { type: String, enum: ["solo", "event", null], default: null },
    dailyRewardDate: { type: String, default: null },
    dailyRewardClaimedAt: { type: Date, default: null },
    inventory: [{
      itemId: { type: String, required: true },
      name: { type: String, required: true },
      quantity: { type: Number, default: 0 },
    }],
    badges: { type: [String], default: [] },
    eventRewardSessionIds: [{ type: Schema.Types.ObjectId, ref: "NexoraEventSession" }],
    cosmeticTitle: { type: String, default: null },
    classIds: [{ type: Schema.Types.ObjectId, ref: "NexoraClass" }],
  },
  { timestamps: true },
);

const subjectSchema = new Schema(
  {
    name: { type: String, required: true, unique: true },
    questionCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

const questionSchema = new Schema(
  {
    subject: { type: String, required: true, index: true },
    rank: { type: String, enum: ["E", "D", "C", "B", "A", "S"], required: true, index: true },
    difficulty: { type: Number, required: true },
    prompt: { type: String, required: true },
    options: { type: [String], required: true },
    correctAnswerIndex: { type: Number, required: true, select: false },
    explanation: { type: String, required: true },
  },
  { timestamps: true },
);

const dungeonRunSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "NexoraUser", required: true, index: true },
    subject: { type: String, required: true },
    rank: { type: String, required: true },
    questionIds: [{ type: Schema.Types.ObjectId, ref: "NexoraQuestion" }],
    currentIndex: { type: Number, default: 0 },
    playerHp: { type: Number, default: 100 },
    enemyHp: { type: Number, default: 100 },
    correctCount: { type: Number, default: 0 },
    answeredCount: { type: Number, default: 0 },
    missedQuestions: [{
      questionId: { type: Schema.Types.ObjectId, ref: "NexoraQuestion" },
      selectedAnswerIndex: Number,
      correctAnswerIndex: Number,
      answeredAt: { type: Date, default: Date.now },
    }],
    xpEarned: { type: Number, default: 0 },
    mode: { type: String, enum: ["standard", "quick"], default: "standard" },
    expiresAt: { type: Date, default: null },
    pauseUsed: { type: Boolean, default: false },
    pausedAt: { type: Date, default: null },
    pauseExpiresAt: { type: Date, default: null },
    pausedRemainingSeconds: { type: Number, default: 0 },
    bossDefeated: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "success", "failed", "abandoned"], default: "active" },
    accuracy: { type: Number, default: 0 },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const tournamentSchema = new Schema(
  {
    name: { type: String, required: true },
    subject: { type: String, required: true },
    paid: { type: Boolean, default: false },
    entryFeeEtb: { type: Number, default: 0 },
    startsAt: { type: Date, required: true },
    roundRanks: { type: [String], default: ["E", "C", "A"] },
    roundDurationSeconds: { type: Number, default: 300 },
    capacity: { type: Number, default: 64 },
    participantCount: { type: Number, default: 0 },
    processedPaymentIds: [{ type: Schema.Types.ObjectId, ref: "NexoraPayment" }],
    cancelledAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const tournamentEntrySchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: "NexoraTournament", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "NexoraUser", required: true },
    paymentStatus: { type: String, enum: ["free", "mock-approved", "pending", "paid", "failed", "refund_pending", "refunded", "cancelled"], required: true },
    paymentId: { type: Schema.Types.ObjectId, ref: "NexoraPayment", default: null },
    checkoutUrl: { type: String, default: null },
    points: { type: Number, default: 0 },
    totalTimeMs: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    roundIndex: { type: Number, default: 0 },
    questionIds: [{ type: Schema.Types.ObjectId, ref: "NexoraQuestion" }],
    currentIndex: { type: Number, default: 0 },
    roundStartedAt: { type: Date, default: null },
    questionStartedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    correctCount: { type: Number, default: 0 },
    answeredCount: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
    rankBadge: { type: String, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
tournamentEntrySchema.index({ tournamentId: 1, userId: 1 }, { unique: true });

const classSchema = new Schema(
  {
    name: { type: String, required: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "NexoraUser", required: true, index: true },
    joinCode: { type: String, required: true, unique: true, uppercase: true },
    students: [{ type: Schema.Types.ObjectId, ref: "NexoraUser" }],
  },
  { timestamps: true },
);

const assignmentSchema = new Schema(
  {
    classId: { type: Schema.Types.ObjectId, ref: "NexoraClass", required: true, index: true },
    teacherId: { type: Schema.Types.ObjectId, ref: "NexoraUser", required: true },
    title: { type: String, required: true },
    subject: { type: String, required: true },
    rank: { type: String, required: true },
    dueAt: { type: Date, required: true },
  },
  { timestamps: true },
);

const subscriptionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "NexoraUser", required: true, unique: true },
    tier: { type: String, enum: ["free", "arena", "institution"], default: "free" },
    priceEtb: { type: Number, default: 0 },
    billingStatus: { type: String, default: "free" },
    currentPeriodEnd: { type: Date, default: null },
    graceEndsAt: { type: Date, default: null },
    renewalDueAt: { type: Date, default: null },
    lastPaymentId: { type: Schema.Types.ObjectId, ref: "NexoraPayment", default: null },
    renewalCheckoutUrl: { type: String, default: null },
    appliedPaymentIds: [{ type: Schema.Types.ObjectId, ref: "NexoraPayment" }],
  },
  { timestamps: true },
);

const paymentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "NexoraUser", required: true },
    purpose: { type: String, required: true },
    amountEtb: { type: Number, required: true },
    currency: { type: String, default: "ETB" },
    provider: { type: String, enum: ["chapa"], default: "chapa" },
    txRef: { type: String, required: true, unique: true, index: true },
    providerReference: { type: String, default: null },
    checkoutUrl: { type: String, default: null },
    status: { type: String, enum: ["pending", "processing", "successful", "failed", "refund_pending", "refunded", "refund_failed", "cancelled"], default: "pending", index: true },
    relatedTournamentId: { type: Schema.Types.ObjectId, ref: "NexoraTournament", default: null },
    relatedEntryId: { type: Schema.Types.ObjectId, ref: "NexoraTournamentEntry", default: null },
    refundStatus: { type: String, default: null },
    refundReference: { type: String, default: null },
    refundRequestReference: { type: String, default: null },
    refundAmountEtb: { type: Number, default: null },
    reconciliationStatus: { type: String, default: null },
    reconciledAt: { type: Date, default: null },
    webhookProcessedAt: { type: Date, default: null },
    entitlementAppliedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
paymentSchema.index({ userId: 1, status: 1, createdAt: -1 });

const eventLeadSchema = new Schema(
  {
    id: { type: String, required: true },
    position: { type: Number, required: true },
    title: { type: String, required: true },
    scene: { type: String, required: true },
    clue: { type: String, required: true },
    subject: { type: String, enum: ["Math", "Chemistry"], required: true },
    difficulty: { type: Number, required: true },
    prompt: { type: String, required: true },
    options: { type: [String], required: true },
    correctAnswerIndex: { type: Number, required: true },
    explanation: { type: String, required: true },
  },
  { _id: false },
);
const eventFinaleStepSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    scene: { type: String, required: true },
    subject: { type: String, enum: ["Math", "Chemistry"], required: true },
    difficulty: { type: Number, required: true },
    prompt: { type: String, required: true },
    options: { type: [String], required: true },
    correctAnswerIndex: { type: Number, required: true },
    explanation: { type: String, required: true },
    hpDamage: { type: Number, required: true },
  },
  { _id: false },
);
const eventCaseSchema = new Schema(
  {
    caseId: { type: String, required: true, unique: true, index: true },
    title: { type: String, required: true },
    intro: { type: String, required: true },
    durationSeconds: { type: Number, default: 3600 },
    focusTotal: { type: Number, default: 5 },
    leads: { type: [eventLeadSchema], validate: (leads: unknown[]) => leads.length >= 6 && leads.length <= 8 },
    monsterName: { type: String, required: true },
    monsterHp: { type: Number, default: 100 },
    finaleSteps: { type: [eventFinaleStepSchema], required: true },
    rewardXp: { type: Number, required: true },
    rewardBadge: { type: String, required: true },
    rewardTitle: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
const eventSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "NexoraUser", required: true, index: true },
    caseId: { type: String, required: true },
    status: { type: String, enum: ["active", "completed", "expired"], default: "active", index: true },
    startedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    focusRemaining: { type: Number, required: true },
    currentLeadIndex: { type: Number, default: 0 },
    finaleStep: { type: Number, default: 0 },
    monsterHp: { type: Number, default: 100 },
    solvedLeadIds: { type: [String], default: [] },
    wrongAnswers: { type: Number, default: 0 },
    answerEvents: [{
      stepId: String,
      answerIndex: Number,
      correct: Boolean,
      answeredAt: { type: Date, default: Date.now },
    }],
    rewardApplied: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
eventSessionSchema.index({ userId: 1 }, { unique: true });

const dungeonAuditEventSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "NexoraUser", required: true, index: true },
    runId: { type: Schema.Types.ObjectId, ref: "NexoraDungeonRun", required: true, index: true },
    eventType: { type: String, enum: ["reset", "pause", "resume"], required: true },
    reason: { type: String, default: null },
    occurredAt: { type: Date, default: Date.now },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: false },
);

const tutorSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "NexoraUser", required: true, index: true },
    subject: { type: String, default: "" },
    messages: [{ role: { type: String, enum: ["user", "assistant"] }, content: String }],
  },
  { timestamps: true },
);

export const UserModel = models.NexoraUser || model("NexoraUser", userSchema, "users");
export const SubjectModel = models.NexoraSubject || model("NexoraSubject", subjectSchema, "subjects");
export const QuestionModel = models.NexoraQuestion || model("NexoraQuestion", questionSchema, "questions");
export const DungeonRunModel = models.NexoraDungeonRun || model("NexoraDungeonRun", dungeonRunSchema, "dungeon_runs");
export const TournamentModel = models.NexoraTournament || model("NexoraTournament", tournamentSchema, "tournaments");
export const TournamentEntryModel = models.NexoraTournamentEntry || model("NexoraTournamentEntry", tournamentEntrySchema, "tournament_entries");
export const ClassModel = models.NexoraClass || model("NexoraClass", classSchema, "classes");
export const AssignmentModel = models.NexoraAssignment || model("NexoraAssignment", assignmentSchema, "assignments");
export const SubscriptionModel = models.NexoraSubscription || model("NexoraSubscription", subscriptionSchema, "subscriptions");
export const PaymentModel = models.NexoraPayment || model("NexoraPayment", paymentSchema, "payments");
export const EventCaseModel = models.NexoraEventCase || model("NexoraEventCase", eventCaseSchema, "event_cases");
export const EventSessionModel = models.NexoraEventSession || model("NexoraEventSession", eventSessionSchema, "event_sessions");
export const DungeonAuditEventModel = models.NexoraDungeonAuditEvent || model("NexoraDungeonAuditEvent", dungeonAuditEventSchema, "dungeon_audit_events");
export const AITutorSessionModel = models.NexoraAITutorSession || model("NexoraAITutorSession", tutorSessionSchema, "ai_tutor_sessions");

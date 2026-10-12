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
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const tournamentEntrySchema = new Schema(
  {
    tournamentId: { type: Schema.Types.ObjectId, ref: "NexoraTournament", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "NexoraUser", required: true },
    paymentStatus: { type: String, enum: ["free", "mock-approved", "pending"], required: true },
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
  },
  { timestamps: true },
);

const paymentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "NexoraUser", required: true },
    purpose: { type: String, required: true },
    amountEtb: { type: Number, required: true },
    currency: { type: String, default: "ETB" },
    provider: { type: String, default: "mock" },
    status: { type: String, default: "mock-approved" },
  },
  { timestamps: true },
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
export const AITutorSessionModel = models.NexoraAITutorSession || model("NexoraAITutorSession", tutorSessionSchema, "ai_tutor_sessions");

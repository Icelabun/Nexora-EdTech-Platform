import app from "./app";
import { logger } from "./lib/logger";
import mongoose from "mongoose";
import { seedNexoraData } from "./lib/nexora-seed";
import { sweepExpiredSubscriptions } from "./lib/nexora-subscriptions";

const requiredSecrets = ["MONGODB_URI", "JWT_SECRET"] as const;
for (const name of requiredSecrets) {
  if (!process.env[name]) {
    throw new Error(`${name} must be configured before the API server can start.`);
  }
}
if (process.env.JWT_SECRET!.length < 32) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters.");
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const start = async () => {
  await mongoose.connect(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 12_000 });
  if (process.env.NODE_ENV !== "production") {
    await seedNexoraData();
  }
  const server = app.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
  const subscriptionSweep = setInterval(() => {
    void sweepExpiredSubscriptions().catch((err: unknown) => {
      logger.error({ err }, "Subscription expiry sweep failed");
    });
  }, 10 * 60 * 1000);
  subscriptionSweep.unref();
  void sweepExpiredSubscriptions().catch((err: unknown) => {
    logger.error({ err }, "Initial subscription expiry sweep failed");
  });
  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutting down API server");
    clearInterval(subscriptionSweep);
    server.close(() => {
      void mongoose.disconnect().finally(() => process.exit(0));
    });
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
};

start().catch((err: unknown) => {
  logger.error({ err }, "API server failed to start");
  process.exit(1);
});

import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { connectDatabase, disconnectDatabase } from "./config/database";
import { connectRedis, disconnectRedis } from "./config/redis";
import { runMigrations } from "./migrations";
import { gstConfigProblems } from "./services/gstReturn.service";

async function main() {
  await connectDatabase();
  await connectRedis();
  await runMigrations();
  for (const problem of gstConfigProblems()) logger.error(`GST setup: ${problem}`);

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`Retake backend listening on port ${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      await disconnectDatabase();
      await disconnectRedis();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});

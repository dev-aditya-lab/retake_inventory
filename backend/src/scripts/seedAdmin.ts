import { connectDatabase, disconnectDatabase } from "../config/database";
import { User } from "../models/User.model";
import { hashPassword } from "../utils/password";
import { logger } from "../config/logger";

/**
 * Bootstraps the very first admin account so someone can log in and start
 * inviting other staff via POST /api/users. Run with:
 *   SEED_ADMIN_EMAIL=you@retake.com SEED_ADMIN_PASSWORD=... npx tsx src/scripts/seedAdmin.ts
 */
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";

  if (!email || !password) {
    logger.error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD env vars before running this script");
    process.exit(1);
  }
  if (password.length < 8) {
    logger.error("SEED_ADMIN_PASSWORD must be at least 8 characters");
    process.exit(1);
  }

  await connectDatabase();

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    logger.info(`User ${email} already exists (role: ${existing.role}) — nothing to do`);
    await disconnectDatabase();
    return;
  }

  const passwordHash = await hashPassword(password);
  await User.create({ name, email: email.toLowerCase(), passwordHash, role: "admin" });
  logger.info(`Admin user created: ${email}`);

  await disconnectDatabase();
}

main().catch((err) => {
  logger.error({ err }, "Failed to seed admin user");
  process.exit(1);
});

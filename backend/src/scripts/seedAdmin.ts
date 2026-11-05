import { connectDatabase, disconnectDatabase } from "../config/database";
import { User } from "../models/User.model";
import { logger } from "../config/logger";
import { indianMobile } from "../utils/phone";

/**
 * Bootstraps the very first admin account so someone can sign in (with a code
 * sent to their WhatsApp) and invite other staff. Run with:
 *   SEED_ADMIN_EMAIL=you@retake.com SEED_ADMIN_PHONE=9876543210 npx tsx src/scripts/seedAdmin.ts
 * If WhatsApp isn't set up yet, get a first code with `npm run otp:code -- you@retake.com`.
 */
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const phone = indianMobile(process.env.SEED_ADMIN_PHONE);
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";

  if (!email || !phone) {
    logger.error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PHONE (a 10-digit Indian mobile) before running this script");
    process.exit(1);
  }

  await connectDatabase();

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    logger.info(`User ${email} already exists (role: ${existing.role}) — nothing to do`);
    await disconnectDatabase();
    return;
  }

  await User.create({ name, email: email.toLowerCase(), phone, role: "admin" });
  logger.info(`Admin user created: ${email} (${phone})`);

  await disconnectDatabase();
}

main().catch((err) => {
  logger.error({ err }, "Failed to seed admin user");
  process.exit(1);
});

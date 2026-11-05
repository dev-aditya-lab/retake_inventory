import { connectDatabase, disconnectDatabase } from "../config/database";
import { connectRedis, disconnectRedis } from "../config/redis";
import { findUserByIdentifier, issueOtp } from "../services/auth.service";

/**
 * Prints a one-time login code for a staff member, for when no code can be
 * delivered (WhatsApp isn't set up yet, the template isn't approved, email is
 * off). Whoever can run this already has full access to the server and database.
 *   npm run otp:code -- you@retake.com      (or a mobile number)
 */
async function main() {
  const identifier = process.argv[2];
  if (!identifier) {
    console.error("Usage: npm run otp:code -- <email or mobile number>");
    process.exit(1);
  }

  await connectDatabase();
  await connectRedis();

  const user = await findUserByIdentifier(identifier);
  if (!user) {
    console.error("No active staff account matches that email or number.");
  } else {
    const code = await issueOtp(user.id);
    console.log(`Login code for ${user.name}: ${code}  (valid for 10 minutes, works once)`);
  }

  await disconnectRedis();
  await disconnectDatabase();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import pino from "pino";
import { env } from "./env";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  // pino-http logs req/res headers by default — without this, every access
  // log line would include the httpOnly JWT cookies and any Authorization
  // header in plaintext.
  redact: {
    paths: ["req.headers.cookie", "req.headers.authorization", "res.headers['set-cookie']"],
    censor: "[redacted]",
  },
});

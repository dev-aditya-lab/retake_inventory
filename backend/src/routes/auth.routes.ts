import { Router } from "express";
import * as authController from "../controllers/auth.controller";
import { validateBody } from "../middleware/validate";
import { requestOtpSchema, updateProfileSchema, verifyOtpSchema } from "../validators/auth.validators";
import { authenticate } from "../middleware/auth";
import { otpLimiter } from "../middleware/rateLimit";

export const authRouter = Router();

// There are no passwords: staff ask for a one-time code, then enter it.
authRouter.post("/otp/request", otpLimiter, validateBody(requestOtpSchema), authController.requestOtp);
authRouter.post("/otp/verify", otpLimiter, validateBody(verifyOtpSchema), authController.verifyOtp);
authRouter.post("/refresh", authController.refresh);
authRouter.post("/logout", authController.logout);
authRouter.get("/me", authenticate, authController.me);
// Any signed-in staff member, for their own record only (the id comes from the session, never the body).
authRouter.patch("/me", authenticate, validateBody(updateProfileSchema), authController.updateMe);

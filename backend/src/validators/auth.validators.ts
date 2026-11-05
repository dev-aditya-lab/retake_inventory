import { z } from "zod";
import { USER_ROLES } from "../models/User.model";
import { indianMobile } from "../utils/phone";

/** Staff sign in with a one-time code sent to their mobile number's WhatsApp (or their email). */
export const requestOtpSchema = z.object({
  identifier: z.string().trim().min(3, "Enter your mobile number or email").max(120),
});

export const verifyOtpSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  code: z.string().trim().min(4, "Enter the code").max(12),
});

/** The mobile number is how staff sign in, so it must be a real Indian mobile; it is stored as the bare 10 digits. */
const staffMobile = z
  .string()
  .trim()
  .refine((value) => indianMobile(value) !== undefined, "Enter a valid 10-digit mobile number")
  .transform((value) => indianMobile(value)!);

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email(),
  phone: staffMobile,
  role: z.enum(USER_ROLES),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: staffMobile.optional(),
  role: z.enum(USER_ROLES).optional(),
  isActive: z.boolean().optional(),
});

/**
 * What a staff member can change about themselves (PATCH /api/auth/me). Role,
 * email and active status are deliberately absent. The phone is shared with
 * customers on WhatsApp, so it must be a real Indian mobile; it is stored as
 * the bare 10 digits, and "" clears it.
 */
export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(80).optional(),
    phone: z
      .string()
      .trim()
      .refine((value) => value === "" || indianMobile(value) !== undefined, "Enter a valid 10-digit mobile number")
      .transform((value) => (value === "" ? "" : indianMobile(value)!))
      .optional(),
  })
  .refine((value) => value.name !== undefined || value.phone !== undefined, "Nothing to update");

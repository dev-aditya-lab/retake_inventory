import { z } from "zod";
import { USER_ROLES } from "../models/User.model";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().trim().min(6).max(20).optional(),
  role: z.enum(USER_ROLES),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().min(6).max(20).optional(),
  role: z.enum(USER_ROLES).optional(),
  isActive: z.boolean().optional(),
});

import type { Request, Response } from "express";
import { User, type UserRole } from "../models/User.model";
import * as authService from "../services/auth.service";
import { ApiError } from "../utils/ApiError";
import { serializeUser } from "../utils/serializeUser";

export async function listUsers(_req: Request, res: Response): Promise<void> {
  const users = await User.find().sort({ createdAt: -1 });
  res.json({ success: true, data: users.map(serializeUser) });
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const user = await authService.createUser(req.body);
  res.status(201).json({ success: true, data: serializeUser(user) });
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const requester = req.user;

  if (requester && id === requester.id && req.body.role && req.body.role !== requester.role) {
    throw ApiError.badRequest("You cannot change your own role");
  }
  if (requester && id === requester.id && req.body.isActive === false) {
    throw ApiError.badRequest("You cannot deactivate your own account");
  }

  const user = await User.findByIdAndUpdate(
    id,
    req.body as { name?: string; phone?: string; role?: UserRole; isActive?: boolean },
    { returnDocument: "after", runValidators: true },
  );
  if (!user) {
    throw ApiError.notFound("User not found");
  }
  res.json({ success: true, data: serializeUser(user) });
}

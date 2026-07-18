import type { UserDoc } from "../models/User.model";

export function serializeUser(user: UserDoc) {
  return {
    id: user.id as string,
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone ?? undefined,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
}

export type SerializedUser = ReturnType<typeof serializeUser>;

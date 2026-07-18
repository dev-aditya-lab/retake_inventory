export type UserRole = "admin" | "sales" | "inventory_manager";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt?: string;
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  sales: "Sales",
  inventory_manager: "Inventory Manager",
};

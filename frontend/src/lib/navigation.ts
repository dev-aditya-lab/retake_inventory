import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Package, ScanBarcode, Receipt, BarChart3, Users } from "lucide-react";
import type { UserRole } from "@/types/auth";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Bottom nav on mobile only shows the highest-priority items to avoid crowding. */
  mobilePriority?: boolean;
  /** Restricts visibility to these roles. Omit to show to everyone. */
  roles?: UserRole[];
}

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, mobilePriority: true },
  { label: "Inventory", href: "/products", icon: Package, mobilePriority: true },
  { label: "Billing", href: "/billing", icon: Receipt, mobilePriority: true },
  { label: "Barcode", href: "/barcode", icon: ScanBarcode, mobilePriority: true },
  { label: "Reports", href: "/reports", icon: BarChart3, roles: ["admin"] },
  { label: "Staff", href: "/staff", icon: Users, roles: ["admin"] },
];

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Package,
  ScanBarcode,
  Receipt,
  ReceiptText,
  FileText,
  QrCode,
  Contact,
  Tags,
  Hash,
  Landmark,
  BarChart3,
  Users,
} from "lucide-react";
import type { UserRole } from "@/types/auth";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown directly in the mobile bottom nav; everything else lives under its "More" menu. */
  mobilePriority?: boolean;
  /** Restricts visibility to these roles. Omit to show to everyone. */
  roles?: UserRole[];
}

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, mobilePriority: true },
  { label: "Inventory", href: "/products", icon: Package, mobilePriority: true },
  { label: "Billing", href: "/billing", icon: Receipt, mobilePriority: true },
  { label: "Barcode", href: "/barcode", icon: ScanBarcode, mobilePriority: true },
  { label: "Sales", href: "/sales", icon: ReceiptText },
  // Bills made without GST — a separate section, never part of the GST returns.
  { label: "Non-GST bills", href: "/non-gst-bills", icon: FileText, roles: ["admin"] },
  // The UPI QR to show a customer who is paying now (staff who bill: admin and sales).
  { label: "Payment QR", href: "/payment-qr", icon: QrCode, roles: ["admin", "sales"] },
  { label: "GST", href: "/gst", icon: Landmark, roles: ["admin"] },
  { label: "Customers", href: "/customers", icon: Contact, roles: ["admin"] },
  { label: "SKU codes", href: "/sku-codes", icon: Tags, roles: ["admin"] },
  { label: "HSN codes", href: "/hsn-codes", icon: Hash, roles: ["admin"] },
  { label: "Reports", href: "/reports", icon: BarChart3, roles: ["admin"] },
  { label: "Staff", href: "/staff", icon: Users, roles: ["admin"] },
];

export function isNavItemVisible(item: NavItem, role: UserRole | undefined): boolean {
  return !item.roles || (!!role && item.roles.includes(role));
}

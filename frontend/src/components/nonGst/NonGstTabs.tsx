"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FileText, Users } from "lucide-react";

const TABS = [
  { label: "Overview", href: "/non-gst-bills", icon: BarChart3 },
  { label: "Bills", href: "/non-gst-bills/bills", icon: FileText },
  { label: "Customers", href: "/non-gst-bills/customers", icon: Users },
];

/**
 * Header + tabs shared by the three screens of the non-GST section. These are
 * bills made without GST: separate numbers, never in the GST returns, Sales
 * page or reports — so this section carries its own analysis.
 */
export function NonGstTabs({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Non-GST sales</p>
          <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
        {actions}
      </div>

      <nav aria-label="Non-GST sections" className="mt-4 flex gap-1 border-b border-border">
        {TABS.map((tab) => {
          // "/non-gst-bills" is a prefix of the other tabs, so the Overview tab matches exactly.
          const isActive = tab.href === "/non-gst-bills" ? pathname === tab.href : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium ${
                isActive ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              <Icon size={16} aria-hidden />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

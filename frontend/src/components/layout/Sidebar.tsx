"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/navigation";
import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";

export function Sidebar() {
  const pathname = usePathname();
  const { data: user } = useGetMeQuery();
  const items = navItems.filter((item) => !item.roles || (user && item.roles.includes(user.role)));

  return (
    <nav className="hidden w-56 shrink-0 border-r border-border bg-surface p-3 md:flex md:flex-col md:gap-1">
      {items.map((item) => {
        const isActive = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-foreground hover:bg-ink-100"
            }`}
          >
            <Icon size={18} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

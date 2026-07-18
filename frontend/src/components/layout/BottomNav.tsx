"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems } from "@/lib/navigation";
import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";

export function BottomNav() {
  const pathname = usePathname();
  const { data: user } = useGetMeQuery();
  const items = navItems.filter(
    (item) => item.mobilePriority && (!item.roles || (user && item.roles.includes(user.role))),
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      {items.map((item) => {
        const isActive = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${
              isActive ? "text-primary" : "text-muted"
            }`}
          >
            <Icon size={22} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

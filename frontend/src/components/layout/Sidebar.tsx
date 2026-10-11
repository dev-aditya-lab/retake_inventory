"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isNavItemVisible, navItems } from "@/lib/navigation";
import { useNavBadges } from "@/lib/useNavBadges";
import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";

export function Sidebar() {
  const pathname = usePathname();
  const { data: user } = useGetMeQuery();
  const badgeFor = useNavBadges();
  const items = navItems.filter((item) => isNavItemVisible(item, user?.role));

  return (
    <nav className="hidden w-56 shrink-0 border-r border-border bg-surface p-3 md:flex md:flex-col md:gap-1">
      {items.map((item) => {
        const isActive = pathname.startsWith(item.href);
        const Icon = item.icon;
        const badge = badgeFor(item);
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
            <span className="flex-1">{item.label}</span>
            {badge > 0 && (
              <span
                className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none ${
                  isActive ? "bg-background text-primary" : "bg-primary text-primary-foreground"
                }`}
                aria-label={`${badge} waiting`}
              >
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

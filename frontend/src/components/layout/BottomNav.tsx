"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis } from "lucide-react";
import { isNavItemVisible, navItems } from "@/lib/navigation";
import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";
import { Modal } from "@/components/ui/Modal";

export function BottomNav() {
  const pathname = usePathname();
  const { data: user } = useGetMeQuery();
  const [moreOpen, setMoreOpen] = useState(false);

  const visible = navItems.filter((item) => isNavItemVisible(item, user?.role));
  const primary = visible.filter((item) => item.mobilePriority);
  const more = visible.filter((item) => !item.mobilePriority);
  const isMoreActive = more.some((item) => pathname.startsWith(item.href));

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
        {primary.map((item) => {
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
        {more.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-haspopup="dialog"
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${
              isMoreActive ? "text-primary" : "text-muted"
            }`}
          >
            <Ellipsis size={22} aria-hidden />
            More
          </button>
        )}
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <ul className="grid grid-cols-3 gap-2">
          {more.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium ${
                    isActive ? "border-primary bg-chilli-50 text-primary" : "border-border text-foreground hover:bg-ink-50"
                  }`}
                >
                  <Icon size={22} aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </Modal>
    </>
  );
}

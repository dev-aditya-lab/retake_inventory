"use client";

import { useGetMeQuery } from "@/lib/redux/features/auth/authApi";
import { useGetWhatsappSummaryQuery } from "@/lib/redux/features/whatsapp/whatsappApi";
import type { NavItem } from "./navigation";

/** How often the unread count refreshes while the app is open (and focused). */
const POLL_MS = 30_000;

/**
 * Live counts for nav items that carry a badge. WhatsApp shows chats waiting
 * for a person (unread or flagged), plus, for admins, unacknowledged warnings.
 */
export function useNavBadges(): (item: NavItem) => number {
  const { data: user } = useGetMeQuery();
  const { data: summary } = useGetWhatsappSummaryQuery(undefined, {
    skip: !user,
    pollingInterval: POLL_MS,
    skipPollingIfUnfocused: true,
  });

  return (item) => {
    if (item.badge === "whatsapp" && summary) return summary.unreadChats + summary.openAlerts;
    return 0;
  };
}

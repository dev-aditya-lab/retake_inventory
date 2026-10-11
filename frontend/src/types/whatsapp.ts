export type ChatFilter = "all" | "unread" | "needs_reply";

export interface ChatListItem {
  id: string;
  /** Customer's WhatsApp id: digits with country code. */
  waId: string;
  /** Directory name, else the name on their WhatsApp; may be empty. */
  name: string;
  isCustomer: boolean;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastDirection: "in" | "out" | null;
  unreadCount: number;
  needsHuman: boolean;
  windowOpen: boolean;
}

export interface ChatListPage {
  items: ChatListItem[];
  total: number;
  page: number;
  limit: number;
}

export type MessageStatus = "received" | "sent" | "delivered" | "read" | "failed";
export type MessageSource = "customer" | "app" | "bot" | "business_app";

export interface ChatMessage {
  id: string;
  direction: "in" | "out";
  type: string;
  text: string;
  status: MessageStatus;
  error: string | null;
  source: MessageSource;
  /** Staff member who sent it from the app. */
  sentByName: string | null;
  timestamp: string;
}

export interface ChatThread {
  conversation: {
    id: string;
    waId: string;
    name: string;
    company: string;
    isCustomer: boolean;
    needsHuman: boolean;
    windowOpen: boolean;
    windowClosesAt: string | null;
  };
  messages: ChatMessage[];
  hasMore: boolean;
}

export interface WhatsappSummary {
  unreadChats: number;
  needsReply: number;
  /** Admins only; 0 for everyone else. */
  openAlerts: number;
}

export type AlertSeverity = "info" | "warning" | "critical";

export interface WhatsappAlert {
  id: string;
  kind: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  createdAt: string;
  acknowledged: boolean;
}

export interface WhatsappTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  quality: string;
  reason: string;
  updatedAt: string;
}

export interface WhatsappHealth {
  number: { event: string; limit: string; at: string } | null;
  templates: WhatsappTemplate[];
  alerts: WhatsappAlert[];
}

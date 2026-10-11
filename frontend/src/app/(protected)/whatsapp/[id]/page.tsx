"use client";

import { useParams } from "next/navigation";
import { ChatThreadView } from "@/components/whatsapp/ChatThread";

export default function WhatsappChatPage() {
  const { id } = useParams<{ id: string }>();
  // Keyed so switching chats starts from a clean scroll/draft state.
  return <ChatThreadView key={id} id={id} />;
}

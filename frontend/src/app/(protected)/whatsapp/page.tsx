import { MessagesSquare } from "lucide-react";

/** Right-hand pane on wide screens before a chat is chosen. (On phones the list fills the screen instead.) */
export default function WhatsappHomePage() {
  return (
    <div className="flex h-[calc(100dvh-12rem)] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">
      <MessagesSquare size={32} aria-hidden />
      <p className="font-medium text-foreground">Choose a chat</p>
      <p>Pick a customer on the left to read their messages and reply.</p>
    </div>
  );
}

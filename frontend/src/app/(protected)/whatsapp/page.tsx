import { MessageCircle } from "lucide-react";

/** The empty pane on wide screens before a chat is chosen. (On phones the list fills the screen instead.) */
export default function WhatsappHomePage() {
  return (
    <div className="chat-wallpaper flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex h-20 w-20 items-center justify-center rounded-full bg-background text-leaf-600 shadow-sm">
        <MessageCircle size={40} aria-hidden />
      </span>
      <p className="text-xl font-semibold text-foreground">Retake on WhatsApp</p>
      <p className="max-w-sm text-sm text-muted">
        Pick a chat on the left to read it and reply. Use the + button to message someone new with a template.
      </p>
    </div>
  );
}

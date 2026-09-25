import type { Metadata } from "next";
import ChatShell from "@/components/chat/ChatShell";

/**
 * /chat — MAXXEN conversational workspace.
 * Server component: metadata only; the interactive shell is client-side.
 */
export const metadata: Metadata = {
  title: "MAXXEN Chat",
  description:
    "Chat with MAXXEN — build websites, apps, dashboards and automations. BYOK: your keys stay in your browser.",
};

export default function ChatPage() {
  return (
    <div className="h-dvh overflow-hidden bg-background text-foreground">
      <ChatShell />
    </div>
  );
}

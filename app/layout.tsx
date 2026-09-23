import type { Metadata } from "next";
import "./globals.css";
import "./tokens.css";

export const metadata: Metadata = {
  title: "Maxxen AI — Build Anything",
  description: "Multipurpose agentic AI: chat, build apps/websites, plugins via Composio, BYOK, GitHub storage, Vercel deploy."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

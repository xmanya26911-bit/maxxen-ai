import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "MAXXEN — Build something remarkable",
  description:
    "MAXXEN is a multipurpose agentic AI that designs, builds and deploys websites, apps and dashboards with you — running on your API keys, your GitHub and your Vercel.",
  keywords: [
    "MAXXEN",
    "MAXXEN AI",
    "agentic AI",
    "BYOK",
    "AI chat",
    "build apps with AI",
    "Composio plugins",
    "Vercel deploy",
  ],
  authors: [{ name: "MAXXEN AI" }],
  openGraph: {
    title: "MAXXEN — Build something remarkable",
    description:
      "Multipurpose agentic AI: chat, build apps and websites, plugins via Composio, BYOK, GitHub storage, Vercel deploy.",
    siteName: "MAXXEN AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MAXXEN",
    description: "Your keys · Your GitHub · Your Vercel.",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground font-sans`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

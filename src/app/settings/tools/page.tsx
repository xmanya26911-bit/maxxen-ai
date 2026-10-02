import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings/settings-form";

export const metadata: Metadata = {
  title: "Tools & location — MAXXEN Settings",
  description: "Assistant tools: web search, timezone, and optional location.",
};

export default function SettingsToolsPage() {
  return <SettingsForm view="tools" />;
}

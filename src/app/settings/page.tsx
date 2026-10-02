import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings/settings-form";

export const metadata: Metadata = {
  title: "MAXXEN Settings",
  description: "Workspace settings hub: AI endpoints, memory, and integrations.",
};

export default function SettingsPage() {
  return <SettingsForm view="hub" />;
}

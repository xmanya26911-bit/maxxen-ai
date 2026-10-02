import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings/settings-form";

export const metadata: Metadata = {
  title: "Integrations — MAXXEN Settings",
  description: "GitHub storage, Vercel deploys, Composio plugins. Vault sync and controls.",
};

export default function SettingsIntegrationsPage() {
  return <SettingsForm view="integrations" />;
}

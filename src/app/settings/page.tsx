import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings/settings-form";

export const metadata: Metadata = {
  title: "MAXXEN Settings",
  description: "Provider endpoint, integrations, and vault controls for your MAXXEN workspace.",
};

export default function SettingsPage() {
  return <SettingsForm />;
}

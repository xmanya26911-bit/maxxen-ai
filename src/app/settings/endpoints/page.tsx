import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings/settings-form";

export const metadata: Metadata = {
  title: "AI endpoints — MAXXEN Settings",
  description: "Providers, keys and models for your MAXXEN workspace.",
};

export default function SettingsEndpointsPage() {
  return <SettingsForm view="endpoints" />;
}

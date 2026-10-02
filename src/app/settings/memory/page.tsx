import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings/settings-form";

export const metadata: Metadata = {
  title: "Memory — MAXXEN Settings",
  description: "What Maxxen remembers. Stored only in your private maxxen-data repo.",
};

export default function SettingsMemoryPage() {
  return <SettingsForm view="memory" />;
}

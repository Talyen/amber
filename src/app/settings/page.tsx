import type { Metadata } from "next";
import { SettingsWorkspace } from "@/components/SettingsWorkspace";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your Amber public handle, profile icon, and display preferences.",
  robots: { index: false, follow: false },
};

export default function SettingsPage() {
  return <SettingsWorkspace />;
}

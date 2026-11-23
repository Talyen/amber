import type { Metadata } from "next";
import { SettingsWorkspace } from "@/components/SettingsWorkspace";

export const metadata: Metadata = {
  title: "Settings",
  description: "Manage your Amber public handle, profile icon, and display preferences.",
};

export default function SettingsPage() {
  return <SettingsWorkspace />;
}

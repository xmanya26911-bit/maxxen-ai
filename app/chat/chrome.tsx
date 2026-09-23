"use client";
import { memo } from "react";

// Shared /chat chrome: types, storage helper, brand marks, icons, memoized
// preview frame, endpoint menu styling, nav + provider constants. Extracted
// so the page stays focused on chat state and layout.

export type Msg = { role: "user" | "assistant"; content: string; html?: string; at: string };
export type SavedChat = { id: string; title: string; messages: Msg[]; at: string };

export const nav = ["Home", "Chats", "Projects", "Artifacts", "Agents", "Plugins"];
export const navIcons = ["home", "chat", "grid", "box", "bolt", "layers"];
export const tools = ["Chat", "Build", "Code", "Design", "Research", "Deploy"];
export const suggestions = ["Build a landing page", "Create a dashboard", "Design an app", "Connect an API"];
export const NAV_HREF: Record<string, string> = {
  Home: "/",
  Chats: "/chat",
  Projects: "/projects",
  Artifacts: "/artifacts",
  Agents: "/agents",
  Plugins: "/plugins",
};

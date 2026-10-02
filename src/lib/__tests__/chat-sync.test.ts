import { describe, it, expect } from "vitest";
import {
  buildIndexEntryForTestHelperCheck,
  chatFilePath,
  indexEntryFor,
  isDeletableChatPath,
  mergeIndexEntry,
  removeIndexEntry,
  searchConversations,
  toConversationFile,
} from "@/lib/chat-sync";

void buildIndexEntryForTestHelperCheck;

describe("chat file shape", () => {
  it("strips blocks, caps messages and content", () => {
    const file = toConversationFile({
      id: "c1",
      title: "Hello",
      createdAt: 1,
      updatedAt: 2,
      messages: [
        { id: "m1", role: "user", content: "hi", blocks: [{ x: 1 }] } as never,
        { id: "m2", role: "assistant", content: "y".repeat(20000) },
        { id: "m3", role: "system", content: "drop me" },
      ],
    });
    expect(file.messages).toHaveLength(2);
    expect(file.messages[0]).not.toHaveProperty("blocks");
    expect(file.messages[1].content.length).toBeLessThanOrEqual(12000);
    expect(chatFilePath("c1")).toBe("chats/c1.json");
  });

  it("builds index entries and merges newest-wins", () => {
    const e1 = indexEntryFor({ id: "a", title: "Old", createdAt: 1, updatedAt: 1, messages: [] });
    expect(e1).toMatchObject({ id: "a", messageCount: 0 });
    const merged = mergeIndexEntry([e1], { ...e1, title: "New", updatedAt: 5 });
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe("New");
    expect(removeIndexEntry(merged, "a")).toHaveLength(0);
  });
});

describe("delete guard", () => {
  it("allows only chat files and the index", () => {
    expect(isDeletableChatPath("chats/abc-123.json")).toBe(true);
    expect(isDeletableChatPath("chats/_index.json")).toBe(true);
    expect(isDeletableChatPath("chats/../settings.json")).toBe(false);
    expect(isDeletableChatPath("memory/user/facts.json")).toBe(false);
    expect(isDeletableChatPath("settings.json")).toBe(false);
    expect(isDeletableChatPath("")).toBe(false);
    expect(isDeletableChatPath(null)).toBe(false);
  });
});

describe("conversation search", () => {
  const convs = [
    { id: "1", title: "Vercel deploy", messages: [{ content: "deploy failed twice" }] },
    { id: "2", title: "Hello", messages: [{ content: "just chatting" }] },
  ];
  it("matches titles and message content, case-insensitively", () => {
    expect(searchConversations(convs, "")).toHaveLength(2);
    expect(searchConversations(convs, "vercel")).toHaveLength(1);
    expect(searchConversations(convs, "FAILED")).toHaveLength(1);
    expect(searchConversations(convs, "zzz")).toHaveLength(0);
  });
});

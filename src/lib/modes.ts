/**
 * MAXXEN workspace modes — the ONE definition shared by:
 *   - the composer chips          (src/lib/constants.ts → CHAT_MODES)
 *   - the plain chat endpoint     (/api/chat)
 *   - the agent loop              (/api/agent/run, via buildRuntime({ mode }))
 *
 * A mode changes ONLY the instruction block appended to the Maxxen identity.
 * It never changes who Maxxen is, which tools exist, or how permissions work.
 *
 * Why this module exists: the modes used to be defined twice and drifted —
 * the client offered two chips while the server implemented seven, so five
 * prompt contracts (including the single-file HTML contract the preview pane
 * depends on) were unreachable. Adding a mode now means editing this file and
 * the chip list, and the type system proves they agree.
 */

export const MODE_IDS = ["chat", "build", "agent"] as const;

export type ModeId = (typeof MODE_IDS)[number];

export const MODE_INSTRUCTIONS: Record<ModeId, string> = {
  chat: [
    "Chat freely and helpfully. Be concise.",
    "When the user asks you to build, create or change a file, output the COMPLETE file inside one fenced block labeled with its language and path (e.g. ```html index.html).",
    "Maxxen renders fenced files in the workspace pane — a fragment, diff or outline cannot be previewed, saved or deployed, so never shorten a file you were asked to produce.",
    "Never describe a file you did not actually output.",
  ].join(" "),
  build: [
    "Build a complete, SINGLE-FILE HTML page.",
    "Output exactly one ```html block containing the entire page (inline CSS + JS, no external build step, no separate files).",
    "Before it, give a 2-line plan. After it, 2 lines on how to open or deploy it.",
    "Do not output multiple files and do not split the page across blocks.",
  ].join(" "),
  agent: [
    "Work as an engineering agent on the user's own project: inspect before you change anything, act through the tools exposed by the runtime rather than describing what you would do, make coherent multi-file changes, then verify the result.",
    "Narrate each step in one short line so the user can follow a long run.",
    "Report only what the tools actually returned — never claim a file, commit, deployment or verification that a tool did not confirm.",
  ].join(" "),
};

/** Any unknown/legacy mode value falls back to plain chat. */
export function normalizeMode(raw: unknown): ModeId {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return (MODE_IDS as readonly string[]).includes(value) ? (value as ModeId) : "chat";
}

/** The full instruction line appended after the Maxxen identity. */
export function modeBlock(mode: ModeId): string {
  return `Mode: ${mode.toUpperCase()}\n${MODE_INSTRUCTIONS[mode]}`;
}

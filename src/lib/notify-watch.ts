/**
 * Deploy watchlist — deployments the user wants to hear about.
 *
 * Stored in localStorage ("maxxen_watch") so watches survive reloads. A
 * header bell polls /api/vercel/status for unfinished watches and badges
 * when one reaches a terminal state (READY / ERROR / CANCELED). All polling
 * uses the user's own token against their own account — nothing leaves the
 * browser except the status calls the user explicitly triggered by deploying.
 */

export type WatchState = "working" | "ready" | "error" | "canceled";

export interface DeployWatch {
  id: string;
  url: string;
  label: string;
  state: WatchState;
  seen: boolean;
  updatedAt: number;
}

const KEY = "maxxen_watch";
const TERMINAL: WatchState[] = ["ready", "error", "canceled"];

export function isTerminal(state: WatchState): boolean {
  return TERMINAL.includes(state);
}

export function readWatches(): DeployWatch[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (w): w is DeployWatch =>
          !!w && typeof w === "object" && typeof (w as DeployWatch).id === "string"
      )
      .slice(-20);
  } catch {
    return [];
  }
}

function writeWatches(watches: DeployWatch[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(watches.slice(-20)));
  } catch {
    /* quota — oldest watches simply stop persisting */
  }
}

/** Track a new deployment (resets its seen flag). */
export function addWatch(id: string, url: string, label: string): void {
  const rest = readWatches().filter((w) => w.id !== id);
  writeWatches([...rest, { id, url, label, state: "working", seen: true, updatedAt: Date.now() }]);
}

export function markSeen(id: string): void {
  writeWatches(readWatches().map((w) => (w.id === id ? { ...w, seen: true } : w)));
}

export function markAllSeen(): void {
  writeWatches(readWatches().map((w) => ({ ...w, seen: true })));
}

export function clearFinished(): void {
  writeWatches(readWatches().filter((w) => !isTerminal(w.state)));
}

/** Poll one unfinished deployment via the real status endpoint. */
export async function pollWatch(id: string): Promise<DeployWatch | null> {
  const token = window.localStorage.getItem("maxxen_vercel_token") || "";
  if (!token) return null;
  const watches = readWatches();
  const found = watches.find((w) => w.id === id);
  if (!found || isTerminal(found.state)) return found ?? null;
  try {
    const r = await fetch("/api/vercel/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vercelToken: token, deploymentId: id }),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || j?.error) return found;
    const state: WatchState =
      j.state === "READY" ? "ready" : j.state === "ERROR" ? "error" : j.state === "CANCELED" ? "canceled" : "working";
    const next = watches.map((w) =>
      w.id === id
        ? {
            ...w,
            state,
            url: typeof j.url === "string" && j.url ? `https://${j.url}` : w.url,
            updatedAt: Date.now(),
            seen: state === "working" ? w.seen : false,
          }
        : w
    );
    writeWatches(next);
    return next.find((w) => w.id === id) ?? null;
  } catch {
    return found;
  }
}

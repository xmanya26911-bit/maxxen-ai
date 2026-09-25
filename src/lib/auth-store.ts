import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Auth session store — zustand + persist (localStorage key "maxxen-auth-v1").
 * The product keeps no server-side accounts: the session is the verified
 * email + the server-signed token (HMAC, 30-day expiry).
 *
 * Multi-account isolation: EVERYTHING user-scoped (chats, endpoint keys,
 * integration tokens) lives in per-email profiles
 * ("maxxen-profile-v1:<email>"). Switching accounts stashes the current
 * profile and restores (or fresh-starts) the incoming one — two Gmails on
 * one browser never see each other's world. Only the email chip differs
 * otherwise, which is exactly the bug this prevents.
 */
export type AuthProvider = "email" | "google";

export interface AuthSession {
  email: string;
  verifiedAt: number;
  /** How the session was created (omitted in pre-Google persisted sessions). */
  provider?: AuthProvider;
  /** Server-signed session token (HMAC, 30-day expiry). Empty for legacy stores. */
  token?: string;
}

export interface AuthState {
  session: AuthSession | null;
  /** Stamps a verified session (called right after verifyOtp / OAuth resolves). */
  signIn: (email: string, provider?: AuthProvider, token?: string) => void;
  /** Clears the session (sign out). */
  signOut: () => void;
}

/** Every localStorage key that belongs to ONE user (never shared). */
const USER_KEYS = [
  "maxxen-chat-v1",
  "maxxen_open_chat",
  "maxxen_apikey",
  "maxxen_baseurl",
  "maxxen_model",
  "maxxen_provider",
  "maxxen_github_token",
  "maxxen_vercel_token",
  "maxxen_vercel_project",
  "maxxen_composio_key",
  "maxxen_agent_account",
  "maxxen_agent_app",
  "maxxen_composio_user_id",
] as const;

const PROFILE_PREFIX = "maxxen-profile-v1:";

function profileKey(email: string): string {
  return `${PROFILE_PREFIX}${email.trim().toLowerCase()}`;
}

function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Snapshot the current USER_KEYS into `email`'s profile slot. */
function stashProfile(email: string): void {
  try {
    const snap: Record<string, string> = {};
    for (const k of USER_KEYS) {
      const v = readKey(k);
      if (v !== null) snap[k] = v;
    }
    window.localStorage.setItem(profileKey(email), JSON.stringify(snap));
  } catch {
    /* quota/privacy mode — isolation degrades to a clean slate below */
  }
}

/**
 * Activate `email`'s world: restore its snapshot when one exists,
 * otherwise wipe every USER_KEY so a new account starts empty.
 */
function activateProfile(email: string): void {
  let snap: Record<string, string> | null = null;
  try {
    const raw = window.localStorage.getItem(profileKey(email));
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        snap = parsed as Record<string, string>;
      }
    }
  } catch {
    snap = null;
  }
  try {
    for (const k of USER_KEYS) window.localStorage.removeItem(k);
    if (snap) {
      for (const [k, v] of Object.entries(snap)) {
        if ((USER_KEYS as readonly string[]).includes(k) && typeof v === "string") {
          window.localStorage.setItem(k, v);
        }
      }
    }
  } catch {
    /* ignore */
  }
  // The chat store rehydrates once at module load — force it to re-read
  // the swapped storage so the UI (sidebar, thread) reflects this account.
  void import("@/components/chat/store").then((m) => {
    try {
      void m.useChatStore.persist.rehydrate();
    } catch {
      /* store not mounted yet — it reads storage on creation */
    }
  });
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      signIn: (email, provider = "email", token = "") => {
        const normalized = email.trim().toLowerCase();
        const prev = get().session?.email?.trim().toLowerCase() ?? "";
        if (typeof window !== "undefined") {
          if (prev && prev !== normalized) {
            // Account switch: stash the outgoing world, enter the incoming one.
            stashProfile(prev);
            activateProfile(normalized);
          } else if (!prev) {
            // Fresh sign-in: adopt leftover/legacy keys into this account
            // (only when it has no profile yet), then enter its world.
            const hasKeys = USER_KEYS.some((k) => readKey(k) !== null);
            const hasProfile = readKey(profileKey(normalized)) !== null;
            if (hasKeys && !hasProfile) stashProfile(normalized);
            activateProfile(normalized);
          }
          // Same-email re-login: storage is already this account's live
          // state — leave it untouched (restoring a stale snapshot here
          // would discard work done since the snapshot).
        }
        set({ session: { email: normalized, verifiedAt: Date.now(), provider, token } });
      },
      signOut: () => {
        const email = get().session?.email;
        if (typeof window !== "undefined" && email) {
          // Drop any in-flight OTP ticket so it can't be verified later.
          void import("./auth-api").then((m) => m.clearPendingTicket(email));
          // Stash this account's world, then clear to a blank slate.
          stashProfile(email);
          activateProfile("__signed_out__");
        }
        set({ session: null });
      },
    }),
    {
      name: "maxxen-auth-v1",
      version: 1,
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          // Server render: no storage. createJSONStorage catches this and disables persistence.
          throw new Error("localStorage is unavailable during SSR");
        }
        return window.localStorage;
      }),
      partialize: (s) => ({ session: s.session }),
    }
  )
);

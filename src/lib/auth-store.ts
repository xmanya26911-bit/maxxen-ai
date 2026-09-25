import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Auth session store — zustand + persist (localStorage key "maxxen-auth-v1").
 * Deliberately minimal: the product keeps no server-side accounts, so the
 * session is just the verified email + when it was verified. The OTP ticket
 * itself lives (and dies) server-side once the real backend is wired.
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

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      signIn: (email, provider = "email", token = "") =>
        set({ session: { email, verifiedAt: Date.now(), provider, token } }),
      signOut: () => {
        const email = get().session?.email;
        if (email) {
          // Drop any in-flight OTP ticket so it can't be verified later.
          void import("./auth-api").then((m) => m.clearPendingTicket(email));
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

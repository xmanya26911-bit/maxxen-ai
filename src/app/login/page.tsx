import type { Metadata } from "next";
import LoginView from "@/components/auth/login-view";

/**
 * /login — passwordless sign-in (email → 6-digit OTP → workspace).
 * Server component: metadata only; the interactive flow is client-side.
 */
export const metadata: Metadata = {
  title: "Sign in — MAXXEN",
  description:
    "Passwordless sign in to MAXXEN. We email you a 6-digit code that self-destructs in 10 minutes — nothing stored, nothing to leak.",
};

export default function LoginPage() {
  return <LoginView />;
}

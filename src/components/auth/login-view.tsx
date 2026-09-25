"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Github,
  Loader2,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { ChromeLogo } from "@/components/maxxen/logo";
import { cn } from "@/lib/utils";
import {
  type OtpChallenge,
  OtpExpiredError,
  clearPendingTicket,
  formatCountdown,
  isValidEmail,
  requestOtp,
  verifyOtp,
} from "@/lib/auth-api";
import { useAuthStore } from "@/lib/auth-store";

const GITHUB_URL = "https://github.com/xmanya26911-bit/maxxen-ai";

const subscribeNever = () => () => {};
/** True only on the client after hydration — safe gate for persisted state. */
function useMounted() {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}

type Step = "email" | "code" | "success";

const STEP_META: Record<Step, string> = {
  email: "01 · Email",
  code: "02 · Verify code",
  success: "✓ Signed in",
};

const PRIMARY_BTN =
  "mx-focus mx-press flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-white text-sm font-semibold text-black transition-all hover:bg-white/90 hover:shadow-[0_0_28px_-6px_rgba(255,255,255,0.4)] disabled:opacity-40 disabled:hover:shadow-none disabled:hover:bg-white";

/** 6 controlled OTP cells: auto-advance, backspace-nav, arrow keys, paste. */
function OtpCells({
  digits,
  onChange,
  invalid,
}: {
  digits: string[];
  onChange: (next: string[], focusIndex?: number) => void;
  invalid: boolean;
}) {
  const setDigit = (index: number, raw: string) => {
    const all = raw.replace(/\D/g, "");
    const digit = all.slice(0, 1);
    const next = [...digits];
    next[index] = digit;
    // A multi-char entry (or paste into one cell) spills across the rest.
    for (let k = 0; k < all.length - 1 && index + 1 + k < 6; k++) {
      next[index + 1 + k] = all[k + 1];
    }
    const lastIndex = Math.min(5, index + Math.max(0, all.length - 1));
    onChange(next, digit ? lastIndex : undefined);
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...digits];
      if (next[index]) {
        next[index] = "";
        onChange(next, index);
      } else if (index > 0) {
        next[index - 1] = "";
        onChange(next, index - 1);
      }
      return;
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusCell(index - 1);
      return;
    }
    if (e.key === "ArrowRight" && index < 5) {
      e.preventDefault();
      focusCell(index + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const next = ["", "", "", "", "", ""].map((_, i) => pasted[i] ?? "");
    onChange(next, Math.min(5, pasted.length - 1));
  };

  return (
    <div className="grid grid-cols-6 gap-1.5 sm:gap-2" onPaste={handlePaste}>
      {digits.map((digit, i) => (
        <input
          key={i}
          value={digit}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.currentTarget.select()}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          pattern="[0-9]*"
          maxLength={2}
          aria-label={`Digit ${i + 1} of 6`}
          className={cn(
            "mx-focus h-11 w-full rounded-lg border bg-black/60 text-center font-mono text-lg text-white transition-colors sm:h-12",
            digit ? "border-white/25" : "border-white/10 hover:border-white/20 focus:border-white/30",
            invalid && "border-[hsl(var(--glint)/0.45)]"
          )}
        />
      ))}
    </div>
  );
}

/** Focus + select an OTP cell by index (cells are labelled "Digit N of 6"). */
function focusCell(index: number) {
  requestAnimationFrame(() => {
    const cell = document.querySelector<HTMLInputElement>(
      `input[aria-label="Digit ${index + 1} of 6"]`
    );
    cell?.focus();
    cell?.select();
  });
}

/**
 * /login — passwordless email + one-time-code sign-in.
 * Full client flow: email step → code step (live 10-minute expiry countdown,
 * 30 s resend cooldown, auto-verify on the 6th digit) → success → /chat.
 * The API layer is a stub (src/lib/auth-api.ts) with TODO markers for the
 * real backend; the UI contract (states, timings, errors) is final.
 */
export default function LoginView() {
  const router = useRouter();
  const reduceMotion = useReducedMotion() ?? false;

  const session = useAuthStore((s) => s.session);
  const signIn = useAuthStore((s) => s.signIn);
  const signOut = useAuthStore((s) => s.signOut);

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [verifying, setVerifying] = useState(false);
  const verifyingRef = useRef(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [resending, setResending] = useState(false);

  /** Challenge timestamps — expiry of the emailed code + resend unlock. */
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [ttlLeft, setTtlLeft] = useState(0);
  const [cooldownLeft, setCooldownLeft] = useState(0);

  const mounted = useMounted();

  const emailTrimmed = email.trim().toLowerCase();

  /* One interval drives both countdowns while the code step is visible. */
  useEffect(() => {
    if (step !== "code" || expiresAt === null) return;
    const tick = () => {
      const now = Date.now();
      setTtlLeft(Math.max(0, Math.round((expiresAt - now) / 1000)));
      setCooldownLeft(
        cooldownUntil === null ? 0 : Math.max(0, Math.round((cooldownUntil - now) / 1000))
      );
    };
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [step, expiresAt, cooldownUntil]);

  const failVerify = useCallback(
    (message: string) => {
      setCodeError(message);
      setShakeKey((k) => k + 1);
      setDigits(["", "", "", "", "", ""]);
      focusCell(0);
    },
    []
  );

  /* Auto-verify the moment the sixth digit lands — imperative, not an effect
     (a setState-in-effect verify loop deadlocks on its own `verifying` dep). */
  const runVerify = useCallback(
    async (value: string) => {
      if (verifyingRef.current) return;
      verifyingRef.current = true;
      setVerifying(true);
      setCodeError(null);
      try {
        if (expiresAt !== null && Date.now() > expiresAt) {
          throw new OtpExpiredError();
        }
        const { token } = await verifyOtp(emailTrimmed, value);
        signIn(emailTrimmed, "email", token);
        setStep("success");
      } catch (err) {
        failVerify(
          err instanceof Error && err.message
            ? err.message
            : "That code didn't match. Check the 6 digits and try again."
        );
      } finally {
        verifyingRef.current = false;
        setVerifying(false);
      }
    },
    [emailTrimmed, expiresAt, signIn, failVerify]
  );

  const handleDigitsChange = useCallback(
    (next: string[], focusIndex?: number) => {
      setDigits(next);
      if (codeError) setCodeError(null);
      if (focusIndex !== undefined) focusCell(focusIndex);
      const joined = next.join("");
      if (joined.length === 6 && next.every(Boolean)) {
        void runVerify(joined);
      }
    },
    [codeError, runVerify]
  );

  /* Success → /chat after a beat. */
  useEffect(() => {
    if (step !== "success") return;
    const timer = window.setTimeout(() => router.replace("/chat"), 1400);
    return () => window.clearTimeout(timer);
  }, [step, router]);

  const armChallenge = (challenge: OtpChallenge) => {
    setDigits(["", "", "", "", "", ""]);
    setCodeError(null);
    setExpiresAt(Date.now() + challenge.ttlSeconds * 1000);
    setCooldownUntil(Date.now() + challenge.resendCooldownSeconds * 1000);
    setTtlLeft(challenge.ttlSeconds);
    setCooldownLeft(challenge.resendCooldownSeconds);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    if (!isValidEmail(emailTrimmed)) {
      setEmailError("Enter a valid email — we'll send the code there.");
      return;
    }
    setEmailError(null);
    setSending(true);
    try {
      armChallenge(await requestOtp(emailTrimmed));
      setStep("code");
    } catch (err) {
      setEmailError(err instanceof Error && err.message ? err.message : "Couldn't send the code. Try again.");
    } finally {
      setSending(false);
    }
  };

  const googleId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
  const gisBtn = useRef<HTMLDivElement>(null);
  const gisDone = useRef(false);

  const googleCallback = async (credential: string) => {
    if (googleLoading || !credential) return;
    setGoogleLoading(true);
    setEmailError(null);
    try {
      const r = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.session || !j?.email) {
        throw new Error((j && j.error) || "Google sign-in failed. Try again.");
      }
      setEmail(String(j.email));
      signIn(String(j.email), "google", String(j.session));
      setStep("success");
    } catch (err) {
      setEmailError(err instanceof Error && err.message ? err.message : "Google sign-in failed. Try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  /* Real Google Identity Services button — renders Google's own
     continue_with button; the ID token goes to /api/auth/google. */
  useEffect(() => {
    if (!googleId || gisDone.current) return;
    const init = () => {
      const g = (window as unknown as { google?: any }).google;
      if (!g?.accounts?.id || !gisBtn.current || gisDone.current) return false;
      gisDone.current = true;
      g.accounts.id.initialize({
        client_id: googleId,
        callback: (res: { credential?: string }) => void googleCallback(res?.credential || ""),
      });
      g.accounts.id.renderButton(gisBtn.current, {
        theme: "filled_black",
        size: "large",
        width: 320,
        text: "continue_with",
      });
      return true;
    };
    if (!document.querySelector("script[data-maxxen-gis]")) {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.defer = true;
      s.setAttribute("data-maxxen-gis", "1");
      document.head.appendChild(s);
    }
    if (init()) return;
    const t = window.setInterval(() => {
      if (init()) window.clearInterval(t);
    }, 300);
    const stop = window.setTimeout(() => window.clearInterval(t), 12000);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(stop);
    };
  }, [googleId]);

  const handleResend = async () => {
    if (resending || cooldownLeft > 0) return;
    setResending(true);
    try {
      armChallenge(await requestOtp(emailTrimmed));
    } catch (err) {
      setCodeError(err instanceof Error && err.message ? err.message : "Couldn't resend. Try again.");
      setShakeKey((k) => k + 1);
    } finally {
      setResending(false);
    }
  };

  const backToEmail = () => {
    clearPendingTicket(emailTrimmed);
    setStep("email");
    setDigits(["", "", "", "", "", ""]);
    setCodeError(null);
    setExpiresAt(null);
    setCooldownUntil(null);
  };

  const alreadySignedIn = mounted && session !== null && step === "email";

  const stepMotion = {
    initial: reduceMotion ? false : ({ opacity: 0, x: 10 } as const),
    animate: { opacity: 1, x: 0 },
    exit: reduceMotion ? undefined : ({ opacity: 0, x: -10 } as const),
    transition: { duration: 0.22, ease: "easeOut" as const },
  };

  return (
    <div className="relative flex min-h-dvh flex-col bg-background text-foreground">
      {/* Ambient stage — grid, white bloom, one glint echo (fixed, inert). */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 [background-image:linear-gradient(hsl(0_0%_100%/0.035)_1px,transparent_1px),linear-gradient(90deg,hsl(0_0%_100%/0.035)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_65%_55%_at_50%_36%,black_25%,transparent_78%)]" />
        <div className="absolute left-1/2 top-[22%] h-[380px] w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/[0.05] blur-[120px]" />
        <div className="absolute left-1/2 top-[30%] h-[200px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[hsl(var(--glint)/0.06)] blur-[110px]" />
      </div>

      {/* Header — brand + live step indicator */}
      <header className="relative z-10 flex h-16 shrink-0 items-center justify-between px-5 md:px-8">
        <Link
          href="/"
          className="mx-focus group flex items-center gap-2.5 rounded-full p-1 pr-2"
          aria-label="MAXXEN home"
        >
          <ChromeLogo size={26} />
          <span className="text-chrome text-[15px] font-semibold tracking-tight">MAXXEN</span>
        </Link>
        <p
          aria-live="polite"
          className="rounded-full border border-white/[0.08] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40"
        >
          {mounted && session !== null ? "✓ Signed in" : STEP_META[step]}
        </p>
      </header>

      {/* Card */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-5 py-8 md:py-12">
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="liquid-glass w-full max-w-[400px] rounded-2xl p-6 md:p-8"
        >
          <div className="relative min-h-[300px]">
            <AnimatePresence mode="wait" initial={false}>
              {/* Already signed in — short-circuit variant of the entry step */}
              {alreadySignedIn && session ? (
                <motion.div key="signed-in" {...stepMotion}>
                  <div className="flex flex-col items-center py-4 text-center">
                    <div className="relative grid h-14 w-14 place-items-center rounded-full border border-white/15 bg-white/[0.05]">
                      <span className="font-mono text-lg font-medium text-white/90">
                        {session.email.charAt(0).toUpperCase()}
                      </span>
                      <span
                        aria-hidden="true"
                        className="bg-glint animate-glint absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full"
                      />
                    </div>
                    <h1 className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-white">
                      You&apos;re signed in
                    </h1>
                    <p className="mt-2 max-w-[32ch] text-sm leading-relaxed text-muted-foreground">
                      <span className="font-medium text-white">{session.email}</span> — pick up
                      right where you left off.
                    </p>
                    <button
                      type="button"
                      onClick={() => router.push("/chat")}
                      className={cn(PRIMARY_BTN, "mt-6")}
                    >
                      Open workspace
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        signOut();
                        setEmail("");
                        setStep("email");
                      }}
                      className="mx-focus mx-press mt-4 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:text-white"
                    >
                      Use a different account
                    </button>
                  </div>
                </motion.div>
              ) : step === "email" ? (
                <motion.div key="email" {...stepMotion}>
                  <div className="flex items-center gap-3">
                    <ChromeLogo size={34} className="shrink-0" />
                    <div className="min-w-0">
                      <h1 className="text-xl font-semibold tracking-[-0.02em] text-white">
                        Sign in to MAXXEN
                      </h1>
                      <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
                        Passwordless. A 6-digit code, emailed to you.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSend} noValidate className="mt-6">
                    <label
                      htmlFor="mx-login-email"
                      className="block font-mono text-[10px] uppercase tracking-[0.16em] text-white/40"
                    >
                      Email
                    </label>
                    <input
                      id="mx-login-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      autoFocus
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (emailError) setEmailError(null);
                      }}
                      aria-invalid={emailError !== null}
                      aria-describedby={emailError ? "mx-email-error" : undefined}
                      className={cn(
                        "mx-focus mt-2 h-11 w-full rounded-lg border bg-black/60 px-3.5 text-sm text-white placeholder:text-white/25 transition-colors",
                        emailError
                          ? "border-[hsl(var(--glint)/0.45)]"
                          : "border-white/10 hover:border-white/20 focus:border-white/30"
                      )}
                    />
                    <div aria-live="polite" className="min-h-[20px]">
                      {emailError && (
                        <p
                          id="mx-email-error"
                          role="alert"
                          className="flex items-center gap-1.5 pt-1.5 text-xs text-glint"
                        >
                          <TriangleAlert size={12} aria-hidden="true" />
                          {emailError}
                        </p>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={sending || googleLoading || email.trim() === ""}
                      className={cn(PRIMARY_BTN, "mt-3")}
                    >
                      {sending ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          Sending code…
                        </>
                      ) : (
                        <>
                          Continue with email
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </>
                      )}
                    </button>
                  </form>

                  <div className="my-4 flex items-center gap-3" role="separator" aria-label="Or">
                    <span className="h-px flex-1 bg-white/[0.08]" />
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/30">
                      or
                    </span>
                    <span className="h-px flex-1 bg-white/[0.08]" />
                  </div>

                  {googleId ? (
                    <div className="flex flex-col items-center gap-2">
                      <div
                        ref={gisBtn}
                        className="flex min-h-11 items-center justify-center"
                        aria-busy={googleLoading}
                      />
                      {googleLoading && (
                        <p className="flex items-center gap-2 text-xs text-white/50" role="status">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                          Verifying with Google…
                        </p>
                      )}
                    </div>
                  ) : null}

                  <div className="mt-5 flex items-center gap-2">
                    <ShieldCheck size={13} className="shrink-0 text-white/35" aria-hidden="true" />
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-white/35">
                      6 digits · expires 10:00 · nothing stored
                    </p>
                  </div>
                </motion.div>
              ) : step === "code" ? (
                <motion.div key="code" {...stepMotion}>
                  <button
                    type="button"
                    onClick={backToEmail}
                    className="mx-focus mx-press -ml-1 mb-4 inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-xs text-muted-foreground transition-colors hover:text-white"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                    Change email
                  </button>

                  <h1 className="text-xl font-semibold tracking-[-0.02em] text-white">
                    Check your inbox
                  </h1>
                  <p className="mt-1.5 truncate text-[13px] leading-snug text-muted-foreground">
                    We sent a code to{" "}
                    <span className="font-medium text-white">{emailTrimmed}</span>.
                  </p>

                  <motion.div
                    key={shakeKey}
                    initial={reduceMotion ? false : { x: 0 }}
                    animate={
                      codeError && !reduceMotion ? { x: [0, -6, 6, -3, 3, 0] } : { x: 0 }
                    }
                    transition={{ duration: 0.32 }}
                    className="mt-5"
                  >
                    <OtpCells
                      digits={digits}
                      invalid={codeError !== null}
                      onChange={handleDigitsChange}
                    />
                  </motion.div>

                  <div aria-live="polite" className="min-h-[20px]">
                    {codeError ? (
                      <p
                        role="alert"
                        className="flex items-center gap-1.5 pt-2 text-xs text-glint"
                      >
                        <TriangleAlert size={12} aria-hidden="true" />
                        {codeError}
                      </p>
                    ) : verifying ? (
                      <p className="pt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">
                        Verifying…
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4 font-mono text-[10px] uppercase tracking-[0.12em] text-white/35">
                    <span>
                      {ttlLeft > 0 ? `Expires ${formatCountdown(ttlLeft)}` : "Code expired"}
                    </span>
                    {cooldownLeft > 0 ? (
                      <span aria-live="polite">Resend in {formatCountdown(cooldownLeft)}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={resending}
                        className="mx-focus mx-press rounded-md px-1 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-white/70 transition-colors hover:text-white disabled:opacity-40"
                      >
                        {resending ? "Resending…" : "Resend code"}
                      </button>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div key="success" {...stepMotion}>
                  <div className="flex flex-col items-center py-4 text-center">
                    <div className="relative grid h-14 w-14 place-items-center rounded-full border border-white/15 bg-white/[0.05]">
                      <Check className="h-6 w-6 text-white" aria-hidden="true" />
                      <span
                        aria-hidden="true"
                        className="bg-glint animate-glint absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full"
                      />
                    </div>
                    <h1 className="mt-5 text-2xl font-semibold tracking-[-0.02em] text-white">
                      You&apos;re in
                    </h1>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      Signed in as <span className="font-medium text-white">{emailTrimmed}</span>.
                      Taking you to your workspace…
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </main>

      {/* Footer — pinned to the viewport bottom on short screens */}
      <footer className="relative z-10 mt-auto border-t border-white/[0.06] px-5 py-4 md:px-8">
        <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-white/30">
          <span>© 2026 MAXXEN AI</span>
          <div className="flex items-center gap-5">
            <Link
              href="/"
              className="mx-focus rounded px-0.5 py-0.5 transition-colors hover:text-white/70"
            >
              Back to site
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mx-focus inline-flex items-center gap-1 rounded px-0.5 py-0.5 transition-colors hover:text-white/70"
            >
              <Github size={11} aria-hidden="true" />
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

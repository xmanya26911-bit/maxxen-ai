"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { pullVault } from "@/lib/sync";
import "../landing.css";
const ls = (k: string, v?: string) => {
  if (typeof window === "undefined") return "";
  if (v === undefined) return localStorage.getItem(k) || "";
  if (v === "__DEL__") localStorage.removeItem(k);
  else localStorage.setItem(k, v);
  return v;
};
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [ticket, setTicket] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const googleBtn = useRef<HTMLDivElement>(null);
  const googleDone = useRef(false);
  const googleId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
  async function googleLogin(credential: string) {
    setBusy(true);
    setMsg("Verifying with Google…");
    try {
      const r = await fetch("/api/auth/google", { method: "POST", body: JSON.stringify({ credential }) });
      const j = await r.json();
      if (j.ok) {
        ls("maxxen_session", j.session);
        ls("maxxen_otp_email", j.email);
        setMsg("Signed in — restoring your synced setup…");
        try {
          await pullVault(j.session);
        } catch {}
        router.push("/chat");
      } else setMsg(j.error || "Google sign-in failed");
    } catch (e: any) {
      setMsg(e.message || "Google sign-in failed");
    }
    setBusy(false);
  }
  useEffect(() => {
    if (!googleId || googleDone.current) return;
    const init = () => {
      const g = (window as any).google;
      if (!g?.accounts?.id || !googleBtn.current || googleDone.current) return false;
      googleDone.current = true;
      g.accounts.id.initialize({ client_id: googleId, callback: (res: any) => void googleLogin(res?.credential || "") });
      g.accounts.id.renderButton(googleBtn.current, { theme: "filled_black", size: "large", width: 320, text: "continue_with" });
      return true;
    };
    if (!document.querySelector('script[data-maxxen-gis]')) {
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
  });
  useEffect(() => {
    (async () => {
      const s = ls("maxxen_session");
      if (!s) return;
      try {
        const r = await fetch("/api/auth/me", { method: "POST", body: JSON.stringify({ session: s }) });
        if (r.ok) router.replace("/chat");
        else ls("maxxen_session", "__DEL__");
      } catch {}
    })();
    const saved = ls("maxxen_otp_email");
    if (saved) {
      setEmail(saved);
      setTicket(ls("maxxen_otp_ticket"));
      setOtpSent(true);
    }
  }, [router]);
  useEffect(() => {
    if (!cooldown) return;
    const t = window.setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);
  async function sendOtp() {
    if (!email.trim() || busy || cooldown > 0) return;
    setBusy(true);
    setMsg("Sending…");
    try {
      const r = await fetch("/api/auth/send-otp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: email.trim().toLowerCase() }) });
      const j = await r.json();
      if (j.ok) {
        setOtpSent(true);
        setTicket(j.ticket || "");
        ls("maxxen_otp_ticket", j.ticket || "");
        ls("maxxen_otp_email", email.trim().toLowerCase());
        setMsg("Code sent — check your inbox (newest email wins).");
        setCooldown(30);
      } else {
        setMsg(j.error || "Failed to send");
        if (r.status === 429) setCooldown(60);
      }
    } catch (e: any) {
      setMsg(e.message || "Failed to send");
    }
    setBusy(false);
  }
  async function verifyOtp() {
    if (!otp.trim() || busy) return;
    setBusy(true);
    setMsg("Verifying…");
    try {
      const r = await fetch("/api/auth/verify-otp", { method: "POST", body: JSON.stringify({ email, code: otp, ticket }) });
      const j = await r.json();
      if (j.ok) {
        ls("maxxen_otp_ticket", "__DEL__");
        ls("maxxen_otp_email", "__DEL__");
        ls("maxxen_session", j.session);
        try {
          await pullVault(j.session);
        } catch {}
        router.push("/chat");
      } else setMsg(j.error || "Incorrect code");
    } catch (e: any) {
      setMsg(e.message || "Verify failed");
    }
    setBusy(false);
  }
  return (
    <div className="lp">
      <nav className="lp-nav">
        <a href="/" className="lp-brand"><span className="lp-mark"><i /><i /><i /></span>MAXXEN</a>
        <div className="lp-nav-right">
          <a href="/" className="lp-login">Back home</a>
          <a href="/chat" className="lp-cta">Launch app</a>
        </div>
      </nav>
      <div className="lp-login-wrap">
        <span className="lp-orb lp-o1" aria-hidden="true" />
        <span className="lp-orb lp-o2" aria-hidden="true" />
        <div className="lp-card-glass">
          <span className="lp-mark" style={{ transform: "skewX(-18deg) scale(1.6)", margin: "0 auto" }}><i /><i /><i /></span>
          <h1>Welcome <em>back.</em></h1>
          <p>Passwordless login. Enter any email, grab the 6-digit code, done in seconds. Codes die after 10 minutes.</p>
          {googleId ? (
            <>
              <div ref={googleBtn} style={{ display: "flex", justifyContent: "center", minHeight: 44 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "18px 0 4px", color: "#5f5f66", fontSize: 11 }}>
                <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,.08)" }} />
                or continue with email
                <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,.08)" }} />
              </div>
            </>
          ) : null}
          <input className="lp-field" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (otpSent ? verifyOtp() : sendOtp())} aria-label="Email address" autoComplete="email" />
          {!otpSent ? (
            <button className="lp-go" onClick={sendOtp} disabled={busy} style={busy ? { opacity: 0.55 } : undefined}>{busy ? "Sending…" : "Send 6-digit code"}</button>
          ) : (
            <>
              <input className="lp-field otp" placeholder="6-digit code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} onKeyDown={(e) => e.key === "Enter" && verifyOtp()} aria-label="6-digit verification code" inputMode="numeric" autoComplete="one-time-code" />
              <button className="lp-go" onClick={verifyOtp} disabled={busy} style={busy ? { opacity: 0.55 } : undefined}>{busy ? "Verifying…" : "Verify & enter"}</button>
              <button className="lp-resend" onClick={sendOtp} disabled={busy || cooldown > 0}>{cooldown > 0 ? ("Resend in " + cooldown + "s") : "Resend code — older codes stop working"}</button>
            </>
          )}
          {msg && <p className="lp-msg" role="status">{msg}</p>}
          <p className="lp-fine">Codes arrive from xmanya26911@gmail.com.<br />Newest email always wins. Preferences sync encrypted to YOUR repo.</p>
        </div>
      </div>
    </div>
  );
}
"use client";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    (async () => {
      const s = ls("maxxen_session");
      if (!s) return;
      try {
        const r = await fetch("/api/auth/me", { method: "POST", body: JSON.stringify({ session: s }) });
        if (r.ok) router.replace("/chat");
        else ls("maxxen_session", "__DEL__");
      } catch {
      }
    })();
    const saved = ls("maxxen_otp_email");
    if (saved) {
      setEmail(saved);
      setTicket(ls("maxxen_otp_ticket"));
      setOtpSent(true);
    }
  }, [router]);

  async function sendOtp() {
    if (!email.trim() || busy) return;
    setBusy(true);
    setMsg("Sending…");
    try {
      const r = await fetch("/api/auth/send-otp", { method: "POST", body: JSON.stringify({ email }) });
      const j = await r.json();
      if (j.ok) {
        setOtpSent(true);
        setTicket(j.ticket || "");
        ls("maxxen_otp_ticket", j.ticket || "");
        ls("maxxen_otp_email", email);
        setMsg("Code sent — check your inbox (newest email wins).");
      } else setMsg(j.error || "Failed to send");
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
        setMsg("Signed in — restoring your synced setup…");
        try {
          await pullVault(j.session);
        } catch {
        }
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
          <a href="/" className="lp-login">← Back home</a>
          <a href="/chat" className="lp-cta">Launch app ↗</a>
        </div>
      </nav>
      <div className="lp-login-wrap">
        <span className="lp-orb lp-o1" />
        <span className="lp-orb lp-o2" />
        <div className="lp-card-glass">
          <span className="lp-mark" style={{ transform: "skewX(-18deg) scale(1.6)", margin: "0 auto" }}><i /><i /><i /></span>
          <h1>Welcome <em>back.</em></h1>
          <p>Passwordless login. Enter any email, grab the 6-digit code, done in seconds. Codes die after 10 minutes.</p>
          <input className="lp-field" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (otpSent ? verifyOtp() : sendOtp())} aria-label="Email address" autoComplete="email" />
          {!otpSent ? (
            <button className="lp-go" onClick={sendOtp} disabled={busy} style={busy ? { opacity: 0.55 } : undefined}>{busy ? "Sending…" : "Send 6-digit code"}</button>
          ) : (
            <>
              <input className="lp-field otp" placeholder="○ ○ ○ ○ ○ ○" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} onKeyDown={(e) => e.key === "Enter" && verifyOtp()} aria-label="6-digit verification code" inputMode="numeric" autoComplete="one-time-code" />
              <button className="lp-go" onClick={verifyOtp} disabled={busy} style={busy ? { opacity: 0.55 } : undefined}>{busy ? "Verifying…" : "Verify & enter →"}</button>
              <button className="lp-resend" onClick={sendOtp}>Resend code — older codes stop working</button>
            </>
          )}
          {msg && <p className="lp-msg">{msg}</p>}
          <p className="lp-fine">Codes arrive from xmanya26911@gmail.com.<br />Newest email always wins. Nothing is stored.</p>
        </div>
      </div>
    </div>
  );
}

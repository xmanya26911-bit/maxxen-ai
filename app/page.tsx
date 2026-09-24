"use client";
import { useEffect } from "react";
import "./landing.css";

const FEATURES = [
  { g: "✦", t: "Agent chat that builds", d: "Describe anything — websites, apps, dashboards. Maxxen plans the work, writes the code, and shows a live preview.", c: "<code>Chat → Build → Preview</code>" },
  { g: "◈", t: "BYOK — zero cost for you", d: "Paste your own Gemini and ChatGPT keys, plus any custom base URL. Your keys never leave your browser.", c: "<code>Gemini · OpenAI · OpenRouter</code>" },
  { g: "⬢", t: "Storage in YOUR GitHub", d: "Chats, projects and settings save to a private maxxen-data repo in the user's own account. Never the developer's.", c: "<code>maxxen-data · private</code>" },
  { g: "⬣", t: "Plugins via YOUR Composio", d: "Connect Gmail, Notion, Slack, Sheets, GitHub and 500+ tools with your own Composio key. Your plugins, your data.", c: "<code>500+ toolkits</code>" },
  { g: "▲", t: "Deploy to YOUR Vercel", d: "Ship what you build straight to your own Vercel project. This very site runs that way.", c: "<code>maxxen.vercel.app</code>" },
  { g: "✉", t: "10-minute email login", d: "Passwordless OTP login. Codes live exactly 10 minutes, then vanish — nothing stored, nothing to leak.", c: "<code>6 digits · auto-purged</code>" },
];

const FAQS = [
  { q: "Is Maxxen AI free?", a: "Yes. There are no Maxxen servers billing you — you bring your own Gemini / ChatGPT API key, so you only ever pay your AI provider (free tiers work fine). Hosting is your own Vercel, storage is your own GitHub." },
  { q: "Where does my data go?", a: "Into a private <code>maxxen-data</code> repository inside YOUR GitHub account, created automatically from the token you paste. The developer cannot see it — the app literally has no database of its own." },
  { q: "Which AI models work?", a: "Anything OpenAI-compatible plus Gemini: GPT-4o-mini, Gemini Flash, and custom base URLs like OpenRouter or Groq. Pick the model in /chat or Settings." },
  { q: "How do plugins work?", a: "Paste YOUR Composio API key on the Plugins tab, connect toolkits (Gmail, Notion, Slack…) at app.composio.dev, and the agent can act on them. Keys stay in your browser." },
  { q: "Why did my OTP say incorrect?", a: "Each new request replaces the previous code — always use the code from your NEWEST email, within 10 minutes. Hit Resend if unsure." },
];

export default function Landing() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll(".lp-reveal"));
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
      { threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="lp">
      <nav className="lp-nav">
        <a href="/" className="lp-brand">
          <span className="lp-mark"><i /><i /><i /></span>MAXXEN
        </a>
        <div className="lp-links">
          <a href="#product">Product</a>
          <a href="#how">How it works</a>
          <a href="#security">Security</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="lp-nav-right">
          <a href="/login" className="lp-login">Log in</a>
          <a href="/chat" className="lp-cta">Launch app ↗</a>
        </div>
      </nav>

      <header className="lp-hero">
        <span className="lp-orb lp-o1" />
        <span className="lp-orb lp-o2" />
        <span className="lp-orb lp-o3" />
        <p className="lp-eyebrow">MAXXEN AI — <b>YOUR KEYS · YOUR GITHUB · YOUR VERCEL</b></p>
        <h1>BUILD SOMETHING<br /><em>remarkable</em><br />DIFFERENT<span className="dot">.</span></h1>
        <p className="lp-sub">Maxxen is a multipurpose agentic AI that <b>designs, builds and deploys</b> websites, apps and dashboards with you — running on <b>your</b> API keys, <b>your</b> GitHub and <b>your</b> Vercel. Zero cost for anyone else.</p>
        <div className="lp-hero-cta">
          <a href="/login" className="lp-cta">Start building — free ↗</a>
          <a href="#how" className="lp-cta ghost">See how it works</a>
        </div>
        <div className="lp-stats">
          <div className="lp-stat"><b>$0</b><span>PLATFORM COST</span></div>
          <div className="lp-stat"><b>10 min</b><span>OTP LIFETIME</span></div>
          <div className="lp-stat"><b>500+</b><span>PLUGINS VIA COMPOSIO</span></div>
          <div className="lp-stat"><b>100%</b><span>YOUR INFRASTRUCTURE</span></div>
        </div>
      </header>

      <div className="lp-marquee" aria-hidden="true">
        <div className="lp-marquee-track">
          {Array.from({ length: 2 }).flatMap((_, k) => ["WEBSITES", "APPS", "DASHBOARDS", "LANDING PAGES", "AGENTS", "AUTOMATIONS", "PROTOTYPES", "DEPLOYS"].map((w, i) => <span key={`${k}-${i}`}>{w} <i>✦</i></span>))}
        </div>
      </div>

      <section className="lp-section" id="product">
        <p className="lp-kicker lp-reveal">THE PRODUCT</p>
        <h2 className="lp-h2 lp-reveal">One workspace.<br /><em>Every</em> superpower.</h2>
        <p className="lp-lead lp-reveal">Chat, build, preview, save and ship — without handing your keys or your data to anyone.</p>
        <div className="lp-grid">
          {FEATURES.map((f) => (
            <div className="lp-card lp-reveal" key={f.t}>
              <div className="glyph">{f.g}</div>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
              <p style={{ marginTop: 14 }} dangerouslySetInnerHTML={{ __html: f.c }} />
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section" id="how" style={{ paddingTop: 0 }}>
        <p className="lp-kicker lp-reveal">HOW IT WORKS</p>
        <h2 className="lp-h2 lp-reveal">Live in <em>three</em> steps.</h2>
        <div className="lp-steps" style={{ marginTop: 50 }}>
          <div className="lp-step lp-reveal"><b className="num">1</b><h3>Verify your email</h3><p>Get a 6-digit code at any address. It self-destructs in <code>10 minutes</code> — nothing is stored.</p></div>
          <div className="lp-step lp-reveal"><b className="num">2</b><h3>Bring your keys</h3><p>Paste Gemini / ChatGPT keys, your GitHub token and your Composio key. Everything stays in <code>your browser</code>.</p></div>
          <div className="lp-step lp-reveal"><b className="num">3</b><h3>Build &amp; deploy</h3><p>Chat in <code>/chat</code>, preview live builds, save to <code>your GitHub</code>, ship to <code>your Vercel</code>.</p></div>
        </div>
      </section>

      <div className="lp-band" id="security">
        <div className="lp-band-inner">
          <div>
            <p className="lp-kicker lp-reveal">SECURITY MODEL</p>
            <h2 className="lp-h2 lp-reveal">We hold <em>nothing.</em></h2>
            <p className="lp-lead lp-reveal" style={{ marginBottom: 0 }}>There is no Maxxen database. No developer backdoor. Your secrets live in your browser; your work lives in your GitHub.</p>
            <div className="lp-checks">
              <div className="lp-check lp-reveal"><i>✓</i><div><b>Keys never leave your browser</b><span>BYOK calls go straight from your device to OpenAI / Google.</span></div></div>
              <div className="lp-check lp-reveal"><i>✓</i><div><b>Data in your private repo</b><span>Chats and builds save to maxxen-data under your account.</span></div></div>
              <div className="lp-check lp-reveal"><i>✓</i><div><b>OTPs evaporate in 10 minutes</b><span>Signed tickets carry their own expiry; leftovers are purged every request.</span></div></div>
            </div>
          </div>
          <div className="lp-terminal lp-reveal">
            <header><i /><i /><i /></header>
            <pre>{<span className="c"># your footprint on our servers: nothing.</span>}{"\n"}<span className="g">$</span> maxxen login you@mail.com{"\n"}<span className="g">✓</span> code sent · expires in 10:00{"\n"}<span className="g">$</span> maxxen chat --byok{"\n"}<span className="g">✓</span> keys: browser-only{"\n"}<span className="g">✓</span> storage: your-github/maxxen-data{"\n"}<span className="g">✓</span> deploy: your-vercel/maxxen</pre>
          </div>
        </div>
      </div>

      <section className="lp-section">
        <p className="lp-kicker lp-reveal">THE BUILDER</p>
        <h2 className="lp-h2 lp-reveal">Describe it. <em>Ship</em> it.</h2>
        <p className="lp-lead lp-reveal">Every build renders as a live artifact you can preview, apply to your GitHub, and deploy.</p>
        <div className="lp-teaser lp-reveal">
          <div className="lp-teaser-bar"><div className="dots"><i /><i /><i /></div>maxxen.vercel.app/chat</div>
          <div className="lp-teaser-body">
            <div className="lp-teaser-prompt">
              <small>YOU ASKED</small>
              <p>“Build me a premium landing page — <em>editorial type,</em> dark glass, live preview.”</p>
              <div style={{ marginTop: 26 }}><a href="/chat" className="lp-cta">Try it live ↗</a></div>
            </div>
            <div className="lp-teaser-shot">
              <b>MAXXEN</b>
              <strong>BUILT<br />FOR THE<br /><i>DIFFERENT.</i></strong>
              <span>● Live preview · single-file HTML</span>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-section" id="faq" style={{ paddingTop: 0 }}>
        <p className="lp-kicker lp-reveal">QUESTIONS</p>
        <h2 className="lp-h2 lp-reveal">Asked <em>often.</em></h2>
        <div className="lp-faq">
          {FAQS.map((f) => (
            <details key={f.q} className="lp-reveal">
              <summary>{f.q}<span>+</span></summary>
              <p dangerouslySetInnerHTML={{ __html: f.a }} />
            </details>
          ))}
        </div>
      </section>

      <section className="lp-final">
        <span className="lp-orb lp-o1" />
        <span className="lp-orb lp-o2" />
        <p className="lp-eyebrow lp-reveal">FREE FOREVER · BRING YOUR KEYS</p>
        <h2 className="lp-reveal">STOP SCROLLING.<br /><em>Start building.</em></h2>
        <p className="lp-reveal">Your first deploy is two minutes away.</p>
        <div className="lp-hero-cta lp-reveal">
          <a href="/login" className="lp-cta">Get your code ↗</a>
          <a href="/chat" className="lp-cta ghost">Open /chat</a>
        </div>
      </section>

      <footer className="lp-footer">
        <a href="/" className="lp-brand" style={{ fontSize: 12 }}><span className="lp-mark"><i /><i /><i /></span>MAXXEN</a>
        <nav>
          <a href="/chat">Chat</a>
          <a href="/login">Login</a>
          <a href="/settings">Settings</a>
          <a href="https://github.com/xmanya26911-bit/maxxen-ai" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
        <span>BYOK · Your GitHub · Your Vercel · © 2026 Maxxen AI</span>
      </footer>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tools & location settings section — web search, timezone, and location.
 *
 * Privacy-first: coordinates are stored ONLY in this browser's localStorage
 * (never the vault, never the repo) and only after an explicit action below.
 * The search endpoint itself is server-side configuration (env) — this UI
 * only shows whether one is configured, never its value.
 */

const FIELD =
  "mx-focus w-full rounded-lg border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-white/30";
const LABEL = "mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-white/40";
const BTN_GHOST =
  "mx-focus mx-press inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 text-[13px] font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-40";
const BTN_DANGER =
  "mx-focus mx-press inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-red-400/25 bg-red-400/[0.06] px-4 text-[13px] font-medium text-red-200 transition-colors hover:bg-red-400/[0.12] disabled:opacity-40";

function ls(key: string, value?: string): string {
  if (typeof window === "undefined") return "";
  if (value === undefined) return window.localStorage.getItem(key) ?? "";
  window.localStorage.setItem(key, value);
  return value;
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function validTimezone(tz: string): boolean {
  if (!tz.trim() || tz.length > 60) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz.trim() });
    return true;
  } catch {
    return false;
  }
}

export function ToolsSection() {
  // Browser prefs, lazily initialized (SSR-safe: ls() returns "" on the
  // server, detectTimezone() falls back to "UTC"). No post-mount setState,
  // so no cascading render and no hydration flash.
  const [searchOn, setSearchOn] = useState(() => ls("maxxen_search_enabled") !== "0");
  const [maxResults, setMaxResults] = useState(() => ls("maxxen_search_max") || "5");
  const [serverSearch, setServerSearch] = useState<"unknown" | "yes" | "no">("unknown");
  const [timezone, setTimezone] = useState(() => ls("maxxen_timezone") || detectTimezone());
  const [tzMsg, setTzMsg] = useState("");
  const [locOn, setLocOn] = useState(() => ls("maxxen_location_enabled") === "1");
  const [locLabel, setLocLabel] = useState(() => ls("maxxen_location_label"));
  const [locating, setLocating] = useState(false);
  const [status, setStatus] = useState("");

  // Server capability probe only — the single setState runs after a network
  // round-trip (subscription-style effect, not a cascading render).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch("/api/assistant-tools/status", { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!cancelled) setServerSearch(j?.searchConfigured === true ? "yes" : "no");
      } catch {
        if (!cancelled) setServerSearch("no");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const flash = (m: string) => setStatus(m);

  const saveSearch = (on: boolean, max: string) => {
    setSearchOn(on);
    setMaxResults(max);
    ls("maxxen_search_enabled", on ? "1" : "0");
    const n = Math.min(10, Math.max(1, parseInt(max, 10) || 5));
    ls("maxxen_search_max", String(n));
    flash(on ? "Web search on — the agent will use it for current facts." : "Web search off — the agent answers from its own knowledge.");
  };

  const saveTimezone = (tz: string) => {
    setTimezone(tz);
    if (!tz.trim()) {
      ls("maxxen_timezone", "");
      setTzMsg("Using browser timezone.");
      return;
    }
    if (!validTimezone(tz)) {
      setTzMsg("Unknown timezone — use IANA names like Asia/Kolkata.");
      return;
    }
    ls("maxxen_timezone", tz.trim());
    setTzMsg(`Using ${tz.trim()} for local times.`);
  };

  const saveLocation = (on: boolean, label: string, lat?: number, lon?: number, source?: string) => {
    setLocOn(on);
    setLocLabel(label);
    ls("maxxen_location_enabled", on ? "1" : "0");
    ls("maxxen_location_label", label.slice(0, 120));
    if (lat !== undefined && lon !== undefined) {
      ls("maxxen_location_lat", String(lat));
      ls("maxxen_location_lon", String(lon));
    } else {
      window.localStorage.removeItem("maxxen_location_lat");
      window.localStorage.removeItem("maxxen_location_lon");
    }
    ls("maxxen_location_source", source ?? "manual");
    flash(on ? "Location on — sent with chat requests until revoked." : "Location off.");
  };

  const useBrowserLocation = () => {
    if (!("geolocation" in navigator)) {
      flash("This browser has no geolocation — type a city instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        const label = `${latitude.toFixed(3)}, ${longitude.toFixed(3)}`;
        saveLocation(true, label, latitude, longitude, "browser");
      },
      () => {
        setLocating(false);
        flash("Location permission denied — type a city instead, or leave it off.");
      },
      { timeout: 15000, maximumAge: 600000 }
    );
  };

  const revokeLocation = () => {
    for (const k of ["maxxen_location_enabled", "maxxen_location_label", "maxxen_location_lat", "maxxen_location_lon", "maxxen_location_source"]) {
      window.localStorage.removeItem(k);
    }
    setLocOn(false);
    setLocLabel("");
    flash("Location revoked and cleared from this browser.");
  };

  return (
    <section aria-labelledby="tools-h" className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 md:p-6">
      <h2 id="tools-h" className="text-[15px] font-semibold">Assistant tools</h2>
      <p className="mt-1 text-[12.5px] text-muted-foreground">
        Time, web search, page reading. Free building blocks the agent uses when it needs them.
      </p>
      {status && <p role="status" className="mt-2 text-[12px] text-white/55">{status}</p>}

      <div className="mt-4 grid gap-3">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3.5">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold">Web search</h3>
            <span className="ml-auto flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-white/50">
              <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", serverSearch === "yes" ? "bg-emerald-300" : "bg-white/20")} />
              {serverSearch === "yes" ? "Endpoint set" : serverSearch === "no" ? "Not configured" : "Checking…"}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-white/50">
            Searches run through the operator&apos;s SearXNG endpoint (server-side, never exposed). Without one, the agent says so instead of pretending.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={searchOn}
              onClick={() => saveSearch(!searchOn, maxResults)}
              className="mx-focus inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12.5px] text-white/80 transition-colors hover:border-white/25"
            >
              <span aria-hidden="true" className={searchOn ? "flex h-4 w-7 items-center rounded-full bg-emerald-400/80 px-0.5" : "flex h-4 w-7 items-center rounded-full bg-white/15 px-0.5"}>
                <span className={cn("h-3 w-3 rounded-full bg-white transition-all", searchOn ? "ml-auto" : "ml-0")} />
              </span>
              Search enabled
            </button>
            <label className="flex items-center gap-2 text-[12px] text-white/60">
              Max results
              <select
                aria-label="Maximum search results"
                className={cn(FIELD, "h-9 max-w-[90px] py-1.5")}
                value={maxResults}
                onChange={(e) => saveSearch(searchOn, e.target.value)}
              >
                {[3, 5, 8, 10].map((n) => (
                  <option key={n} value={String(n)}>{n}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3.5">
          <h3 className="text-[13px] font-semibold">Timezone</h3>
          <p className="mt-1 text-[12px] text-white/50">Used for local times. Defaults to your browser timezone.</p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <input
              className={cn(FIELD, "h-9 max-w-[240px] py-1.5")}
              value={timezone}
              onChange={(e) => saveTimezone(e.target.value)}
              placeholder="Asia/Kolkata"
              autoComplete="off"
              aria-label="Timezone"
            />
            <button type="button" onClick={() => saveTimezone(detectTimezone())} className={BTN_GHOST}>
              Auto-detect
            </button>
          </div>
          {tzMsg && <p className="mt-1.5 text-[11px] text-white/35">{tzMsg}</p>}
        </div>

        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3.5">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold">Location</h3>
            <span className="ml-auto font-mono text-[10.5px] uppercase tracking-[0.12em] text-white/40">
              {locOn && locLabel ? locLabel : "Off"}
            </span>
          </div>
          <p className="mt-1 text-[12px] text-white/50">
            Optional. Helps with “near me” questions. Asked only when you tap below — never in the background — and kept only in this browser.
          </p>
          <label className={cn(LABEL, "mt-2.5")} htmlFor="tools-city">City or area</label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="tools-city"
              className={cn(FIELD, "h-9 max-w-[240px] py-1.5")}
              value={locOn ? locLabel : ""}
              onChange={(e) => saveLocation(true, e.target.value, undefined, undefined, "manual")}
              placeholder="e.g. Chennai"
              autoComplete="off"
            />
            <button type="button" onClick={useBrowserLocation} disabled={locating} className={BTN_GHOST}>
              {locating ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <MapPin size={14} aria-hidden="true" />}
              {locating ? "Locating…" : "Use precise location"}
            </button>
            {(locOn || locLabel) && (
              <button type="button" onClick={revokeLocation} className={BTN_DANGER}>
                Revoke &amp; clear
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

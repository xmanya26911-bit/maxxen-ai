"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const ls = (k: string, v?: string) => {
  if (typeof window === "undefined") return "";
  if (v === undefined) return localStorage.getItem(k) || "";
  if (v === "__DEL__") localStorage.removeItem(k);
  else localStorage.setItem(k, v);
  return v;
};

export function useSession() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");

  useEffect(() => {
    (async () => {
      const s = ls("maxxen_session");
      if (!s) {
        router.replace("/login");
        return;
      }
      try {
        const r = await fetch("/api/auth/me", { method: "POST", body: JSON.stringify({ session: s }) });
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.email) {
          ls("maxxen_session", "__DEL__");
          router.replace("/login");
          return;
        }
        setEmail(j.email);
        setReady(true);
      } catch {
        router.replace("/login");
      }
    })();
  }, [router]);

  const logout = () => {
    ls("maxxen_session", "__DEL__");
    router.push("/login");
  };

  return { ready, email, logout };
}
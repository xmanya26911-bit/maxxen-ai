"use client";
import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";

// Minimal console primitives for the Settings hub (single design language:
// tailwind + glass). Login/Landing/Chat each own their editorial systems
// intentionally — no cross-system abstraction (see docs in chat).

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" };

export function CButton({ variant = "primary", className = "", ...rest }: BtnProps) {
  const base =
    variant === "primary"
      ? "btn-primary px-5 py-2"
      : variant === "ghost"
        ? "bg-white/10 px-5 py-2 rounded-xl hover:bg-white/15 transition"
        : "bg-red-500/15 border border-red-400/30 text-red-200 px-5 py-2 rounded-xl hover:bg-red-500/25 transition";
  return <button className={`${base} ${className}`} {...rest} />;
}

export function CField(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${props.className || ""}`} {...props} />;
}

export function CSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`input ${props.className || ""}`} {...props} />;
}

export function CPanel({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="glass rounded-2xl p-6">
      <h2 className="text-xl font-bold">{title}</h2>
      {sub && <p className="text-white/60 text-sm mt-1">{sub}</p>}
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

export function CStatus({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="glass p-3 rounded-xl mb-4 text-sm" role="status">
      {text}
    </div>
  );
}

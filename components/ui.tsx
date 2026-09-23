"use client";
import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";

// Minimal console primitives for the Settings hub (single design language:
// tailwind + glass). Login/Landing/Chat each own their editorial systems
// intentionally — no cross-system abstraction (see docs in chat).

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" };

export function CButton({ variant = "primary", className = "", ...rest }: BtnProps) {
  const base = variant === "primary" ? "mx-btn" : variant === "ghost" ? "mx-btn-ghost" : "mx-btn-ghost";
  const danger = variant === "danger" ? { style: { color: "var(--mx-danger)", borderColor: "rgba(224,163,163,.35)" } } : {};
  return <button className={`${base} ${className}`} {...danger} {...rest} />;
}

export function CField(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`mx-field ${props.className || ""}`} {...props} />;
}

export function CSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`mx-field ${props.className || ""}`} {...props} />;
}

export function CPanel({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="mx-panel">
      <h2>{title}</h2>
      {sub && <p className="sub">{sub}</p>}
      <div className="body">{children}</div>
    </div>
  );
}

export function CStatus({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="mx-status" role="status">
      {text}
    </div>
  );
}

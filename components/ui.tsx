"use client";
import type { ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, ReactNode } from "react";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" };

export function CButton({ variant = "primary", className = "", style, ...rest }: BtnProps) {
  const base = variant === "primary" ? "mx-btn" : "mx-btn-ghost";
  const dangerStyle = variant === "danger" ? { color: "var(--mx-danger)", borderColor: "rgba(224,163,163,.35)" } : undefined;
  return <button className={(base + " " + className).trim()} style={{ ...dangerStyle, ...style }} {...rest} />;
}

export function CField(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={("mx-field " + (props.className || "")).trim()} {...props} />;
}

export function CSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={("mx-field " + (props.className || "")).trim()} {...props} />;
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
  return <div className="mx-status" role="status">{text}</div>;
}
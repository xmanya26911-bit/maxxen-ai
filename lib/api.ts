"use client";

// Centralized API client: JSON POST with timeout, consistent errors.
// Pages should use this instead of raw fetch so timeouts and error shapes
// behave the same everywhere.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiPost<T = any>(path: string, body: unknown, opts?: { timeoutMs?: number }): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 60000);
  try {
    const r = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await r.text();
    let j: any = null;
    try {
      j = text ? JSON.parse(text) : null;
    } catch {
      throw new ApiError(r.status, `Bad response from ${path} (HTTP ${r.status}).`);
    }
    if (!r.ok) throw new ApiError(r.status, (j && j.error) || `Request failed (HTTP ${r.status}).`);
    return j as T;
  } catch (e: any) {
    if (e?.name === "AbortError") throw new ApiError(408, `Request to ${path} timed out.`);
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, e?.message || "Network failed.");
  } finally {
    clearTimeout(t);
  }
}

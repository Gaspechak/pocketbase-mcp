import { PB_URL } from "./config.js";

let sessionToken = "";

export function setSessionToken(token: string) {
  sessionToken = token;
}

export function getSessionToken(): string {
  return sessionToken;
}

export function log(msg: string) {
  process.stderr.write(`[pb-mcp] ${msg}\n`);
}

function headers(ct: string | null = "application/json", token?: string | null): Record<string, string> {
  const h: Record<string, string> = {};
  if (ct) h["Content-Type"] = ct;
  const auth = token === undefined ? sessionToken : token;
  if (auth) h["Authorization"] = auth;
  return h;
}

export type PBResult = { ok: boolean; status: number; data?: unknown; error?: string };

export async function pbFetch(path: string, init?: RequestInit, token?: string | null): Promise<PBResult> {
  try {
    const res = await fetch(`${PB_URL}${path}`, {
      ...init,
      headers: { ...headers("application/json", token), ...(init?.headers as Record<string, string> ?? {}) },
    });
    const text = await res.text();
    let data: unknown;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const d = data as Record<string, unknown> | null;
      const error = typeof d?.message === "string" ? d.message
        : typeof d?.error === "string" ? d.error
        : text.trim() || `HTTP ${res.status}`;
      log(`${res.status} ${path} → ${error}`);
      return { ok: false, status: res.status, data, error };
    }
    return { ok: true, status: res.status, data };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Network error";
    log(`FAIL ${path} → ${error}`);
    return { ok: false, status: 0, error };
  }
}

export async function pbFetchAs(token: string, path: string, init?: RequestInit): Promise<PBResult> {
  return pbFetch(path, init, token);
}

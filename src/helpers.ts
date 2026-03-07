import type { PBResult } from "./http.js";

export function out(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

export function respond(r: PBResult) {
  if (!r.ok) return out({ error: r.error, status: r.status, detail: r.data });
  return out(r.data ?? null);
}

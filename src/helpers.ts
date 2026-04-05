import type { PBResult } from "./http.js";

export function out(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorHint(status: number, error?: string): string | undefined {
  if (status === 401) return "Hint: Not authenticated. Call auth_superuser first.";
  if (status === 403) return "Hint: Forbidden. Check API rules or call auth_superuser for superuser access.";
  if (status === 404) {
    if (error && /collection/i.test(error)) return "Hint: Collection not found. Call schema_full to list all collections.";
    return "Hint: Resource not found. Verify the collection name and record id.";
  }
  if (status === 0) return "Hint: Could not connect to PocketBase. Check PB_URL and that the server is running.";
  return undefined;
}

export function respond(r: PBResult) {
  if (!r.ok) {
    const hint = errorHint(r.status, r.error);
    return out({ error: r.error, status: r.status, detail: r.data, ...(hint ? { hint } : {}) });
  }
  return out(r.data ?? null);
}

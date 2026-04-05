import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PB_URL } from "../config.js";
import { pbFetch, log, setSessionToken } from "../http.js";
import { out, respond } from "../helpers.js";

async function loginWithCredentials(email: string, password: string): Promise<boolean> {
  try {
    const res = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: email, password }),
    });
    const text = await res.text();
    let data: Record<string, unknown>;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    if (typeof data.token === "string") {
      setSessionToken(data.token);
      log(`Authenticated as ${email}`);
      return true;
    }
    log(`Auth failed (${res.status}): ${data.message ?? data.error ?? text.slice(0, 200)}`);
    return false;
  } catch (e) {
    log(`Auth error: ${e instanceof Error ? e.message : "Network error"}`);
    return false;
  }
}

export { loginWithCredentials };

export function register(server: McpServer) {
  server.registerTool("auth_superuser", {
    description: "Login as superuser. Call this first if not authenticated.",
    inputSchema: { email: z.string(), password: z.string() },
  }, async ({ email, password }) => {
    const ok = await loginWithCredentials(email, password);
    return out({ ok, authenticated: ok });
  });

  server.registerTool("auth_user", {
    description: [
      "Login as a regular user from any auth collection to TEST API rules from that user's perspective.",
      "Returns a token you can pass to record_test_as_user.",
      "Example: auth_user({ collection:'users', identity:'user@test.com', password:'...' })",
    ].join(" "),
    inputSchema: {
      collection: z.string().default("users"),
      identity: z.string().describe("Email or username"),
      password: z.string(),
    },
  }, async ({ collection, identity, password }) => {
    const res = await pbFetch(`/api/collections/${collection}/auth-with-password`, {
      method: "POST",
      body: JSON.stringify({ identity, password }),
    });
    if (!res.ok) return respond(res);
    const data = res.data as Record<string, unknown>;
    return out({
      token: data.token,
      record: data.record,
      note: "Use this token with record_test_as_user to test rules as this user",
    });
  });

  /* ── auth_methods ───────────────────────────────────────────────── */

  server.registerTool("auth_methods", {
    description: [
      "List available authentication methods for an auth collection.",
      "Returns which auth methods are enabled: password, OAuth2 (with provider list), OTP, MFA.",
      "Useful to discover how users can authenticate before testing auth flows.",
    ].join(" "),
    inputSchema: {
      collection: z.string().default("users").describe("Auth collection name or id"),
    },
  }, async ({ collection }) => respond(await pbFetch(`/api/collections/${collection}/auth-methods`)));

  /* ── auth_refresh ───────────────────────────────────────────────── */

  server.registerTool("auth_refresh", {
    description: [
      "Refresh an existing auth token to extend its validity.",
      "Pass the current token to get a new token + updated record data.",
      "Useful when a token is about to expire during a long testing session.",
    ].join(" "),
    inputSchema: {
      collection: z.string().default("users").describe("Auth collection name or id"),
      token:      z.string().describe("Current valid auth token to refresh"),
    },
  }, async ({ collection, token }) => {
    const res = await pbFetch(`/api/collections/${collection}/auth-refresh`, {
      method: "POST",
    }, token);
    if (!res.ok) return respond(res);
    const data = res.data as Record<string, unknown>;
    return out({ token: data.token, record: data.record });
  });
}

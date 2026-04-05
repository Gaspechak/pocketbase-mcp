import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PB_URL } from "../config.js";
import { pbFetch, getSessionToken } from "../http.js";
import { out, respond } from "../helpers.js";

export function register(server: McpServer) {
  server.registerTool("db_stats", {
    description: "Returns record count per collection. Quick way to understand data volume and verify inserts worked.",
    inputSchema: {
      collections: z.array(z.string()).optional().describe("Specific collections to check. Omit for all."),
    },
  }, async ({ collections }) => {
    const res = await pbFetch("/api/collections?perPage=500");
    if (!res.ok) return respond(res);
    let items = ((res.data as { items?: Record<string, unknown>[] }).items ?? [])
      .filter(c => !(c.name as string).startsWith("_"));
    if (collections?.length) items = items.filter(c => collections.includes(c.name as string));

    const stats = await Promise.all(
      items.map(async c => {
        if (c.type === "view") return { name: c.name, type: "view", note: "view collections have no direct count" };
        const r = await pbFetch(`/api/collections/${c.name}/records?perPage=1&skipTotal=false`);
        const count = (r.data as { totalItems?: number })?.totalItems ?? "error";
        return { name: c.name, type: c.type, totalRecords: count };
      })
    );

    return out(stats);
  });

  server.registerTool("health_check", {
    description: [
      "Check if PocketBase is reachable and return its version.",
      "Call this to verify connectivity before any other operation.",
      "Also reports whether the current session is authenticated.",
    ].join(" "),
    inputSchema: {},
  }, async () => {
    const res = await pbFetch("/api/health", undefined, null);
    const data = res.data as Record<string, unknown> | null;
    return out({
      reachable: res.ok,
      status:    res.status,
      version:   data?.data ? (data.data as Record<string, unknown>).version : undefined,
      authenticated: !!getSessionToken(),
      pbUrl: PB_URL,
    });
  });

  server.registerTool("backup_create", {
    description: [
      "Create a PocketBase backup (ZIP of SQLite DB + pb_data).",
      "Use this as a safety net before destructive schema changes or bulk deletes.",
      "The backup is stored server-side in pb_data/backups/.",
      "name is optional — PocketBase auto-generates a timestamped name if omitted.",
    ].join(" "),
    inputSchema: {
      name: z.string().optional().describe("Backup filename, e.g. 'before_migration.zip'. Auto-generated if omitted."),
    },
  }, async ({ name }) => {
    const body = name ? JSON.stringify({ name }) : "{}";
    const res = await pbFetch("/api/backups", { method: "POST", body });
    if (res.status === 204 || res.ok) return out({ created: true, name: name ?? "(auto-generated)" });
    return respond(res);
  });

  server.registerTool("backup_list", {
    description: "List all available PocketBase backups with size and creation date.",
    inputSchema: {},
  }, async () => respond(await pbFetch("/api/backups")));

  server.registerTool("logs_list", {
    description: [
      "Query PocketBase request logs. Useful to debug rule failures, slow queries, or API errors.",
      "Returns recent API requests logged by PocketBase with status, method, url, auth info, etc.",
      "FILTER EXAMPLES: 'status >= 400' (errors only), 'method = \"POST\"', 'url ~ \"/api/collections/posts\"'",
      "SORT: '-created' (newest first, default), 'created' (oldest first)",
    ].join(" "),
    inputSchema: {
      page:    z.number().int().min(1).optional().default(1),
      perPage: z.number().int().min(1).max(500).optional().default(30),
      filter:  z.string().optional().describe("Filter expression, e.g. 'status >= 400'"),
      sort:    z.string().optional().default("-created"),
    },
  }, async ({ page, perPage, filter, sort }) => {
    const q = new URLSearchParams({ page: String(page), perPage: String(perPage) });
    if (filter) q.set("filter", filter);
    if (sort)   q.set("sort", sort);
    return respond(await pbFetch(`/api/logs?${q}`));
  });

  server.registerTool("file_url", {
    description: [
      "Generate the URL to access a file stored in a PocketBase file field.",
      "For PROTECTED files (field has protected:true), also fetches a short-lived file access token.",
      "URL format: {PB_URL}/api/files/{collectionId}/{recordId}/{filename}",
      "Optional thumb parameter for image thumbnails, e.g. '100x100' or '0x300'.",
    ].join(" "),
    inputSchema: {
      collection: z.string().describe("Collection name or id"),
      recordId:   z.string(),
      filename:   z.string().describe("Exact filename as returned in the record's file field"),
      thumb:      z.string().optional().describe("Thumbnail size, e.g. '100x100', '0x300'"),
      protected:  z.boolean().optional().default(false).describe("Set true to fetch a file access token for protected files"),
    },
  }, async ({ collection, recordId, filename, thumb, protected: isProtected }) => {
    let collectionId = collection;
    const colRes = await pbFetch(`/api/collections/${collection}`);
    if (colRes.ok) collectionId = (colRes.data as Record<string, unknown>).id as string;

    let url = `${PB_URL}/api/files/${collectionId}/${recordId}/${encodeURIComponent(filename)}`;
    if (thumb) url += `?thumb=${encodeURIComponent(thumb)}`;

    let token: string | undefined;
    if (isProtected) {
      const tokenRes = await pbFetch("/api/files/token", { method: "POST" });
      if (tokenRes.ok) {
        token = (tokenRes.data as Record<string, unknown>).token as string;
        url += (url.includes("?") ? "&" : "?") + `token=${token}`;
      }
    }

    return out({ url, token, protected: isProtected });
  });

  /* ── settings ───────────────────────────────────────────────────── */

  server.registerTool("settings_get", {
    description: [
      "Get PocketBase application settings. Superuser only.",
      "Returns app name, URL, SMTP config, S3 storage config, auth options, and more.",
    ].join(" "),
    inputSchema: {},
  }, async () => respond(await pbFetch("/api/settings")));

  server.registerTool("settings_update", {
    description: [
      "Update PocketBase application settings. Superuser only.",
      "Pass only the settings you want to change — other settings are preserved.",
      "Common settings: meta.appName, meta.appURL, smtp.enabled, smtp.host, s3.enabled, etc.",
      "CAUTION: Incorrect settings can break your PocketBase instance.",
    ].join(" "),
    inputSchema: {
      settings: z.record(z.unknown()).describe("Settings object with only the fields to update"),
      confirm:  z.literal(true).describe("Must explicitly pass true to confirm settings change"),
    },
  }, async ({ settings }) => {
    return respond(await pbFetch("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(settings),
    }));
  });

  /* ── backup extras ──────────────────────────────────────────────── */

  server.registerTool("backup_restore", {
    description: [
      "Restore PocketBase from a previously created backup. DANGEROUS — this replaces the current database!",
      "First call backup_list to see available backups and get the key (filename).",
      "The server will restart after a successful restore.",
    ].join(" "),
    inputSchema: {
      key:     z.string().describe("Backup filename/key from backup_list, e.g. 'pb_backup_20240101.zip'"),
      confirm: z.literal(true).describe("Must explicitly pass true to confirm restore"),
    },
  }, async ({ key }) => {
    const res = await pbFetch(`/api/backups/${encodeURIComponent(key)}/restore`, { method: "POST" });
    if (res.status === 204 || res.ok) return out({ restored: true, key, note: "Server may restart." });
    return respond(res);
  });

  server.registerTool("backup_download_url", {
    description: [
      "Generate a download URL for a backup file.",
      "First call backup_list to see available backups and get the key.",
      "The URL includes a short-lived file token for authorization.",
    ].join(" "),
    inputSchema: {
      key: z.string().describe("Backup filename/key from backup_list"),
    },
  }, async ({ key }) => {
    const tokenRes = await pbFetch("/api/files/token", { method: "POST" });
    let token: string | undefined;
    if (tokenRes.ok) token = (tokenRes.data as Record<string, unknown>).token as string;
    const url = `${PB_URL}/api/backups/${encodeURIComponent(key)}` + (token ? `?token=${token}` : "");
    return out({ url, token });
  });
}

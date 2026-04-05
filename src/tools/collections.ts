import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { pbFetch } from "../http.js";
import { out, respond } from "../helpers.js";
import { FIELD_SCHEMA, buildCollectionBody } from "../schemas/fields.js";

export function register(server: McpServer) {
  server.registerTool("collection_create", {
    description: [
      "Create a new PocketBase collection with full schema, rules and indexes.",
      "type='base': general data. type='auth': user/account collection. type='view': read-only SQL SELECT.",
      "",
      "RULES: null=blocked, ''=public, '@request.auth.id != \"\"'=auth required.",
      "Common patterns:",
      "  Own records only: '@request.auth.id != \"\" && user = @request.auth.id'",
      "  Owner or admin: 'user = @request.auth.id || @request.auth.role = \"admin\"'",
      "  Public read, auth write: listRule='', viewRule='', createRule='@request.auth.id != \"\"'",
      "",
      "AUTH collections require passwordAuth option with identityFields.",
      "",
      "VIEW COLLECTIONS: Read-only virtual tables from a SQL SELECT query.",
      "  - viewQuery is required and MUST include an 'id' column",
      "  - Fields are auto-generated from the query — do NOT pass fields array",
      "  - Only listRule and viewRule are allowed (create/update/delete must be null)",
      "  - No indexes allowed (underlying tables' indexes are used)",
      "  - Records are read-only via API (GET only)",
      "  - Example: viewQuery='SELECT p.id, p.title, u.name as author FROM posts p JOIN users u ON p.user = u.id'",
    ].join("\n"),
    inputSchema: {
      name: z.string().describe("Collection name, used as table name. Snake_case, no spaces."),
      type: z.enum(["base","auth","view"]).default("base"),

      listRule:   z.string().nullable().optional().describe("null=blocked, ''=public, string=filter"),
      viewRule:   z.string().nullable().optional(),
      createRule: z.string().nullable().optional(),
      updateRule: z.string().nullable().optional(),
      deleteRule: z.string().nullable().optional(),

      fields:  FIELD_SCHEMA.optional(),
      indexes: z.array(z.string()).optional()
                 .describe("SQL index expressions e.g. 'CREATE UNIQUE INDEX idx_users_email ON users (email)'"),

      viewQuery: z.string().optional().describe("view type: SELECT SQL query"),

      authRule:    z.string().nullable().optional().describe("auth: extra rule evaluated on every auth request"),
      manageRule:  z.string().nullable().optional().describe("auth: who can manage other users"),
      passwordAuth: z.object({
        enabled:        z.boolean().default(true),
        identityFields: z.array(z.string()).default(["email"]).describe("e.g. ['email'] or ['email','username']"),
      }).optional(),
      mfa: z.object({ enabled: z.boolean(), duration: z.number().optional() }).optional(),
      otp: z.object({ enabled: z.boolean(), duration: z.number().optional(), length: z.number().optional() }).optional(),
    },
  }, async (input) => {
    const body = buildCollectionBody(input);
    return respond(await pbFetch("/api/collections", { method: "POST", body: JSON.stringify(body) }));
  });

  server.registerTool("collection_update", {
    description: [
      "Update an existing collection: add/modify fields, change rules, add indexes.",
      "IMPORTANT: To modify an existing field, include its current 'id' (from schema_full) in the field object.",
      "Fields without an id are treated as NEW fields. Fields omitted from the array are REMOVED.",
      "Always call schema_collection first to get current field ids before updating.",
    ].join(" "),
    inputSchema: {
      collection: z.string().describe("Collection name or id"),
      name:       z.string().optional().describe("Rename collection"),
      listRule:   z.string().nullable().optional(),
      viewRule:   z.string().nullable().optional(),
      createRule: z.string().nullable().optional(),
      updateRule: z.string().nullable().optional(),
      deleteRule: z.string().nullable().optional(),
      fields:     z.array(z.object({
        id:       z.string().optional().describe("Existing field id from schema_collection. Omit for new fields."),
        name:     z.string(),
        type:     z.string(),
        required: z.boolean().optional(),
      }).passthrough()).optional(),
      indexes:     z.array(z.string()).optional(),
      viewQuery:   z.string().optional(),
      authRule:    z.string().nullable().optional(),
      manageRule:  z.string().nullable().optional(),
      passwordAuth: z.object({ enabled: z.boolean(), identityFields: z.array(z.string()) }).optional(),
    },
  }, async ({ collection, ...rest }) => {
    const body = buildCollectionBody(rest);
    return respond(await pbFetch(`/api/collections/${collection}`, { method: "PATCH", body: JSON.stringify(body) }));
  });

  server.registerTool("collection_delete", {
    description: "Permanently delete a collection AND all its records. Irreversible. Fails if other collections have relation fields pointing to it.",
    inputSchema: {
      collection: z.string(),
      confirm: z.literal(true).describe("Must explicitly pass true to confirm deletion"),
    },
  }, async ({ collection }) => {
    const res = await pbFetch(`/api/collections/${collection}`, { method: "DELETE" });
    if (res.status === 204 || res.ok) return out({ deleted: true, collection });
    return respond(res);
  });

  server.registerTool("collections_import", {
    description: [
      "Batch import/upsert multiple collections in one atomic transaction.",
      "Ideal for creating an entire schema at once (e.g. full project migration).",
      "deleteMissing=true will DELETE any collection NOT in the provided list — use with caution.",
      "Each item follows the same shape as collection_create.",
    ].join(" "),
    inputSchema: {
      collections: z.array(z.record(z.unknown()))
        .describe("Array of collection objects. Same shape as collection_create body."),
      deleteMissing: z.boolean().default(false)
        .describe("If true, deletes collections not present in this import. Dangerous!"),
    },
  }, async ({ collections, deleteMissing }) => {
    return respond(await pbFetch("/api/collections/import", {
      method: "PUT",
      body: JSON.stringify({ collections, deleteMissing }),
    }));
  });

  /* ── collection_fields_add ──────────────────────────────────────── */

  server.registerTool("collection_fields_add", {
    description: [
      "Add new fields to an existing collection WITHOUT needing to pass the full field list with IDs.",
      "Fetches the current schema, appends the new fields, and sends the update.",
      "This is the simplest way to add fields — no need to call schema_collection first.",
      "Note: You can NOT modify or delete existing fields with this tool (use collection_update for that).",
    ].join(" "),
    inputSchema: {
      collection: z.string().describe("Collection name or id"),
      fields: FIELD_SCHEMA.describe("New fields to add. Same format as collection_create fields."),
    },
  }, async ({ collection, fields }) => {
    // Fetch current collection schema
    const colRes = await pbFetch(`/api/collections/${collection}`);
    if (!colRes.ok) return respond(colRes);

    const current = colRes.data as Record<string, unknown>;
    const existingFields = (current.fields as unknown[]) ?? [];

    // Append new fields to existing ones
    const allFields = [...existingFields, ...fields];

    return respond(await pbFetch(`/api/collections/${collection}`, {
      method: "PATCH",
      body: JSON.stringify({ fields: allFields }),
    }));
  });

  /* ── collection_duplicate ───────────────────────────────────────── */

  server.registerTool("collection_duplicate", {
    description: [
      "Clone an existing collection's schema under a new name.",
      "Copies all fields (without IDs, so PocketBase generates new ones), rules, indexes, and type-specific options.",
      "Does NOT copy records — only the schema structure.",
    ].join(" "),
    inputSchema: {
      source:  z.string().describe("Source collection name or id to clone from"),
      newName: z.string().describe("Name for the new collection"),
    },
  }, async ({ source, newName }) => {
    const colRes = await pbFetch(`/api/collections/${source}`);
    if (!colRes.ok) return respond(colRes);

    const src = colRes.data as Record<string, unknown>;

    // Strip IDs from fields so PocketBase generates new ones
    const fields = ((src.fields as Record<string, unknown>[]) ?? [])
      .filter(f => !f.system)
      .map(({ id: _id, ...rest }) => rest);

    const body: Record<string, unknown> = {
      name: newName,
      type: src.type,
      listRule:   src.listRule,
      viewRule:   src.viewRule,
      createRule: src.createRule,
      updateRule: src.updateRule,
      deleteRule: src.deleteRule,
      fields,
    };

    // Copy type-specific options
    if (src.type === "auth") {
      body.authRule     = src.authRule;
      body.manageRule   = src.manageRule;
      body.passwordAuth = src.passwordAuth;
      body.mfa          = src.mfa;
      body.otp          = src.otp;
      body.oauth2        = src.oauth2;
    }
    if (src.type === "view") {
      body.viewQuery = src.viewQuery;
    }

    // Copy indexes, replacing old collection name with new name
    if (Array.isArray(src.indexes) && src.indexes.length > 0) {
      body.indexes = (src.indexes as string[]).map(idx =>
        idx.replace(new RegExp(`\\b${src.name as string}\\b`, "g"), newName)
      );
    }

    return respond(await pbFetch("/api/collections", { method: "POST", body: JSON.stringify(body) }));
  });
}

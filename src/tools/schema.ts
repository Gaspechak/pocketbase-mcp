import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { pbFetch } from "../http.js";
import { out, respond } from "../helpers.js";

export function register(server: McpServer) {
  server.registerTool("schema_full", {
    description: [
      "CALL THIS FIRST before any schema work. Returns the COMPLETE database schema in one call:",
      "all collections with all fields (name, type, options, required), all API rules, all indexes,",
      "and a RELATIONSHIP MAP showing which collections reference which (forward + back-relations).",
      "includeSystem=true to also see _superusers, _mfas, _otps, _authOrigins, _externalAuths.",
    ].join(" "),
    inputSchema: {
      includeSystem: z.boolean().optional().default(false),
    },
  }, async ({ includeSystem }) => {
    const res = await pbFetch("/api/collections?perPage=500");
    if (!res.ok) return respond(res);

    const payload = res.data as { items?: Record<string, unknown>[] };
    let collections = payload.items ?? [];
    if (!includeSystem) collections = collections.filter(c => !(c.name as string).startsWith("_"));

    const idToName = new Map<string, string>(collections.map(c => [c.id as string, c.name as string]));
    const relationMap: Record<string, { referencedBy: string[]; references: string[] }> = {};
    for (const c of collections) {
      const name = c.name as string;
      if (!relationMap[name]) relationMap[name] = { referencedBy: [], references: [] };
    }
    for (const c of collections) {
      const name = c.name as string;
      const fields = (c.fields as Record<string, unknown>[]) ?? [];
      for (const f of fields) {
        if (f.type === "relation" && f.collectionId) {
          const targetName = idToName.get(f.collectionId as string);
          if (targetName) {
            relationMap[name].references.push(`${f.name as string} → ${targetName}`);
            if (relationMap[targetName]) {
              relationMap[targetName].referencedBy.push(`${name}.${f.name as string}`);
            }
          }
        }
      }
    }

    const result = collections.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      ...(c.type === "view" ? { _note: "READ-ONLY view collection (SQL query below)" } : {}),
      system: c.system,
      rules: {
        list:   c.listRule,
        view:   c.viewRule,
        create: c.createRule,
        update: c.updateRule,
        delete: c.deleteRule,
        ...(c.type === "auth" ? { auth: (c as Record<string, unknown>).authRule, manage: (c as Record<string, unknown>).manageRule } : {}),
      },
      indexes: c.indexes,
      authOptions: c.type === "auth" ? {
        passwordAuth: (c as Record<string, unknown>).passwordAuth,
        mfa:          (c as Record<string, unknown>).mfa,
        otp:          (c as Record<string, unknown>).otp,
        oauth2:       (c as Record<string, unknown>).oauth2,
      } : undefined,
      viewQuery: c.type === "view" ? (c as Record<string, unknown>).viewQuery : undefined,
      fields: ((c.fields as Record<string, unknown>[]) ?? [])
        .filter(f => !(f as Record<string, unknown>).system)
        .map(f => ({
          name: f.name,
          type: f.type,
          required: f.required,
          ...Object.fromEntries(
            Object.entries(f as Record<string, unknown>)
              .filter(([k, v]) => !["id","name","type","required","system","hidden","presentable","primaryKey"].includes(k) && v !== null && v !== "" && v !== 0 && v !== false)
          ),
        })),
      relations: relationMap[c.name as string],
    }));

    // Summarize by type
    const byType = { base: 0, auth: 0, view: 0 };
    for (const c of result) {
      const t = c.type as keyof typeof byType;
      if (t in byType) byType[t]++;
    }

    return out({ totalCollections: result.length, byType, collections: result });
  });

  server.registerTool("schema_collection", {
    description: [
      "Get full schema of a single collection: all fields with id + name + type + options, API rules, indexes, auth config.",
      "For VIEW collections, also returns the viewQuery SQL and auto-generated fields.",
      "Use this before collection_update to get field IDs needed for modifying existing fields.",
    ].join(" "),
    inputSchema: { collection: z.string().describe("Collection name or id") },
  }, async ({ collection }) => respond(await pbFetch(`/api/collections/${collection}`)));
}

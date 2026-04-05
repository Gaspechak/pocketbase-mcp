import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { pbFetch } from "../http.js";
import { out, respond } from "../helpers.js";

export function register(server: McpServer) {
  server.registerTool("record_list", {
    description: [
      "List records from a collection. Use filter to test API rules and query conditions.",
      "FILTER SYNTAX: 'status = \"active\"' | 'age > 18' | 'tags ~ \"sports\"' | 'created >= \"2024-01-01\"'",
      "OPERATORS: = != > >= < <= ~ !~ (exact) | ?= ?!= ?> ?~ (any-match for relations)",
      "LOGIC: && (AND), || (OR)",
      "DATE MACROS: @now, @todayStart, @todayEnd, @monthStart, @monthEnd, @yearStart, @yearEnd",
      "  Examples: 'created >= @todayStart' | 'expires < @now' | 'created >= @monthStart'",
      "FIELD MODIFIERS: tags:length > 3, name:lower = \"john\", avatar:isset = true, tags:each ~ \"sport\"",
      "RELATION TRAVERSAL: 'author.name ~ \"João\"' | 'author.company.name = \"Acme\"' (up to 6 levels)",
      "BACK-RELATIONS: 'comments_via_post.status = \"approved\"' — filter by records that reference this one",
      "SORT: '-created' (desc) | '+name' or 'name' (asc) | '-created,name' (multiple)",
      "EXPAND: 'author' | 'author,category' | 'author.company' | 'comments_via_post' (back-relation expand)",
      "FIELDS: 'id,name,status' to limit returned fields (saves tokens). 'id,expand.author.name' for expanded.",
      "Set skipTotal=true for faster queries when you don't need pagination info.",
    ].join(" "),
    inputSchema: {
      collection: z.string(),
      page:       z.number().int().min(1).optional().default(1),
      perPage:    z.number().int().min(1).max(500).optional().default(30),
      filter:     z.string().optional().describe("Filter expression"),
      sort:       z.string().optional().describe("Sort fields, e.g. '-created'"),
      expand:     z.string().optional().describe("Comma-separated relation fields to expand"),
      fields:     z.string().optional().describe("Comma-separated fields to include"),
      skipTotal:  z.boolean().optional().default(false),
    },
  }, async ({ collection, page, perPage, filter, sort, expand, fields, skipTotal }) => {
    const q = new URLSearchParams({ page: String(page), perPage: String(perPage) });
    if (filter)    q.set("filter",    filter);
    if (sort)      q.set("sort",      sort);
    if (expand)    q.set("expand",    expand);
    if (fields)    q.set("fields",    fields);
    if (skipTotal) q.set("skipTotal", "true");
    return respond(await pbFetch(`/api/collections/${collection}/records?${q}`));
  });

  server.registerTool("record_get", {
    description: "Get a single record by id. Supports expand and field filtering.",
    inputSchema: {
      collection: z.string(),
      id:         z.string(),
      expand:     z.string().optional(),
      fields:     z.string().optional(),
    },
  }, async ({ collection, id, expand, fields }) => {
    const q = new URLSearchParams();
    if (expand) q.set("expand", expand);
    if (fields) q.set("fields", fields);
    return respond(await pbFetch(`/api/collections/${collection}/records/${id}?${q}`));
  });

  server.registerTool("record_create", {
    description: [
      "Create a record in a collection.",
      "For TESTING RULES: this runs against the collection's createRule.",
      "Use auth_user + record_test_as_user to test creation as a specific user.",
      "Relation fields: pass single id string or array of ids for multi-relation.",
      "Select fields: pass string for single-select or array for multi-select.",
      "Bool fields: pass true/false. Number fields: pass numeric value.",
    ].join(" "),
    inputSchema: {
      collection: z.string(),
      data:       z.record(z.unknown()).describe("Record fields as key-value object"),
      expand:     z.string().optional(),
    },
  }, async ({ collection, data, expand }) => {
    const q = expand ? `?expand=${expand}` : "";
    return respond(await pbFetch(`/api/collections/${collection}/records${q}`, {
      method: "POST",
      body:   JSON.stringify(data),
    }));
  });

  server.registerTool("record_update", {
    description: [
      "Update an existing record. Only provided fields are modified (PATCH semantics).",
      "NUMBER modifiers: { 'score+': 5 } adds 5. { 'score-': 3 } subtracts 3.",
      "RELATION modifiers: { 'tags+': 'ID_TO_ADD' } appends. { 'tags-': 'ID_TO_REMOVE' } removes.",
      "TEXT modifier: { 'slug:autogenerate': '' } triggers autogenerate if pattern is set.",
    ].join(" "),
    inputSchema: {
      collection: z.string(),
      id:         z.string(),
      data:       z.record(z.unknown()),
      expand:     z.string().optional(),
    },
  }, async ({ collection, id, data, expand }) => {
    const q = expand ? `?expand=${expand}` : "";
    return respond(await pbFetch(`/api/collections/${collection}/records/${id}${q}`, {
      method: "PATCH",
      body:   JSON.stringify(data),
    }));
  });

  server.registerTool("record_delete", {
    description: "Delete a record by id. Will fail if other records have required relation fields pointing to it (unless cascadeDelete is set).",
    inputSchema: { collection: z.string(), id: z.string() },
  }, async ({ collection, id }) => {
    const res = await pbFetch(`/api/collections/${collection}/records/${id}`, { method: "DELETE" });
    if (res.status === 204 || res.ok) return out({ deleted: true, id });
    return respond(res);
  });

  // Bulk operations

  server.registerTool("record_create_bulk", {
    description: [
      "Create multiple records in a single call. Runs all inserts in parallel for speed.",
      "Returns a summary with created records and any errors.",
      "Example: record_create_bulk({ collection:'posts', records:[{title:'A'},{title:'B'}] })",
    ].join(" "),
    inputSchema: {
      collection: z.string(),
      records:    z.array(z.record(z.unknown())).min(1).max(200)
                   .describe("Array of record data objects. Max 200 per call."),
    },
  }, async ({ collection, records }) => {
    const settled = await Promise.allSettled(
      records.map(async (data, i) => {
        const r = await pbFetch(`/api/collections/${collection}/records`, {
          method: "POST",
          body: JSON.stringify(data),
        });
        if (r.ok) return { index: i, ok: true as const, id: (r.data as Record<string, unknown>).id };
        return { index: i, ok: false as const, error: r.error, detail: r.data, status: r.status };
      })
    );
    const results = settled.map(s => s.status === "fulfilled" ? s.value : { ok: false, error: String((s as PromiseRejectedResult).reason) });
    const created = results.filter(r => r.ok);
    const failed  = results.filter(r => !r.ok);
    return out({ total: records.length, created: created.length, failed: failed.length, results });
  });

  server.registerTool("record_update_bulk", {
    description: [
      "Update multiple records in a single call. Runs all updates in parallel.",
      "Each item must include an 'id' field plus the fields to update (PATCH semantics).",
      "Example: record_update_bulk({ collection:'posts', records:[{id:'abc',status:'published'},{id:'def',status:'archived'}] })",
    ].join(" "),
    inputSchema: {
      collection: z.string(),
      records:    z.array(z.object({ id: z.string() }).passthrough()).min(1).max(200)
                   .describe("Array of objects with 'id' + fields to update. Max 200 per call."),
    },
  }, async ({ collection, records }) => {
    const settled = await Promise.allSettled(
      records.map(async ({ id, ...data }, i) => {
        const r = await pbFetch(`/api/collections/${collection}/records/${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        });
        if (r.ok) return { index: i, ok: true as const, id };
        return { index: i, ok: false as const, id, error: r.error, detail: r.data, status: r.status };
      })
    );
    const results = settled.map(s => s.status === "fulfilled" ? s.value : { ok: false, error: String((s as PromiseRejectedResult).reason) });
    const updated = results.filter(r => r.ok);
    const failed  = results.filter(r => !r.ok);
    return out({ total: records.length, updated: updated.length, failed: failed.length, results });
  });

  server.registerTool("record_delete_bulk", {
    description: [
      "Delete multiple records in a single call. Runs all deletes in parallel.",
      "Returns summary of successes and failures (e.g. records blocked by relation constraints).",
    ].join(" "),
    inputSchema: {
      collection: z.string(),
      ids:        z.array(z.string()).min(1).max(200)
                   .describe("Array of record ids to delete. Max 200 per call."),
    },
  }, async ({ collection, ids }) => {
    const settled = await Promise.allSettled(
      ids.map(async (id, i) => {
        const r = await pbFetch(`/api/collections/${collection}/records/${id}`, { method: "DELETE" });
        if (r.status === 204 || r.ok) return { index: i, ok: true as const, id };
        return { index: i, ok: false as const, id, error: r.error, detail: r.data, status: r.status };
      })
    );
    const results = settled.map(s => s.status === "fulfilled" ? s.value : { ok: false, error: String((s as PromiseRejectedResult).reason) });
    const deleted = results.filter(r => r.ok);
    const failed  = results.filter(r => !r.ok);
    return out({ total: ids.length, deleted: deleted.length, failed: failed.length, results });
  });
}

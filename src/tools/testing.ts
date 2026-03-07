import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { pbFetch, pbFetchAs } from "../http.js";
import { out } from "../helpers.js";

export function register(server: McpServer) {
  server.registerTool("record_test_as_user", {
    description: [
      "TEST API RULES by executing a read or write operation AS a specific user.",
      "First get a user token with auth_user, then use it here.",
      "This lets you verify: 'can user X list records?', 'can user X update record Y?', etc.",
      "method='GET' tests listRule/viewRule. 'POST' tests createRule. 'PATCH' tests updateRule. 'DELETE' tests deleteRule.",
      "A 403 response means the rule BLOCKS the user. 200/201 means the rule ALLOWS it.",
    ].join(" "),
    inputSchema: {
      userToken:  z.string().describe("Token from auth_user tool"),
      collection: z.string(),
      method:     z.enum(["GET","POST","PATCH","DELETE"]).default("GET"),
      recordId:   z.string().optional().describe("Required for GET/PATCH/DELETE on specific record"),
      data:       z.record(z.unknown()).optional().describe("Body for POST/PATCH"),
      filter:     z.string().optional().describe("Filter for GET list"),
      expand:     z.string().optional(),
    },
  }, async ({ userToken, collection, method, recordId, data, filter, expand }) => {
    let path = `/api/collections/${collection}/records`;
    const q = new URLSearchParams();
    if (recordId) path += `/${recordId}`;
    else if (filter) q.set("filter", filter);
    if (expand) q.set("expand", expand);
    const qs = q.toString();
    if (qs) path += `?${qs}`;

    const init: RequestInit = { method };
    if (data && (method === "POST" || method === "PATCH")) {
      init.body = JSON.stringify(data);
    }

    const result = await pbFetchAs(userToken, path, init);
    return out({
      allowed: result.ok,
      status:  result.status,
      verdict: result.ok
        ? `✅ ALLOWED — rule permits this ${method} operation`
        : `🚫 BLOCKED — rule denies this ${method} (status ${result.status})`,
      response: result.data ?? result.error,
    });
  });

  server.registerTool("record_test_public", {
    description: [
      "TEST API RULES without any authentication (no token).",
      "Useful to verify public access rules ('') vs blocked rules (null).",
      "A 401 means auth required. 403 means forbidden. 200 means publicly accessible.",
    ].join(" "),
    inputSchema: {
      collection: z.string(),
      method:     z.enum(["GET","POST","PATCH","DELETE"]).default("GET"),
      recordId:   z.string().optional(),
      data:       z.record(z.unknown()).optional(),
      filter:     z.string().optional(),
      expand:     z.string().optional(),
      fields:     z.string().optional(),
    },
  }, async ({ collection, method, recordId, data, filter, expand, fields }) => {
    let path = `/api/collections/${collection}/records`;
    if (recordId) path += `/${recordId}`;
    const q = new URLSearchParams();
    if (filter) q.set("filter", filter);
    if (expand) q.set("expand", expand);
    if (fields) q.set("fields", fields);
    const qs = q.toString();
    if (qs) path += `?${qs}`;

    const init: RequestInit = { method };
    if (data && (method === "POST" || method === "PATCH")) init.body = JSON.stringify(data);

    const result = await pbFetch(path, init, null);

    return out({
      allowed:  result.ok,
      status:   result.status,
      verdict:  result.ok
        ? `✅ PUBLICLY ACCESSIBLE — rule is '' (empty string) or missing`
        : `🚫 BLOCKED for unauthenticated requests (status ${result.status})`,
      response: result.data ?? result.error,
    });
  });
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { pbFetch, getSessionToken } from "../http.js";
import { PB_URL } from "../config.js";

/* ── static reference sections ────────────────────────────────────── */

const SECTION_OVERVIEW = `
# PocketBase MCP — Quick-Start Guide

## Recommended Workflow
1. **pb_mcp_guide** → You are here. Read this first.
2. **health_check** → Verify PocketBase is reachable.
3. **auth_superuser** → Authenticate (if not already via env vars).
4. **schema_full** → Get the complete database schema, fields, rules, and relationship map.
5. Then use CRUD / schema / testing tools as needed.

## Tool Catalog

### Authentication
| Tool | Purpose |
|------|---------|
| auth_superuser | Login as superuser with email + password |
| auth_user | Login as regular user to get a token for testing API rules |
| auth_methods | List available auth methods for a collection (password, OAuth2, OTP, MFA) |
| auth_refresh | Refresh an existing auth token |

### Schema Introspection
| Tool | Purpose |
|------|---------|
| schema_full | Get ALL collections with fields, rules, indexes, and relationship map |
| schema_collection | Get full schema of a single collection |

### Schema Management
| Tool | Purpose |
|------|---------|
| collection_create | Create a new collection (base, auth, or view type) |
| collection_update | Modify fields, rules, indexes of an existing collection |
| collection_delete | Permanently delete a collection and all its records |
| collection_fields_add | Add new fields to an existing collection (no need to pass full schema) |
| collection_duplicate | Clone a collection's schema under a new name |
| collections_import | Batch import/upsert multiple collections atomically |

### Record Operations
| Tool | Purpose |
|------|---------|
| record_list | Query records with filter, sort, expand, pagination |
| record_get | Get a single record by id |
| record_create | Create a new record |
| record_update | Update a record (PATCH semantics, supports modifiers) |
| record_delete | Delete a record by id |
| record_create_bulk | Batch create up to 200 records in parallel |
| record_update_bulk | Batch update up to 200 records in parallel |
| record_delete_bulk | Batch delete up to 200 records in parallel |

### API Rule Testing
| Tool | Purpose |
|------|---------|
| record_test_as_user | Test operations AS a specific authenticated user |
| record_test_public | Test operations without authentication (public access) |

### Utilities
| Tool | Purpose |
|------|---------|
| health_check | Check PocketBase connectivity, version, auth status |
| db_stats | Record count per collection |
| backup_create | Create a server-side backup |
| backup_list | List available backups |
| backup_restore | Restore from a backup (dangerous, requires confirm) |
| backup_download_url | Get a download URL for a backup file |
| logs_list | Query PocketBase request logs |
| file_url | Generate file access URLs (supports protected files + thumbnails) |
| settings_get | Get PocketBase app settings (superuser only) |
| settings_update | Update PocketBase app settings (superuser only) |
`;

const SECTION_FILTERS = `
## Filter Syntax Cheat Sheet

### Operators
| Operator | Meaning | Example |
|----------|---------|---------|
| = | Equal | status = "active" |
| != | Not equal | role != "guest" |
| > | Greater than | age > 18 |
| >= | Greater or equal | price >= 100 |
| < | Less than | score < 50 |
| <= | Less or equal | rating <= 5 |
| ~ | Like / contains | title ~ "hello" |
| !~ | Not like | name !~ "test" |
| ?= | Any equal (relations) | tags.id ?= "abc" |
| ?!= | Any not equal | tags.name ?!= "draft" |
| ?> | Any greater | items.price ?> 100 |
| ?~ | Any like | authors.name ?~ "John" |

### Logical
| Operator | Example |
|----------|---------|
| && | status = "active" && verified = true |
| \\|\\| | role = "admin" \\|\\| role = "mod" |

### Date & Time Macros
| Macro | Meaning |
|-------|---------|
| @now | Current datetime |
| @todayStart | Start of today (00:00:00) |
| @todayEnd | End of today (23:59:59) |
| @monthStart | Start of current month |
| @monthEnd | End of current month |
| @yearStart | Start of current year |
| @yearEnd | End of current year |
| @yesterday | 24h ago |
| @tomorrow | 24h from now |

### Field Modifiers (in filters)
| Modifier | Meaning | Example |
|----------|---------|---------|
| :length | Array/string length | tags:length > 3 |
| :each | Apply to each element | tags:each ~ "sport" |
| :isset | Check if field has value | avatar:isset = true |
| :lower | Lowercase comparison | name:lower = "john" |
| :upper | Uppercase comparison | code:upper = "ABC" |

### Relation Traversal
- Forward: \`author.name ~ "João"\` — access fields of a related record
- Nested: \`author.company.name = "Acme"\` — up to 6 levels deep
- Back-relation: \`comments_via_post.status = "approved"\` — records that reference this one via a "post" relation field in the "comments" collection

### Special Fields (API rules & superuser filters)
- \`@request.auth.id\` — current authenticated user ID
- \`@request.auth.email\` — current user email
- \`@request.auth.verified\` — whether user is verified
- \`@request.body.fieldName\` — value from the request body
- \`@request.method\` — HTTP method (GET, POST, etc.)
- \`@collection.otherCollection.field\` — cross-collection query (superuser only in filters)
`;

const SECTION_SCHEMA = `
## Field Types Reference

| Type | Key Options | Notes |
|------|-------------|-------|
| text | min, max, pattern, autogeneratePattern | Basic text field |
| number | min, max, noDecimal | Numeric field |
| bool | — | true/false |
| email | onlyDomains, exceptDomains | Email validation |
| url | onlyDomains, exceptDomains | URL validation |
| date | min, max | ISO 8601 datetime |
| select | values, maxSelect | Single (maxSelect=1) or multiple |
| file | maxSelect, maxSize, mimeTypes, thumbs, protected | File upload field |
| relation | collectionId, cascadeDelete, maxSelect | Link to another collection |
| json | maxSize | Arbitrary JSON data |
| editor | convertUrls | Rich text (HTML) |
| autodate | onCreate, onUpdate | Auto-set on create/update |
| geoPoint | — | Latitude/longitude coordinates |

## Record Modifiers (create/update)

| Modifier | Example | Effect |
|----------|---------|--------|
| field+ | { "tags+": "id123" } | Append to multi-relation/array |
| +field | { "+tags": "id123" } | Prepend to multi-relation/array |
| field- | { "tags-": "id123" } | Remove from multi-relation/array |
| score+ | { "score+": 5 } | Add to number field |
| score- | { "score-": 3 } | Subtract from number field |
| field:autogenerate | { "slug:autogenerate": "" } | Trigger autogenerate pattern |
`;

const SECTION_RULES = `
## API Rules Reference

Rules control who can access collection records via the API.

| Value | Meaning |
|-------|---------|
| null | Completely blocked (only superusers) |
| "" (empty string) | Publicly accessible (no auth needed) |
| Filter expression | Access granted only if the expression evaluates to true |

### Rule Types
- **listRule** — Who can list records
- **viewRule** — Who can view a single record
- **createRule** — Who can create records
- **updateRule** — Who can update records
- **deleteRule** — Who can delete records
- **authRule** (auth collections only) — Extra rule on every auth request
- **manageRule** (auth collections only) — Who can manage other users' accounts

### Common Rule Patterns
| Pattern | Expression |
|---------|-----------|
| Auth required | @request.auth.id != "" |
| Own records only | @request.auth.id != "" && user = @request.auth.id |
| Owner or admin | user = @request.auth.id \\|\\| @request.auth.role = "admin" |
| Verified users only | @request.auth.verified = true |
| Public read, auth write | listRule="", viewRule="", createRule='@request.auth.id != ""' |
`;

const SECTION_VIEWS = `
## View Collections (SQL Views)

View collections are **read-only** virtual collections based on a SQL SELECT query.

### Creating a View
\`\`\`
collection_create({
  name: "posts_with_author",
  type: "view",
  viewQuery: "SELECT p.id, p.title, p.created, u.name as author_name FROM posts p JOIN users u ON p.user = u.id",
  listRule: "",   // public access
  viewRule: ""
})
\`\`\`

### Rules & Restrictions
- **viewQuery** is required and MUST include an \`id\` column
- Fields are **auto-generated** from the query — you don't define them
- Only **listRule** and **viewRule** are allowed (create/update/delete must be null)
- **No indexes** allowed (the underlying tables' indexes are used)
- Records are **read-only** via the API (GET only, no POST/PATCH/DELETE)
- You can still use **filter**, **sort**, **expand**, and **fields** on view collection records
- Use \`schema_full\` or \`schema_collection\` to see the auto-generated fields after creation

### Common Use Cases
- Aggregations: COUNT, SUM, AVG across collections
- Joins: Combine fields from multiple collections for reporting
- Computed fields: String concatenation, date math, CASE expressions
- Denormalized views: Flatten nested relations for simpler querying
`;

const SECTION_AUTH = `
## Authentication Guide

### Superuser Authentication
Use \`auth_superuser\` with email + password to get admin access. Or set \`PB_EMAIL\` + \`PB_PASSWORD\` env vars for auto-auth on startup.

### User Authentication
Use \`auth_user\` to get a token for a regular user, then pass it to \`record_test_as_user\` to test API rules from that user's perspective.

### Auth Collections
Auth collections (type="auth") have special fields: email, password, tokenKey, verified, emailVisibility.
Configure authentication methods via \`passwordAuth\`, \`oauth2\`, \`mfa\`, \`otp\` options.

### Testing API Rules Workflow
1. \`auth_user({ collection: "users", identity: "user@test.com", password: "..." })\` → get token
2. \`record_test_as_user({ userToken: "<token>", collection: "posts", method: "GET" })\` → test list access
3. \`record_test_public({ collection: "posts", method: "GET" })\` → test public access
4. Compare results: 200 = allowed, 403 = blocked by rule, 401 = auth required
`;

const SECTION_RECORDS = `
## Record Operations Tips

### Expand Relations
Use \`expand\` to include related records in the response:
- \`expand: "author"\` — expand a single relation
- \`expand: "author,category"\` — expand multiple relations
- \`expand: "author.company"\` — nested expansion (up to 6 levels)
- \`expand: "comments_via_post"\` — back-relation: all comments where post = this record

### Field Selection
Use \`fields\` to limit returned fields and save tokens:
- \`fields: "id,title,created"\` — only return these fields
- \`fields: "id,expand.author.name"\` — include expanded relation fields

### Pagination
- Default: page=1, perPage=30
- Max perPage: 500
- Use \`skipTotal: true\` for faster queries when you don't need total count

### Bulk Operations
- \`record_create_bulk\`: up to 200 records per call
- \`record_update_bulk\`: up to 200 records per call (each must include \`id\`)
- \`record_delete_bulk\`: up to 200 ids per call
- All bulk operations return per-item success/failure details
`;

const SECTIONS: Record<string, string> = {
  overview: SECTION_OVERVIEW,
  filters:  SECTION_FILTERS,
  schema:   SECTION_SCHEMA,
  rules:    SECTION_RULES,
  views:    SECTION_VIEWS,
  auth:     SECTION_AUTH,
  records:  SECTION_RECORDS,
};

/* ── dynamic context ─────────────────────────────────────────────── */

async function getLiveContext(): Promise<string> {
  const parts: string[] = ["\n## Current Server Status\n"];

  // Health
  try {
    const h = await pbFetch("/api/health", undefined, null);
    const d = h.data as Record<string, unknown> | null;
    const version = d?.data ? (d.data as Record<string, unknown>).version : undefined;
    parts.push(`- **PocketBase URL**: ${PB_URL}`);
    parts.push(`- **Reachable**: ${h.ok ? "✅ Yes" : "❌ No"}`);
    if (version) parts.push(`- **Version**: ${version}`);
  } catch {
    parts.push(`- **Reachable**: ❌ No (connection failed)`);
  }

  // Auth status
  const token = getSessionToken();
  parts.push(`- **Authenticated**: ${token ? "✅ Yes (session token set)" : "❌ No — call auth_superuser first"}`);

  // Collection count
  if (token) {
    try {
      const c = await pbFetch("/api/collections?perPage=1&skipTotal=false");
      if (c.ok) {
        const total = (c.data as Record<string, unknown>)?.totalItems;
        if (typeof total === "number") parts.push(`- **Collections**: ${total}`);
      }
    } catch { /* ignore */ }
  }

  return parts.join("\n");
}

/* ── tool registration ───────────────────────────────────────────── */

export function register(server: McpServer) {
  server.registerTool("pb_mcp_guide", {
    description: [
      "START HERE — Call this tool FIRST before any other tool.",
      "Returns a complete guide on how to use this PocketBase MCP server:",
      "all available tools, filter syntax, field types, API rules, view collections, best practices, and current server status.",
      "Use the 'topic' parameter to get only a specific section and reduce token usage.",
    ].join(" "),
    inputSchema: {
      topic: z.enum(["all", "overview", "filters", "schema", "rules", "views", "auth", "records"])
        .optional()
        .default("all")
        .describe("Specific topic to retrieve. 'all' returns the complete guide."),
    },
  }, async ({ topic }) => {
    let guide: string;

    if (topic === "all") {
      guide = Object.values(SECTIONS).join("\n---\n");
    } else {
      guide = SECTIONS[topic] ?? SECTION_OVERVIEW;
    }

    // Append live context
    guide += await getLiveContext();

    return { content: [{ type: "text" as const, text: guide }] };
  });
}

import { z } from "zod";

// ── FIELD TYPE REFERENCE (embedded for agent context) ─────────────────────────
//
// ALL SUPPORTED FIELD TYPES (PocketBase v0.23+):
//
// "text"     → { min?, max?, pattern?, autogeneratePattern?, presentable?, hidden? }
// "number"   → { min?, max?, noDecimal?, presentable?, hidden? }
// "bool"     → { presentable?, hidden? }
// "email"    → { exceptDomains?, onlyDomains?, presentable?, hidden? }
// "url"      → { exceptDomains?, onlyDomains?, presentable?, hidden? }
// "editor"   → { convertUrls?, presentable?, hidden? }
// "date"     → { min?, max?, presentable?, hidden? }
// "autodate" → { onCreate: bool, onUpdate: bool, presentable?, hidden? }
// "select"   → { values: string[], maxSelect: number, presentable?, hidden? }
// "file"     → { maxSelect?, maxSize?, mimeTypes?, thumbs?, protected?, presentable?, hidden? }
// "relation" → { collectionId: string, cascadeDelete?, minSelect?, maxSelect?, displayFields?, presentable?, hidden? }
// "json"     → { maxSize?, presentable?, hidden? }
// "geoPoint" → { presentable?, hidden? }
//
// COLLECTION TYPES: "base" | "auth" | "view"
//
// API RULES (all collections):
//   listRule, viewRule, createRule, updateRule, deleteRule → null (blocked) | "" (public) | "filter expression"
//
// AUTH COLLECTION EXTRA OPTIONS:
//   authRule, manageRule → null | string
//   passwordAuth: { enabled: bool, identityFields: string[] }  e.g. ["email"] or ["email","username"]
//   mfa:          { enabled: bool, duration?: number }
//   otp:          { enabled: bool, duration?: number, length?: number }
//   oauth2:       { enabled: bool, providers?: Array<{name,clientId,clientSecret,...}> }
//
// FILTER RULE SYNTAX:
//   @request.auth.id      → authenticated record id
//   @request.auth.<field> → any field of the authenticated record
//   @request.body.<field> → submitted body field
//   @request.body.<field>:changed → true if field value differs from stored (v0.34+)
//   @request.query.<field>→ query param
//   @collection.<name>.<field> → cross-collection join (no direct relation needed)
//   Operators: = != > >= < <= ~ !~ ?= ?!= ?> ?< && || !
//   Modifiers: field:length  field:each  field:isset (only @request.*)  field:lower (v0.36+)
//   Functions: strftime(format, field) (v0.36+)  geoDistance(latField, lonField, lat, lon) (v0.27+)
//   Macros: @now @second @minute @hour @day @month @year @yesterday @tomorrow
//           @todayStart @todayEnd @monthStart @monthEnd @yearStart @yearEnd
//
// RELATION/FILE FIELD MODIFIERS (record create/update):
//   { "relation+": "id" }  → append to multi-relation   { "relation-": "id" } → remove
//   { "file-": "filename" } → remove specific file (multi-file fields)
//   Note: since PB v0.23, setting a file field replaces ALL files (no auto-append)
//
// AUTH NOTE: "Bearer" prefix is case-insensitive since PB v0.36
//
// INDEXES:
//   "CREATE INDEX idx_name ON collection_name (field)"
//   "CREATE UNIQUE INDEX idx_name ON collection_name (field)"
//   "CREATE INDEX idx_name ON collection_name (fieldA, fieldB)"

export const FIELD_SCHEMA = z.array(z.object({
  name:     z.string().describe("Field name (snake_case recommended)"),
  type:     z.enum(["text","number","bool","email","url","editor","date","autodate","select","file","relation","json","geoPoint"])
             .describe("Field type. See comment block at top of file for all options."),
  required: z.boolean().optional().default(false),

  // text
  min:                 z.number().optional().describe("text/number/date: min value/length"),
  max:                 z.number().optional().describe("text/number/date: max value/length"),
  pattern:             z.string().optional().describe("text: regex pattern, e.g. '^[a-z0-9]+$'"),
  autogeneratePattern: z.string().optional().describe("text: regex for auto-generation, e.g. '[a-z0-9]{8}'"),

  // number
  noDecimal: z.boolean().optional().describe("number: only integers"),

  // email/url
  onlyDomains:   z.array(z.string()).optional().describe("email/url: whitelist domains"),
  exceptDomains: z.array(z.string()).optional().describe("email/url: blacklist domains"),

  // editor
  convertUrls: z.boolean().optional().describe("editor: auto-convert URLs to links"),

  // autodate
  onCreate: z.boolean().optional().describe("autodate: set on record create"),
  onUpdate: z.boolean().optional().describe("autodate: set on record update"),

  // select
  values:    z.array(z.string()).optional().describe("select: allowed values list"),
  maxSelect: z.number().optional().describe("select/file/relation: max selectable items (1=single)"),

  // file / json
  maxSize:   z.number().optional().describe("file: max file size in bytes | json: max size in bytes"),
  mimeTypes: z.array(z.string()).optional().describe("file: allowed MIME types e.g. ['image/jpeg','image/png']"),
  thumbs:    z.array(z.string()).optional().describe("file: thumbnail sizes e.g. ['100x100','0x300']"),
  protected: z.boolean().optional().describe("file: require auth token to access"),

  // relation
  collectionId:   z.string().optional().describe("relation: target collection id (use schema_full to get ids)"),
  cascadeDelete:  z.boolean().optional().describe("relation: delete this record when related record is deleted"),
  minSelect:      z.number().optional().describe("relation: minimum required related records"),
  displayFields:  z.array(z.string()).optional().describe("relation: fields shown in UI picker"),

  // ui
  presentable: z.boolean().optional().describe("Use this field as the display title in the admin UI"),
  hidden:      z.boolean().optional().describe("Hide from API responses by default"),
})).describe("Collection fields. System fields (id, created, updated) are auto-created.");

export function buildCollectionBody(input: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const copy = ["name","type","listRule","viewRule","createRule","updateRule","deleteRule",
                "indexes","viewQuery","authRule","manageRule","passwordAuth","mfa","otp","oauth2"];
  for (const k of copy) {
    if (k in input && input[k] !== undefined) body[k] = input[k];
  }
  if (input.fields) {
    body.fields = (input.fields as Record<string, unknown>[]).map(f => {
      const field: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(f)) {
        if (v !== undefined && v !== null) field[k] = v;
      }
      return field;
    });
  }
  return body;
}

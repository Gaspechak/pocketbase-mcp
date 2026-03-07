# gaspechak-pocketbase-mcp

MCP server for [PocketBase](https://pocketbase.io) — full database management from any AI assistant.

Connect Claude, GitHub Copilot, Cursor, Windsurf, or any MCP-compatible AI tool directly to your PocketBase instance. Manage collections, records, auth, backups, and more through natural language.

## Quick Start

```bash
npx gaspechak-pocketbase-mcp
```

Set environment variables to connect to your PocketBase instance:

```bash
PB_URL=http://127.0.0.1:8090 PB_EMAIL=admin@example.com PB_PASSWORD=yourpassword npx gaspechak-pocketbase-mcp
```

| Variable      | Description                          | Default                  |
|---------------|--------------------------------------|--------------------------|
| `PB_URL`      | PocketBase instance URL              | `http://127.0.0.1:8090`  |
| `PB_EMAIL`    | Superuser email for auto-login       | —                        |
| `PB_PASSWORD` | Superuser password                   | —                        |
| `PB_TOKEN`    | Pre-existing auth token (alternative)| —                        |

## Tools (25)

### Authentication
| Tool | Description |
|------|-------------|
| `auth_superuser` | Login as superuser |
| `auth_user` | Login as a regular user to test API rules |

### Schema Introspection
| Tool | Description |
|------|-------------|
| `schema_full` | Get complete database schema with relationship map |
| `schema_collection` | Get single collection details |

### Schema Management
| Tool | Description |
|------|-------------|
| `collection_create` | Create collection with fields, rules, indexes |
| `collection_update` | Modify existing collection |
| `collection_delete` | Delete collection and all its records |
| `collections_import` | Batch import/upsert collections |

### Record Operations
| Tool | Description |
|------|-------------|
| `record_list` | Query with filtering, sorting, expanding relations |
| `record_get` | Get single record by id |
| `record_create` | Create a record |
| `record_update` | Update a record (PATCH semantics) |
| `record_delete` | Delete a record |
| `record_create_bulk` | Create up to 200 records in parallel |
| `record_update_bulk` | Update up to 200 records in parallel |
| `record_delete_bulk` | Delete up to 200 records in parallel |

### API Rule Testing
| Tool | Description |
|------|-------------|
| `record_test_as_user` | Test API rules as a specific authenticated user |
| `record_test_public` | Test API rules without authentication |

### Utilities
| Tool | Description |
|------|-------------|
| `db_stats` | Record count per collection |
| `health_check` | Verify PocketBase connectivity and version |
| `backup_create` | Create a database backup |
| `backup_list` | List available backups |
| `logs_list` | Query request logs |
| `file_url` | Generate file URLs with optional protected file tokens |

## Integration

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pocketbase": {
      "command": "npx",
      "args": ["-y", "gaspechak-pocketbase-mcp"],
      "env": {
        "PB_URL": "http://127.0.0.1:8090",
        "PB_EMAIL": "admin@example.com",
        "PB_PASSWORD": "yourpassword"
      }
    }
  }
}
```

### VS Code / GitHub Copilot

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "pocketbase": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "gaspechak-pocketbase-mcp"],
      "env": {
        "PB_URL": "http://127.0.0.1:8090",
        "PB_EMAIL": "admin@example.com",
        "PB_PASSWORD": "yourpassword"
      }
    }
  }
}
```

### Cursor

Add to Cursor Settings → MCP Servers:

```json
{
  "mcpServers": {
    "pocketbase": {
      "command": "npx",
      "args": ["-y", "gaspechak-pocketbase-mcp"],
      "env": {
        "PB_URL": "http://127.0.0.1:8090",
        "PB_EMAIL": "admin@example.com",
        "PB_PASSWORD": "yourpassword"
      }
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "pocketbase": {
      "command": "npx",
      "args": ["-y", "gaspechak-pocketbase-mcp"],
      "env": {
        "PB_URL": "http://127.0.0.1:8090",
        "PB_EMAIL": "admin@example.com",
        "PB_PASSWORD": "yourpassword"
      }
    }
  }
}
```

## Development

```bash
git clone https://github.com/Gaspechak/pocketbase-mcp.git
cd pocketbase-mcp
npm install
npm run build
```

Run locally:

```bash
PB_URL=http://127.0.0.1:8090 PB_EMAIL=admin@example.com PB_PASSWORD=secret node dist/index.js
```

### Project Structure

```
src/
├── index.ts              Entry point (stdio transport)
├── server.ts             MCP server creation and tool registration
├── config.ts             Environment variable configuration
├── http.ts               HTTP client helpers
├── helpers.ts            Response formatting utilities
├── schemas/
│   └── fields.ts         Zod schemas for PocketBase field types
└── tools/
    ├── auth.ts           Authentication tools
    ├── schema.ts         Schema introspection tools
    ├── collections.ts    Collection management tools
    ├── records.ts        Record CRUD and bulk operations
    ├── testing.ts        API rule testing tools
    └── utilities.ts      Stats, health, backups, logs, file URLs
```

## License

MIT

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PB_EMAIL, PB_PASSWORD, PB_TOKEN } from "./config.js";
import { setSessionToken, log } from "./http.js";
import { loginWithCredentials } from "./tools/auth.js";

import { register as registerGuide } from "./tools/guide.js";
import { register as registerAuth } from "./tools/auth.js";
import { register as registerSchema } from "./tools/schema.js";
import { register as registerCollections } from "./tools/collections.js";
import { register as registerRecords } from "./tools/records.js";
import { register as registerTesting } from "./tools/testing.js";
import { register as registerUtilities } from "./tools/utilities.js";

export async function createServer(): Promise<McpServer> {
  const server = new McpServer({ name: "pocketbase-mcp", version: "1.0.0" });

  // Register all tool groups — guide first so LLMs discover it first
  registerGuide(server);
  registerAuth(server);
  registerSchema(server);
  registerCollections(server);
  registerRecords(server);
  registerTesting(server);
  registerUtilities(server);

  // Auto-authenticate on startup
  if (PB_TOKEN) {
    setSessionToken(PB_TOKEN);
  } else if (PB_EMAIL && PB_PASSWORD) {
    await loginWithCredentials(PB_EMAIL, PB_PASSWORD);
  } else {
    log("WARNING: No credentials. Set PB_EMAIL+PB_PASSWORD or PB_TOKEN.");
  }

  return server;
}

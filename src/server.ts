import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { registerSendEmailTool } from './mcp/tools';
import type { ToolRegistry } from './policies/registry';
import { loadRegistry } from './policies/registry';
import type { GmailSender } from './tools/gmail/send-email';
import { gmailSenderFromEnv } from './tools/gmail/sender';

// The MCP SDK rejects sharing a stateless transport across requests, so each
// request must build its own transport (and McpServer to attach it to). To keep
// per-request cost low we cache the heavy pieces — the policy registry (reads
// YAML files at boot) and the Gmail sender (sets up the OAuth2 client).
type RuntimeDeps = { registry: ToolRegistry; gmailSender: GmailSender };
let cachedRuntimeDeps: RuntimeDeps | null = null;

function getRuntimeDeps(): RuntimeDeps {
  if (!cachedRuntimeDeps) {
    cachedRuntimeDeps = {
      registry: loadRegistry(join(process.cwd(), 'policies')),
      gmailSender: gmailSenderFromEnv(),
    };
  }
  return cachedRuntimeDeps;
}

export async function dispatchMcpRequest(request: Request): Promise<Response> {
  const { registry, gmailSender } = getRuntimeDeps();
  const mcpServer = new McpServer({ name: 'limen', version: '0.0.0' });
  registerSendEmailTool(mcpServer, registry, gmailSender);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });
  await mcpServer.connect(transport);
  return transport.handleRequest(request);
}

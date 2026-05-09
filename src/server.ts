import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { registerSendEmail } from './mcp/tools';
import type { ToolRegistry } from './policies/registry';
import { loadRegistry } from './policies/registry';
import type { GmailSender } from './tools/gmail/send-email';
import { gmailSenderFromEnv } from './tools/gmail/sender';

// The MCP SDK rejects sharing a stateless transport across requests, so each
// request must build its own transport (and McpServer to attach it to). To keep
// per-request cost low we cache the heavy pieces — the policy registry (reads
// YAML files at boot) and the Gmail sender (sets up the OAuth2 client).
type Deps = { registry: ToolRegistry; sender: GmailSender };
let cachedDeps: Deps | null = null;

function getDeps(): Deps {
  if (!cachedDeps) {
    cachedDeps = {
      registry: loadRegistry(join(process.cwd(), 'policies')),
      sender: gmailSenderFromEnv(),
    };
  }
  return cachedDeps;
}

export async function dispatchMcpRequest(request: Request): Promise<Response> {
  const { registry, sender } = getDeps();
  const server = new McpServer({ name: 'limen', version: '0.0.0' });
  registerSendEmail(server, registry, sender);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

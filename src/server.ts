import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { registerTools } from './mcp/tools';
import { gmailClientFromEnv, requiredEnv } from './tools/gmail/client';
import { loadTools, toolDefinitions } from './tools/registry';
import type { LoadedTool, ToolDeps } from './tools/types';

// The MCP SDK rejects sharing a stateless transport across requests, so each
// request must build its own transport (and McpServer to attach it to). To keep
// per-request cost low we cache the heavy pieces — the resolved ToolDeps and
// the loadedTools map (reads policy YAMLs at boot).
type RuntimeState = { loadedTools: Map<string, LoadedTool> };
let cachedState: RuntimeState | null = null;

function getRuntimeState(): RuntimeState {
  if (cachedState) return cachedState;

  const deps: ToolDeps = {
    gmailClient: gmailClientFromEnv(),
    gmailFrom: requiredEnv('GMAIL_SENDER'),
  };
  const loadedTools = loadTools(toolDefinitions, deps, join(process.cwd(), 'policies'));

  // ADR 0008: missing policy is empty-allow; the warning makes the lack of
  // restrictions visible. Stderr so the JSONL audit stream on stdout stays
  // clean.
  for (const [name, loaded] of loadedTools) {
    if (loaded.policy.status === 'missing') {
      console.warn(`Tool '${name}' has no policy file. All calls will be allowed.`);
    }
  }

  // Warn about YAML files that don't match any registered tool — catches typos in filenames.
  const policiesDir = join(process.cwd(), 'policies');
  try {
    const registeredNames = new Set(toolDefinitions.map((t) => t.name));
    for (const file of readdirSync(policiesDir)) {
      if (!file.endsWith('.yaml')) continue;
      const toolName = file.slice(0, -5);
      if (!registeredNames.has(toolName)) {
        console.warn(`Orphaned policy file '${file}' does not match any registered tool.`);
      }
    }
  } catch {
    // policies dir may not exist yet — already handled by missing-policy logic above
  }

  cachedState = { loadedTools };
  return cachedState;
}

export async function dispatchMcpRequest(request: Request): Promise<Response> {
  const { loadedTools } = getRuntimeState();
  const mcpServer = new McpServer({ name: 'limen', version: '0.0.0' });
  registerTools(mcpServer, loadedTools);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });
  await mcpServer.connect(transport);
  return transport.handleRequest(request);
}

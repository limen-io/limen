import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LoadedTool } from '../tools/types';
import { handleToolCall } from './handler';

// Registers every loaded Tool on the MCP server. Iterates the map rather than
// calling a per-Tool registration function (ADR 0006): adding a third Tool is
// mechanical at the registry level, with no changes here.
export function registerTools(mcpServer: McpServer, loadedTools: Map<string, LoadedTool>): void {
  for (const [name, loaded] of loadedTools) {
    mcpServer.registerTool(
      name,
      {
        description: loaded.definition.description,
        inputSchema: loaded.definition.inputSchema,
      },
      async (input) => {
        const result = await handleToolCall({ tool: name, jsonRpcId: null, params: input }, loaded);
        return {
          isError: result.isError,
          content: result.content,
          structuredContent: result.structuredContent as unknown as Record<string, unknown>,
        };
      },
    );
  }
}

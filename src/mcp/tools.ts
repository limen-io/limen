import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolRegistry } from '../policies/registry';
import type { GmailSender } from '../tools/gmail/send-email';
import { handleToolCall } from './handler';

// Registers send_email on the MCP server. The description is intentionally
// minimal — Limen is invisible to the agent by default (strategic-decisions §11,
// ADR 0003). Operators who want to expose specific restrictions upfront can
// override the description here.
export function registerSendEmailTool(
  mcpServer: McpServer,
  registry: ToolRegistry,
  gmailSender: GmailSender,
): void {
  mcpServer.registerTool(
    'send_email',
    {
      description: 'Send an email via Gmail.',
      inputSchema: {
        to: z.array(z.string()),
        subject: z.string(),
        body: z.string(),
      },
    },
    async (input) => {
      const loadedTool = registry.get('send_email');
      if (!loadedTool) {
        // No policy file → not exposed. Should not happen if boot succeeded;
        // included as a defensive fallback.
        return {
          isError: true,
          content: [{ type: 'text', text: 'send_email is not registered in the policy registry' }],
        };
      }
      const result = await handleToolCall(
        { tool: 'send_email', jsonRpcId: null, params: input },
        loadedTool,
        gmailSender,
      );
      return {
        isError: result.isError,
        content: result.content,
        structuredContent: result.structuredContent as unknown as Record<string, unknown>,
      };
    },
  );
}

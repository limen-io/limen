import { record } from '../audit/logger';
import { decide } from '../policies/evaluator';
import type { LoadResult } from '../policies/loader';
import type { AdapterError, Denial, EngineError } from '../policies/types';
import { type GmailSender, type SendEmailParams, sendEmail } from '../tools/gmail/send-email';

export type ToolCallRequest = {
  tool: string;
  jsonRpcId: number | string | null;
  params: Record<string, unknown>;
};

type StructuredContentBase = { tool: string };

export type StructuredContent =
  | (StructuredContentBase & { decision: 'allow'; executed: true; messageId: string })
  | (StructuredContentBase & { decision: 'allow'; executed: false; error: AdapterError })
  | (StructuredContentBase & { decision: 'deny'; executed: false; denials: Denial[] })
  | (StructuredContentBase & { decision: 'error'; executed: false; error: EngineError });

export type CallToolResult = {
  isError: boolean;
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: StructuredContent;
};

// Slice 1 normalization: trim+lowercase string elements of `to` array, since
// email addresses are case-insensitive and stray whitespace is a common agent
// mistake. Other fields are passed through. When the second tool arrives
// with a different normalization need, this becomes a per-tool dispatch.
function normalize(params: Record<string, unknown>): Record<string, unknown> {
  const to = params.to;
  if (!Array.isArray(to)) return params;
  return {
    ...params,
    to: to.map((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v)),
  };
}

export async function handleToolCall(
  request: ToolCallRequest,
  loadedTool: LoadResult,
  sender: GmailSender,
): Promise<CallToolResult> {
  const start = Date.now();
  const params = normalize(request.params);
  const decision = decide(loadedTool, params);

  if (decision.decision === 'deny') {
    const durationMs = Date.now() - start;
    const denials = decision.denials;
    record({
      tool: request.tool,
      request: { jsonRpcId: request.jsonRpcId, params: request.params },
      decision: 'deny',
      executed: false,
      denials,
      execution: null,
      error: null,
      durationMs,
    });
    const firstViolation = denials[0]?.violations[0];
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Blocked by Limen: ${firstViolation?.message ?? 'rule matched'}`,
        },
      ],
      structuredContent: {
        tool: request.tool,
        decision: 'deny',
        executed: false,
        denials,
      },
    };
  }

  if (decision.decision === 'error') {
    const durationMs = Date.now() - start;
    record({
      tool: request.tool,
      request: { jsonRpcId: request.jsonRpcId, params: request.params },
      decision: 'error',
      executed: false,
      denials: null,
      execution: null,
      error: decision.error,
      durationMs,
    });
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Limen engine error: ${decision.error.detail}`,
        },
      ],
      structuredContent: {
        tool: request.tool,
        decision: 'error',
        executed: false,
        error: decision.error,
      },
    };
  }

  // At this point decision is narrowed to `allow`. `pending_approval` joins
  // DecisionResult in slice 2 and will need its own branch above.
  const adapterResult = await sendEmail(params as SendEmailParams, sender);
  const durationMs = Date.now() - start;

  if (adapterResult.status === 'failed') {
    record({
      tool: request.tool,
      request: { jsonRpcId: request.jsonRpcId, params: request.params },
      decision: 'allow',
      executed: false,
      execution: { status: 'failed', error: adapterResult.error },
      denials: null,
      error: null,
      durationMs,
    });
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Adapter failed: ${adapterResult.error.detail ?? adapterResult.error.code}`,
        },
      ],
      structuredContent: {
        tool: request.tool,
        decision: 'allow',
        executed: false,
        error: adapterResult.error,
      },
    };
  }

  const messageId = adapterResult.result.messageId;

  record({
    tool: request.tool,
    request: { jsonRpcId: request.jsonRpcId, params: request.params },
    decision: 'allow',
    executed: true,
    execution: { status: 'success', result: { messageId } },
    denials: null,
    error: null,
    durationMs,
  });

  return {
    isError: false,
    content: [{ type: 'text', text: `Email sent: ${messageId}` }],
    structuredContent: {
      tool: request.tool,
      decision: 'allow',
      executed: true,
      messageId,
    },
  };
}

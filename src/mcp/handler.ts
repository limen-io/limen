import { recordAuditEvent } from '../audit/logger';
import type { AdapterError, Denial, EngineError } from '../limen/types';
import { decide } from '../policies/evaluator';
import { applyNormalize } from '../tools/normalizers';
import type { LoadedTool } from '../tools/types';

export type ToolCallRequest = {
  tool: string;
  jsonRpcId: number | string | null;
  params: Record<string, unknown>;
};

type StructuredContentBase = { tool: string };

// `result` is the generic adapter payload (`{ messageId }` for send_email,
// `{ draftId }` for draft_reply, anything else for future Tools). The handler
// is intentionally tool-agnostic and does not look inside.
export type StructuredContent =
  | (StructuredContentBase & {
      decision: 'allow';
      executed: true;
      result: Record<string, unknown>;
    })
  | (StructuredContentBase & { decision: 'allow'; executed: false; error: AdapterError })
  | (StructuredContentBase & { decision: 'deny'; executed: false; denials: Denial[] })
  | (StructuredContentBase & { decision: 'error'; executed: false; error: EngineError });

export type ToolCallResult = {
  isError: boolean;
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: StructuredContent;
};

export async function handleToolCall(
  request: ToolCallRequest,
  loadedTool: LoadedTool,
): Promise<ToolCallResult> {
  const start = Date.now();
  const normalizedParams = applyNormalize(request.params, loadedTool.definition.normalize);
  const decision = decide(loadedTool.policy, normalizedParams);

  if (decision.decision === 'deny') {
    const durationMs = Date.now() - start;
    const denials = decision.denials;
    recordAuditEvent({
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
    recordAuditEvent({
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

  // Decision is `allow`. `pending_approval` joins this union in slice 3 and
  // will need its own branch above.
  const adapterResult = await loadedTool.adapter(normalizedParams);
  const durationMs = Date.now() - start;

  if (adapterResult.status === 'failed') {
    recordAuditEvent({
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

  recordAuditEvent({
    tool: request.tool,
    request: { jsonRpcId: request.jsonRpcId, params: request.params },
    decision: 'allow',
    executed: true,
    execution: { status: 'success', result: adapterResult.result },
    denials: null,
    error: null,
    durationMs,
  });

  return {
    isError: false,
    content: [{ type: 'text', text: `${request.tool} executed` }],
    structuredContent: {
      tool: request.tool,
      decision: 'allow',
      executed: true,
      result: adapterResult.result,
    },
  };
}

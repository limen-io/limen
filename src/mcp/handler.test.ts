import { afterEach, describe, expect, test, vi } from 'vitest';
import type { Policy } from '../limen/types';
import type { Adapter, LoadedTool, ToolDefinition } from '../tools/types';
import { handleToolCall } from './handler';

// Builds a LoadedTool from the parts each test cares about. Defaults keep tests
// terse: an allow-all policy and a no-op adapter unless overridden.
function buildLoadedTool(
  opts: {
    name?: string;
    policy?: LoadedTool['policy'];
    adapter?: Adapter;
    normalize?: ToolDefinition['normalize'];
  } = {},
): LoadedTool {
  return {
    definition: {
      name: opts.name ?? 'send_email',
      description: 'test tool',
      inputSchema: {},
      createAdapter: () => async () => ({ status: 'success', result: {} }),
      normalize: opts.normalize,
    },
    policy: opts.policy ?? { status: 'ok', policy: { version: 1, rules: [] } satisfies Policy },
    adapter: opts.adapter ?? (async () => ({ status: 'success', result: {} })),
  };
}

describe('handleToolCall', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('allow + adapter success → isError false, result in structuredContent, audit emitted', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const adapter = vi.fn<Adapter>(async () => ({
      status: 'success',
      result: { messageId: 'gmail-001' },
    }));
    const loadedTool = buildLoadedTool({ adapter });

    const result = await handleToolCall(
      {
        tool: 'send_email',
        jsonRpcId: 1,
        params: { to: ['ok@example.com'], subject: 'hello', body: 'test' },
      },
      loadedTool,
    );

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      decision: 'allow',
      executed: true,
      tool: 'send_email',
      result: { messageId: 'gmail-001' },
    });

    expect(adapter).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledOnce();
    const event = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(event.decision).toBe('allow');
    expect(event.executed).toBe(true);
    expect(event.execution.result.messageId).toBe('gmail-001');
  });

  test('deny → adapter is not called, isError true, denials in structuredContent', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const adapter = vi.fn<Adapter>();
    const loadedTool = buildLoadedTool({
      adapter,
      policy: {
        status: 'ok',
        policy: {
          version: 1,
          rules: [
            {
              id: 'deny-blocked-recipient',
              deny_when: { to: { in: ['blocked@example.com'] } },
            },
          ],
        },
      },
    });

    const result = await handleToolCall(
      {
        tool: 'send_email',
        jsonRpcId: 2,
        params: { to: ['blocked@example.com'], subject: 'hello', body: 'test' },
      },
      loadedTool,
    );

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      decision: 'deny',
      executed: false,
      tool: 'send_email',
    });
    if (result.structuredContent.decision === 'deny') {
      expect(result.structuredContent.denials[0]?.ruleId).toBe('deny-blocked-recipient');
    }

    expect(adapter).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledOnce();
    const event = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(event.decision).toBe('deny');
    expect(event.executed).toBe(false);
  });

  test('quarantined tool → adapter not called, decision error in structuredContent', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const adapter = vi.fn<Adapter>();
    const loadedTool = buildLoadedTool({
      adapter,
      policy: {
        status: 'quarantined',
        error: {
          type: 'engine_error',
          code: 'invalid_yaml',
          detail: 'unclosed bracket on line 5',
        },
      },
    });

    const result = await handleToolCall(
      {
        tool: 'send_email',
        jsonRpcId: 3,
        params: { to: ['ok@example.com'], subject: 'hello', body: 'test' },
      },
      loadedTool,
    );

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      decision: 'error',
      executed: false,
      tool: 'send_email',
    });
    if (result.structuredContent.decision === 'error') {
      expect(result.structuredContent.error.code).toBe('invalid_yaml');
    }

    expect(adapter).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledOnce();
    const event = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(event.decision).toBe('error');
    expect(event.error.code).toBe('invalid_yaml');
  });

  test('missing policy → allow (ADR 0008), adapter called', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const adapter = vi.fn<Adapter>(async () => ({
      status: 'success',
      result: { messageId: 'gmail-empty' },
    }));
    const loadedTool = buildLoadedTool({
      adapter,
      policy: { status: 'missing' },
    });

    const result = await handleToolCall(
      {
        tool: 'send_email',
        jsonRpcId: 6,
        params: { to: ['ok@example.com'], subject: 'hello', body: 'test' },
      },
      loadedTool,
    );

    expect(result.isError).toBe(false);
    expect(result.structuredContent.decision).toBe('allow');
    expect(adapter).toHaveBeenCalledOnce();
  });

  test('allow + adapter failure → isError true, decision allow + executed false, AdapterError in structuredContent', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const adapter = vi.fn<Adapter>(async () => ({
      status: 'failed',
      error: {
        type: 'adapter_error',
        code: 'gmail_send_failed',
        retryable: false,
        detail: 'Gmail API returned 503',
      },
    }));
    const loadedTool = buildLoadedTool({ adapter });

    const result = await handleToolCall(
      {
        tool: 'send_email',
        jsonRpcId: 4,
        params: { to: ['ok@example.com'], subject: 'hello', body: 'test' },
      },
      loadedTool,
    );

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      decision: 'allow',
      executed: false,
      tool: 'send_email',
    });
    if (result.structuredContent.decision === 'allow' && !result.structuredContent.executed) {
      expect(result.structuredContent.error.type).toBe('adapter_error');
      expect(result.structuredContent.error.detail).toContain('503');
    }

    expect(adapter).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledOnce();
    const event = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(event.decision).toBe('allow');
    expect(event.executed).toBe(false);
    expect(event.execution.status).toBe('failed');
  });

  test('applies the tool’s declared normalize before policy evaluation and before the adapter', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const adapter = vi.fn<Adapter>(async () => ({
      status: 'success',
      result: { messageId: 'gmail-002' },
    }));
    const loadedTool = buildLoadedTool({
      adapter,
      normalize: { to: ['trim', 'lowercase'] },
      policy: {
        status: 'ok',
        policy: {
          version: 1,
          rules: [
            {
              id: 'deny-outside-allowlist',
              deny_when: { to: { not_in: ['ok@example.com'] } },
            },
          ],
        },
      },
    });

    const result = await handleToolCall(
      {
        tool: 'send_email',
        jsonRpcId: 5,
        params: { to: ['  OK@Example.COM  '], subject: 'hello', body: 'test' },
      },
      loadedTool,
    );

    expect(result.isError).toBe(false);
    expect(result.structuredContent.decision).toBe('allow');
    expect(adapter).toHaveBeenCalledOnce();
    expect(adapter).toHaveBeenCalledWith(expect.objectContaining({ to: ['ok@example.com'] }));
  });

  test('AuditEvent records raw (un-normalized) params', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const loadedTool = buildLoadedTool({
      adapter: async () => ({ status: 'success', result: { messageId: 'm' } }),
      normalize: { to: ['trim', 'lowercase'] },
    });

    await handleToolCall(
      {
        tool: 'send_email',
        jsonRpcId: 7,
        params: { to: ['  OK@Example.COM  '], subject: 'hello', body: 'test' },
      },
      loadedTool,
    );

    const event = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(event.request.params.to).toEqual(['  OK@Example.COM  ']);
  });
});

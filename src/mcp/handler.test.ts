import { afterEach, describe, expect, test, vi } from 'vitest';
import type { LoadedTool } from '../policies/loader';
import { handleToolCall } from './handler';

describe('handleToolCall', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('allow + adapter success → isError false, messageId in structuredContent, audit emitted', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const loadedTool: LoadedTool = {
      status: 'ok',
      tool: 'send_email',
      policy: { version: 1, rules: [] }, // no rules → always allow
    };
    const gmailSender = vi.fn().mockResolvedValue({ messageId: 'gmail-001' });

    const result = await handleToolCall(
      {
        tool: 'send_email',
        jsonRpcId: 1,
        params: { to: ['ok@example.com'], subject: 'hello', body: 'test' },
      },
      loadedTool,
      gmailSender,
    );

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      decision: 'allow',
      executed: true,
      tool: 'send_email',
      messageId: 'gmail-001',
    });

    expect(gmailSender).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledOnce();
    const event = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(event.decision).toBe('allow');
    expect(event.executed).toBe(true);
    expect(event.execution.result.messageId).toBe('gmail-001');
  });

  test('deny → adapter is not called, isError true, denials in structuredContent', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const loadedTool: LoadedTool = {
      status: 'ok',
      tool: 'send_email',
      policy: {
        version: 1,
        rules: [
          {
            id: 'deny-blocked-recipient',
            when: { to: { in: ['blocked@example.com'] } },
          },
        ],
      },
    };
    const gmailSender = vi.fn();

    const result = await handleToolCall(
      {
        tool: 'send_email',
        jsonRpcId: 2,
        params: { to: ['blocked@example.com'], subject: 'hello', body: 'test' },
      },
      loadedTool,
      gmailSender,
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

    expect(gmailSender).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledOnce();
    const event = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(event.decision).toBe('deny');
    expect(event.executed).toBe(false);
  });

  test('quarantined tool → adapter not called, decision error in structuredContent', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const loadedTool: LoadedTool = {
      status: 'quarantined',
      tool: 'send_email',
      error: {
        type: 'engine_error',
        code: 'invalid_yaml',
        detail: 'unclosed bracket on line 5',
      },
    };
    const gmailSender = vi.fn();

    const result = await handleToolCall(
      {
        tool: 'send_email',
        jsonRpcId: 3,
        params: { to: ['ok@example.com'], subject: 'hello', body: 'test' },
      },
      loadedTool,
      gmailSender,
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

    expect(gmailSender).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledOnce();
    const event = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(event.decision).toBe('error');
    expect(event.error.code).toBe('invalid_yaml');
  });

  test('allow + adapter failure → isError true, decision allow + executed false, AdapterError in structuredContent', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const loadedTool: LoadedTool = {
      status: 'ok',
      tool: 'send_email',
      policy: { version: 1, rules: [] },
    };
    const gmailSender = vi.fn().mockRejectedValue(new Error('Gmail API returned 503'));

    const result = await handleToolCall(
      {
        tool: 'send_email',
        jsonRpcId: 4,
        params: { to: ['ok@example.com'], subject: 'hello', body: 'test' },
      },
      loadedTool,
      gmailSender,
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

    expect(gmailSender).toHaveBeenCalledOnce();
    expect(logSpy).toHaveBeenCalledOnce();
    const event = JSON.parse(logSpy.mock.calls[0]?.[0] as string);
    expect(event.decision).toBe('allow');
    expect(event.executed).toBe(false);
    expect(event.execution.status).toBe('failed');
  });

  test('normalizes recipients (trim + lowercase) before evaluation', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    // Allowlist policy: anything outside ok@example.com gets denied.
    const loadedTool: LoadedTool = {
      status: 'ok',
      tool: 'send_email',
      policy: {
        version: 1,
        rules: [
          {
            id: 'deny-outside-allowlist',
            when: { to: { not_in: ['ok@example.com'] } },
          },
        ],
      },
    };
    const gmailSender = vi.fn().mockResolvedValue({ messageId: 'gmail-002' });

    // Agent sends padded uppercase variant. After normalization it should
    // match the allowlist and pass through.
    const result = await handleToolCall(
      {
        tool: 'send_email',
        jsonRpcId: 5,
        params: { to: ['  OK@Example.COM  '], subject: 'hello', body: 'test' },
      },
      loadedTool,
      gmailSender,
    );

    expect(result.isError).toBe(false);
    expect(result.structuredContent.decision).toBe('allow');
    expect(gmailSender).toHaveBeenCalledOnce();
  });
});

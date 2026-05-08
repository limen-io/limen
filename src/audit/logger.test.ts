import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AuditEventInput } from '../policies/types';
import { record } from './logger';

describe('record', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('emits one JSON line on stdout and returns the built event', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const input: AuditEventInput = {
      tool: 'send_email',
      request: {
        jsonRpcId: 7,
        params: { to: ['blocked@example.com'], subject: 'hello', body: 'test' },
      },
      decision: 'deny',
      executed: false,
      denials: [
        {
          ruleId: 'deny-blocked-recipient',
          reason: 'rule_matched',
          violations: [{ field: 'to', value: 'blocked@example.com', message: 'in blocklist' }],
        },
      ],
      execution: null,
      error: null,
      durationMs: 12,
    };

    const event = record(input);

    // Emitted exactly once, as a JSON string parseable back to the same event.
    expect(logSpy).toHaveBeenCalledTimes(1);
    const emitted = logSpy.mock.calls[0]?.[0];
    expect(typeof emitted).toBe('string');
    expect(JSON.parse(emitted as string)).toEqual(event);

    // System-generated fields.
    expect(event.schemaVersion).toBe(1);
    expect(event.eventId).toMatch(/^evt_[0-9A-HJKMNP-TV-Z]{26}$/); // evt_ + 26-char ULID
    expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);

    // Input fields preserved.
    expect(event.tool).toBe('send_email');
    expect(event.decision).toBe('deny');
    expect(event.durationMs).toBe(12);
  });
});

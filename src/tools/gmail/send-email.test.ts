import { describe, expect, test, vi } from 'vitest';
import type { GmailClient } from './client';
import { sendEmailTool } from './send-email';

function buildGmailClient(sendImpl: () => Promise<{ data: { id?: string | null } }>): GmailClient {
  return {
    users: {
      messages: { send: vi.fn(sendImpl) },
    },
  } as unknown as GmailClient;
}

describe('sendEmailTool adapter', () => {
  test('returns success with messageId when Gmail accepts the message', async () => {
    const gmailClient = buildGmailClient(async () => ({ data: { id: 'gmail-abc-123' } }));
    const adapter = sendEmailTool.createAdapter({ gmailClient, gmailFrom: 'me@example.com' });

    const result = await adapter({ to: ['ok@example.com'], subject: 'hello', body: 'test' });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.result).toEqual({ messageId: 'gmail-abc-123' });
    }
  });

  test('returns failed adapter_error when Gmail throws', async () => {
    const gmailClient = buildGmailClient(async () => {
      throw new Error('Gmail API returned 503');
    });
    const adapter = sendEmailTool.createAdapter({ gmailClient, gmailFrom: 'me@example.com' });

    const result = await adapter({ to: ['ok@example.com'], subject: 'hello', body: 'test' });

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error.type).toBe('adapter_error');
      expect(result.error.code).toBe('gmail_send_failed');
      expect(result.error.detail).toContain('503');
    }
  });

  test('returns failed when Gmail responds without a message id', async () => {
    const gmailClient = buildGmailClient(async () => ({ data: { id: null } }));
    const adapter = sendEmailTool.createAdapter({ gmailClient, gmailFrom: 'me@example.com' });

    const result = await adapter({ to: ['ok@example.com'], subject: 'hello', body: 'test' });

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error.detail).toContain('no message id');
    }
  });

  test('declares trim+lowercase normalize on the `to` field', () => {
    expect(sendEmailTool.normalize).toEqual({ to: ['trim', 'lowercase'] });
  });
});

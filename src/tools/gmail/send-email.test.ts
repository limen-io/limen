import { describe, expect, test, vi } from 'vitest';
import { sendEmail } from './send-email';

describe('sendEmail', () => {
  test('returns success when the sender resolves with a messageId', async () => {
    const sender = vi.fn().mockResolvedValue({ messageId: 'gmail-abc-123' });

    const result = await sendEmail(
      { to: ['ok@example.com'], subject: 'hello', body: 'test' },
      sender,
    );

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.result.messageId).toBe('gmail-abc-123');
    }
    expect(sender).toHaveBeenCalledWith({
      to: ['ok@example.com'],
      subject: 'hello',
      body: 'test',
    });
  });

  test('returns failed with adapter_error when the sender throws', async () => {
    const sender = vi.fn().mockRejectedValue(new Error('Gmail API returned 503'));

    const result = await sendEmail(
      { to: ['ok@example.com'], subject: 'hello', body: 'test' },
      sender,
    );

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error.type).toBe('adapter_error');
      expect(result.error.code).toBe('gmail_send_failed');
      expect(result.error.detail).toContain('503');
    }
  });
});

import { beforeEach, describe, expect, test, vi } from 'vitest';

const sendMock = vi.hoisted(() => vi.fn());

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials = vi.fn();
      },
    },
    gmail: vi.fn(() => ({
      users: {
        messages: {
          send: sendMock,
        },
      },
    })),
  },
}));

import { createGmailSender } from './sender';

describe('createGmailSender', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  test('rejects CR/LF in headers before calling Gmail', async () => {
    sendMock.mockResolvedValue({ data: { id: 'gmail-001' } });
    const sender = createGmailSender({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token',
      from: 'me@example.com',
    });

    await expect(
      sender({
        to: ['allowed@example.com'],
        subject: 'hello\r\nBcc: outside@example.com',
        body: 'test',
      }),
    ).rejects.toThrow('subject must not contain CR or LF');

    expect(sendMock).not.toHaveBeenCalled();
  });

  test('allows multiline message bodies', async () => {
    sendMock.mockResolvedValue({ data: { id: 'gmail-001' } });
    const sender = createGmailSender({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh-token',
      from: 'me@example.com',
    });

    await expect(
      sender({
        to: ['allowed@example.com'],
        subject: 'hello',
        body: 'line 1\nline 2',
      }),
    ).resolves.toEqual({ messageId: 'gmail-001' });

    expect(sendMock).toHaveBeenCalledOnce();
  });
});

import { describe, expect, test, vi } from 'vitest';
import type { GmailClient } from './client';
import { draftReplyTool } from './draft-reply';

type ThreadsGetImpl = (args: { id: string }) => Promise<{
  data: { messages?: Array<{ payload?: { headers?: Array<{ name?: string; value?: string }> } }> };
}>;

type DraftsCreateImpl = (args: {
  requestBody: { message: { threadId?: string; raw?: string } };
}) => Promise<{ data: { id?: string | null } }>;

function buildGmailClient(opts: { threadsGet?: ThreadsGetImpl; draftsCreate?: DraftsCreateImpl }): {
  client: GmailClient;
  threadsGet: ReturnType<typeof vi.fn>;
  draftsCreate: ReturnType<typeof vi.fn>;
} {
  const threadsGet = vi.fn(opts.threadsGet ?? (async () => ({ data: {} })));
  const draftsCreate = vi.fn(opts.draftsCreate ?? (async () => ({ data: { id: 'draft-1' } })));
  const client = {
    users: {
      threads: { get: threadsGet },
      drafts: { create: draftsCreate },
    },
  } as unknown as GmailClient;
  return { client, threadsGet, draftsCreate };
}

function originalThread(headers: Record<string, string>) {
  return {
    data: {
      messages: [
        {
          payload: {
            headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
          },
        },
      ],
    },
  };
}

describe('draftReplyTool adapter', () => {
  test('declares the slice 2 contract: thread_id + body params, no normalize', () => {
    expect(draftReplyTool.name).toBe('draft_reply');
    expect(Object.keys(draftReplyTool.inputSchema)).toEqual(['thread_id', 'body']);
    expect(draftReplyTool.normalize).toBeUndefined();
  });

  test('builds a reply with To = original From, Subject = Re: <original>, In-Reply-To = original Message-ID', async () => {
    const { client, draftsCreate } = buildGmailClient({
      threadsGet: async () =>
        originalThread({
          From: 'author@example.com',
          Subject: 'Project update',
          'Message-ID': '<msg-99@example.com>',
        }),
    });
    const adapter = draftReplyTool.createAdapter({
      gmailClient: client,
      gmailFrom: 'me@example.com',
    });

    const result = await adapter({ thread_id: 'thread-1', body: 'thanks!' });

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.result).toEqual({ draftId: 'draft-1' });
    }
    expect(draftsCreate).toHaveBeenCalledOnce();
    const callArgs = draftsCreate.mock.calls[0]?.[0];
    expect(callArgs.requestBody.message.threadId).toBe('thread-1');
    const decoded = Buffer.from(callArgs.requestBody.message.raw as string, 'base64url').toString(
      'utf-8',
    );
    expect(decoded).toContain('From: me@example.com');
    expect(decoded).toContain('To: author@example.com');
    expect(decoded).toContain('Subject: Re: Project update');
    expect(decoded).toContain('In-Reply-To: <msg-99@example.com>');
    expect(decoded).toContain('References: <msg-99@example.com>');
    expect(decoded).toContain('thanks!');
  });

  test('does not double-prefix subjects that already start with Re:', async () => {
    const { client, draftsCreate } = buildGmailClient({
      threadsGet: async () =>
        originalThread({
          From: 'author@example.com',
          Subject: 'Re: project update',
          'Message-ID': '<msg-99@example.com>',
        }),
    });
    const adapter = draftReplyTool.createAdapter({
      gmailClient: client,
      gmailFrom: 'me@example.com',
    });

    await adapter({ thread_id: 'thread-1', body: 'ok' });

    const raw = draftsCreate.mock.calls[0]?.[0].requestBody.message.raw as string;
    const decoded = Buffer.from(raw, 'base64url').toString('utf-8');
    expect(decoded).toContain('Subject: Re: project update');
    expect(decoded).not.toContain('Subject: Re: Re: project update');
  });

  test('appends original Message-ID to existing References chain', async () => {
    const { client, draftsCreate } = buildGmailClient({
      threadsGet: async () =>
        originalThread({
          From: 'author@example.com',
          Subject: 'thread',
          'Message-ID': '<msg-3@example.com>',
          References: '<msg-1@example.com> <msg-2@example.com>',
        }),
    });
    const adapter = draftReplyTool.createAdapter({
      gmailClient: client,
      gmailFrom: 'me@example.com',
    });

    await adapter({ thread_id: 'thread-1', body: 'ok' });

    const raw = draftsCreate.mock.calls[0]?.[0].requestBody.message.raw as string;
    const decoded = Buffer.from(raw, 'base64url').toString('utf-8');
    expect(decoded).toContain(
      'References: <msg-1@example.com> <msg-2@example.com> <msg-3@example.com>',
    );
  });

  test('returns failed when the thread fetch throws', async () => {
    const { client, draftsCreate } = buildGmailClient({
      threadsGet: async () => {
        throw new Error('Thread not found');
      },
    });
    const adapter = draftReplyTool.createAdapter({
      gmailClient: client,
      gmailFrom: 'me@example.com',
    });

    const result = await adapter({ thread_id: 'unknown-thread', body: 'ok' });

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error.code).toBe('gmail_thread_fetch_failed');
      expect(result.error.detail).toContain('not found');
    }
    expect(draftsCreate).not.toHaveBeenCalled();
  });

  test('returns failed when the draft create throws', async () => {
    const { client } = buildGmailClient({
      threadsGet: async () =>
        originalThread({
          From: 'author@example.com',
          Subject: 'hi',
          'Message-ID': '<msg-1@example.com>',
        }),
      draftsCreate: async () => {
        throw new Error('Gmail API returned 503');
      },
    });
    const adapter = draftReplyTool.createAdapter({
      gmailClient: client,
      gmailFrom: 'me@example.com',
    });

    const result = await adapter({ thread_id: 'thread-1', body: 'ok' });

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error.code).toBe('gmail_draft_create_failed');
      expect(result.error.detail).toContain('503');
    }
  });

  test('returns failed when the thread is empty (no messages)', async () => {
    const { client } = buildGmailClient({
      threadsGet: async () => ({ data: { messages: [] } }),
    });
    const adapter = draftReplyTool.createAdapter({
      gmailClient: client,
      gmailFrom: 'me@example.com',
    });

    const result = await adapter({ thread_id: 'empty-thread', body: 'ok' });

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error.code).toBe('gmail_thread_empty');
    }
  });

  test('returns failed when the last message has no resolvable recipient', async () => {
    const { client } = buildGmailClient({
      threadsGet: async () =>
        originalThread({
          Subject: 'no from header',
          'Message-ID': '<msg-1@example.com>',
        }),
    });
    const adapter = draftReplyTool.createAdapter({
      gmailClient: client,
      gmailFrom: 'me@example.com',
    });

    const result = await adapter({ thread_id: 'thread-1', body: 'ok' });

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error.code).toBe('gmail_thread_missing_recipient');
    }
  });

  test('prefers Reply-To over From when both are present', async () => {
    const { client, draftsCreate } = buildGmailClient({
      threadsGet: async () =>
        originalThread({
          From: 'author@example.com',
          'Reply-To': 'replies@example.com',
          Subject: 'with reply-to',
          'Message-ID': '<msg-1@example.com>',
        }),
    });
    const adapter = draftReplyTool.createAdapter({
      gmailClient: client,
      gmailFrom: 'me@example.com',
    });

    await adapter({ thread_id: 'thread-1', body: 'ok' });

    const raw = draftsCreate.mock.calls[0]?.[0].requestBody.message.raw as string;
    const decoded = Buffer.from(raw, 'base64url').toString('utf-8');
    expect(decoded).toContain('To: replies@example.com');
    expect(decoded).not.toContain('To: author@example.com');
  });

  test('uses To header when last message was sent by the account owner', async () => {
    const { client, draftsCreate } = buildGmailClient({
      threadsGet: async () =>
        originalThread({
          From: 'me@example.com',
          To: 'recipient@example.com',
          Subject: 'self-sent',
          'Message-ID': '<msg-1@example.com>',
        }),
    });
    const adapter = draftReplyTool.createAdapter({
      gmailClient: client,
      gmailFrom: 'me@example.com',
    });

    await adapter({ thread_id: 'thread-1', body: 'ok' });

    const raw = draftsCreate.mock.calls[0]?.[0].requestBody.message.raw as string;
    const decoded = Buffer.from(raw, 'base64url').toString('utf-8');
    expect(decoded).toContain('To: recipient@example.com');
  });
});

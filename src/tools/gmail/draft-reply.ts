import type { gmail_v1 } from 'googleapis';
import { z } from 'zod';
import type { AdapterResult } from '../../limen/types';
import type { ToolDefinition } from '../types';
import { encodeRfc2822 } from './encoding';

type DraftReplyParams = {
  thread_id: string;
  body: string;
};

// Reads the header by case-insensitive name. Gmail returns headers as
// `{ name, value }` records; the casing of `name` is whatever the original
// message used, so we normalise the comparison side.
function getHeader(message: gmail_v1.Schema$Message, name: string): string | undefined {
  const headers = message.payload?.headers ?? [];
  const lower = name.toLowerCase();
  for (const h of headers) {
    if (h.name?.toLowerCase() === lower && typeof h.value === 'string') {
      return h.value;
    }
  }
  return undefined;
}

function prefixReSubject(subject: string | undefined): string {
  const trimmed = (subject ?? '').trim();
  if (!trimmed) return 'Re:';
  if (/^re:/i.test(trimmed)) return trimmed;
  return `Re: ${trimmed}`;
}

function adapterError(code: string, err: unknown): AdapterResult {
  return {
    status: 'failed',
    error: {
      type: 'adapter_error',
      code,
      retryable: false,
      detail: err instanceof Error ? err.message : String(err),
    },
  };
}

export const draftReplyTool: ToolDefinition = {
  name: 'draft_reply',
  description:
    'Create a Gmail draft replying to an existing thread. Returns the new draftId; does not send.',
  inputSchema: {
    thread_id: z.string(),
    body: z.string(),
  },
  // No normalize — thread_id is an opaque Gmail handle (must match exactly),
  // body is free-form prose.
  createAdapter:
    ({ gmailClient, gmailFrom }) =>
    async (params) => {
      const { thread_id, body } = params as DraftReplyParams;

      let thread: gmail_v1.Schema$Thread;
      try {
        const response = await gmailClient.users.threads.get({
          userId: 'me',
          id: thread_id,
          format: 'metadata',
          metadataHeaders: ['From', 'Reply-To', 'To', 'Subject', 'Message-ID', 'References'],
        });
        thread = response.data;
      } catch (err) {
        return adapterError('gmail_thread_fetch_failed', err);
      }

      const messages = thread.messages ?? [];
      const lastMessage = messages[messages.length - 1];
      if (!lastMessage) {
        return adapterError('gmail_thread_empty', new Error(`Thread ${thread_id} has no messages`));
      }

      // RFC 2822 recipient resolution:
      // 1. Reply-To (explicit override by sender)
      // 2. From, unless it matches our own address (self-sent last message)
      // 3. To (covers the self-sent case — we follow up to whoever we emailed)
      const replyTo = getHeader(lastMessage, 'Reply-To');
      const originalFrom = getHeader(lastMessage, 'From');
      const originalTo = getHeader(lastMessage, 'To');
      const isSelfSent =
        originalFrom !== undefined && originalFrom.toLowerCase().includes(gmailFrom.toLowerCase());
      const recipient = replyTo ?? (!isSelfSent ? originalFrom : undefined) ?? originalTo;
      if (!recipient) {
        return adapterError(
          'gmail_thread_missing_recipient',
          new Error(`Cannot determine reply recipient for thread ${thread_id}`),
        );
      }
      const originalSubject = getHeader(lastMessage, 'Subject');
      const originalMessageId = getHeader(lastMessage, 'Message-ID');
      const originalReferences = getHeader(lastMessage, 'References');

      const references: string[] = [];
      if (originalReferences) references.push(...originalReferences.split(/\s+/).filter(Boolean));
      if (originalMessageId) references.push(originalMessageId);

      let raw: string;
      try {
        raw = encodeRfc2822(
          {
            from: gmailFrom,
            to: [recipient],
            subject: prefixReSubject(originalSubject),
            inReplyTo: originalMessageId,
            references: references.length > 0 ? references : undefined,
          },
          body,
        );
      } catch (err) {
        return adapterError('gmail_encoding_failed', err);
      }

      try {
        const response = await gmailClient.users.drafts.create({
          userId: 'me',
          requestBody: {
            message: { threadId: thread_id, raw },
          },
        });
        const draftId = response.data.id;
        if (!draftId) {
          return adapterError('gmail_draft_no_id', new Error('Gmail API returned no draft id'));
        }
        return { status: 'success', result: { draftId } };
      } catch (err) {
        return adapterError('gmail_draft_create_failed', err);
      }
    },
};

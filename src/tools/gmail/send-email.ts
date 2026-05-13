import { z } from 'zod';
import type { ToolDefinition } from '../types';
import { encodeRfc2822 } from './encoding';

type SendEmailParams = {
  to: string[];
  subject: string;
  body: string;
};

export const sendEmailTool: ToolDefinition = {
  name: 'send_email',
  description: 'Send an email via Gmail.',
  inputSchema: {
    to: z.array(z.string()),
    subject: z.string(),
    body: z.string(),
  },
  normalize: {
    to: ['trim', 'lowercase'],
  },
  createAdapter:
    ({ gmailClient, gmailFrom }) =>
    async (params) => {
      const { to, subject, body } = params as SendEmailParams;
      try {
        const raw = encodeRfc2822({ from: gmailFrom, to, subject }, body);
        const response = await gmailClient.users.messages.send({
          userId: 'me',
          requestBody: { raw },
        });
        if (!response.data.id) {
          throw new Error('Gmail API returned no message id');
        }
        return { status: 'success', result: { messageId: response.data.id } };
      } catch (err) {
        return {
          status: 'failed',
          error: {
            type: 'adapter_error',
            code: 'gmail_send_failed',
            retryable: false,
            detail: err instanceof Error ? err.message : String(err),
          },
        };
      }
    },
};

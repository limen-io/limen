import type { AdapterError } from '../../policies/types';

export type SendEmailParams = {
  to: string[];
  subject: string;
  body: string;
};

export type AdapterResult =
  | { status: 'success'; result: { messageId: string } }
  | { status: 'failed'; error: AdapterError };

// Injectable transport. Runtime wires this to the real googleapis client
// (factory builds it from a refresh token in .env). Tests pass a fake.
export type GmailSender = (params: SendEmailParams) => Promise<{ messageId: string }>;

export async function sendEmail(
  params: SendEmailParams,
  gmailSender: GmailSender,
): Promise<AdapterResult> {
  try {
    const { messageId } = await gmailSender(params);
    return { status: 'success', result: { messageId } };
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
}

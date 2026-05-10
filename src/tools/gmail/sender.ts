import { google } from 'googleapis';
import type { GmailSender, SendEmailParams } from './send-email';

export type GmailSenderConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  // The From: address. Must match an account the refresh token authorized.
  from: string;
};

export function createGmailSender(config: GmailSenderConfig): GmailSender {
  const oauth2 = new google.auth.OAuth2(config.clientId, config.clientSecret);
  oauth2.setCredentials({ refresh_token: config.refreshToken });
  const gmail = google.gmail({ version: 'v1', auth: oauth2 });

  return async (params: SendEmailParams) => {
    const raw = encodeRfc2822(config.from, params);
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
    if (!response.data.id) {
      throw new Error('Gmail API returned no message id');
    }
    return { messageId: response.data.id };
  };
}

// Reads required env vars and builds a real GmailSender. Throws if any is missing.
export function gmailSenderFromEnv(): GmailSender {
  return createGmailSender({
    clientId: requiredEnv('GMAIL_CLIENT_ID'),
    clientSecret: requiredEnv('GMAIL_CLIENT_SECRET'),
    refreshToken: requiredEnv('GMAIL_REFRESH_TOKEN'),
    from: requiredEnv('GMAIL_SENDER'),
  });
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// RFC 2822 message wrapped in base64url, the format gmail.users.messages.send expects.
function encodeRfc2822(from: string, params: SendEmailParams): string {
  const lines = [
    `From: ${headerValue('from', from)}`,
    `To: ${params.to.map((to) => headerValue('to', to)).join(', ')}`,
    `Subject: ${headerValue('subject', params.subject)}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    params.body,
  ];
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}

function headerValue(name: string, value: string): string {
  // Prevent RFC 2822 header injection, e.g. `Subject: hi\r\nBcc: ...`.
  // The body may be multiline; only header values are constrained here.
  if (/[\r\n]/.test(value)) {
    throw new Error(`${name} must not contain CR or LF`);
  }
  return value;
}

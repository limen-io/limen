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
    const res = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });
    if (!res.data.id) {
      throw new Error('Gmail API returned no message id');
    }
    return { messageId: res.data.id };
  };
}

// Reads required env vars and builds a real GmailSender. Throws if any is missing.
export function gmailSenderFromEnv(): GmailSender {
  return createGmailSender({
    clientId: required('GMAIL_CLIENT_ID'),
    clientSecret: required('GMAIL_CLIENT_SECRET'),
    refreshToken: required('GMAIL_REFRESH_TOKEN'),
    from: required('GMAIL_SENDER'),
  });
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// RFC 2822 message wrapped in base64url, the format gmail.users.messages.send expects.
function encodeRfc2822(from: string, params: SendEmailParams): string {
  const lines = [
    `From: ${from}`,
    `To: ${params.to.join(', ')}`,
    `Subject: ${params.subject}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    params.body,
  ];
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}

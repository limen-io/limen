import { type gmail_v1, google } from 'googleapis';

// Raw Gmail SDK client used by every Gmail-backed Tool (send-email, draft-reply,
// and future tools). The type alias keeps ToolDeps decoupled from the
// googleapis import surface.
export type GmailClient = gmail_v1.Gmail;

export type GmailClientConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

export function createGmailClient(config: GmailClientConfig): GmailClient {
  const oauth2 = new google.auth.OAuth2(config.clientId, config.clientSecret);
  oauth2.setCredentials({ refresh_token: config.refreshToken });
  return google.gmail({ version: 'v1', auth: oauth2 });
}

// Builds a real GmailClient from required env vars. Throws if any is missing
// so misconfigured boots fail loud, not silent.
export function gmailClientFromEnv(): GmailClient {
  return createGmailClient({
    clientId: requiredEnv('GMAIL_CLIENT_ID'),
    clientSecret: requiredEnv('GMAIL_CLIENT_SECRET'),
    refreshToken: requiredEnv('GMAIL_REFRESH_TOKEN'),
  });
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

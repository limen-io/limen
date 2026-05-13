#!/usr/bin/env node
// Validates Gmail OAuth credentials in .env without sending an email.
// Triggers a real refresh-token exchange against Google's auth server.
// Run: node scripts/verify-gmail-auth.mjs

import { readFileSync } from 'node:fs';
import { google } from 'googleapis';

function loadDotEnv(path) {
  const env = {};
  const content = readFileSync(path, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = loadDotEnv(new URL('../.env', import.meta.url));

const clientId = env.GMAIL_CLIENT_ID;
const clientSecret = env.GMAIL_CLIENT_SECRET;
const refreshToken = env.GMAIL_REFRESH_TOKEN;
const sender = env.GMAIL_SENDER;

if (!clientId || !clientSecret || !refreshToken || !sender) {
  console.error(
    'Missing one or more env vars: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER',
  );
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
oauth2.setCredentials({ refresh_token: refreshToken });

console.log('Attempting to refresh access token against Google...');

try {
  const { token } = await oauth2.getAccessToken();
  if (!token) {
    console.error('FAIL: refresh succeeded but no access token returned.');
    process.exit(1);
  }
  console.log('OK: refresh exchange succeeded. Access token length:', token.length);

  // Optional: confirm the gmail.send scope is actually granted on this token.
  console.log('Checking authorized scopes...');
  const info = await oauth2.getTokenInfo(token);
  console.log('Authorized scopes:', info.scopes ?? '(none reported)');
  console.log(
    'Token expires in:',
    info.expiry_date ? new Date(info.expiry_date).toISOString() : '(unknown)',
  );

  const grantedScopes = info.scopes ?? [];
  // gmail.modify covers send, drafts, and threads.get (needed by draft_reply).
  // gmail.send + gmail.compose is insufficient — threads.get requires read access.
  const hasModifyScope =
    grantedScopes.includes('https://mail.google.com/') ||
    grantedScopes.includes('https://www.googleapis.com/auth/gmail.modify');

  if (!hasModifyScope) {
    console.warn('WARN: gmail.modify scope NOT authorized. draft_reply will fail at runtime.');
    console.warn('      Re-run OAuth Playground with this scope:');
    console.warn('      https://www.googleapis.com/auth/gmail.modify');
    process.exit(2);
  }

  console.log('OK: gmail.modify scope authorized. Limen can send, draft, and read threads.');
} catch (err) {
  console.error('FAIL:', err?.message ?? err);
  if (err?.response?.data) {
    console.error('Google response:', JSON.stringify(err.response.data, null, 2));
  }
  process.exit(1);
}

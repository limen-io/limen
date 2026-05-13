// Generic RFC 2822 message builder shared by every Gmail-backed Tool that needs
// to POST a `message.raw` body to the Gmail API. Kept at the provider level
// (not per-Tool) so send-email and draft-reply can share the header-injection
// guard and the base64url framing.

export type Rfc2822Headers = {
  from: string;
  to: string[];
  subject: string;
  // Optional extras for replies. Slice 2 sets these for draft-reply only.
  inReplyTo?: string;
  references?: string[];
};

export function encodeRfc2822(headers: Rfc2822Headers, body: string): string {
  const lines: string[] = [
    `From: ${headerValue('from', headers.from)}`,
    `To: ${headers.to.map((to) => headerValue('to', to)).join(', ')}`,
    `Subject: ${headerValue('subject', headers.subject)}`,
  ];
  if (headers.inReplyTo) {
    lines.push(`In-Reply-To: ${headerValue('in-reply-to', headers.inReplyTo)}`);
  }
  if (headers.references && headers.references.length > 0) {
    lines.push(
      `References: ${headers.references.map((r) => headerValue('references', r)).join(' ')}`,
    );
  }
  lines.push('Content-Type: text/plain; charset=UTF-8', '', body);
  return Buffer.from(lines.join('\r\n')).toString('base64url');
}

// Header values cannot contain CR/LF — that is the classic injection vector
// (`Subject: hi\r\nBcc: outside@example.com`). The body is exempt because it
// is below the empty-line separator.
export function headerValue(name: string, value: string): string {
  if (/[\r\n]/.test(value)) {
    throw new Error(`${name} must not contain CR or LF`);
  }
  return value;
}

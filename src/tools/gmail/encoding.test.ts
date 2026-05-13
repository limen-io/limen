import { describe, expect, test } from 'vitest';
import { encodeRfc2822, headerValue } from './encoding';

describe('encodeRfc2822', () => {
  test('rejects CR/LF in header values', () => {
    expect(() =>
      encodeRfc2822(
        {
          from: 'me@example.com',
          to: ['allowed@example.com'],
          subject: 'hello\r\nBcc: outside@example.com',
        },
        'test',
      ),
    ).toThrow('subject must not contain CR or LF');
  });

  test('allows multiline message bodies', () => {
    const raw = encodeRfc2822(
      {
        from: 'me@example.com',
        to: ['allowed@example.com'],
        subject: 'hello',
      },
      'line 1\nline 2',
    );

    const decoded = Buffer.from(raw, 'base64url').toString('utf-8');
    expect(decoded).toContain('line 1\nline 2');
  });

  test('emits In-Reply-To and References when provided', () => {
    const raw = encodeRfc2822(
      {
        from: 'me@example.com',
        to: ['author@example.com'],
        subject: 'Re: original',
        inReplyTo: '<msg-1@example.com>',
        references: ['<msg-0@example.com>', '<msg-1@example.com>'],
      },
      'reply body',
    );

    const decoded = Buffer.from(raw, 'base64url').toString('utf-8');
    expect(decoded).toContain('In-Reply-To: <msg-1@example.com>');
    expect(decoded).toContain('References: <msg-0@example.com> <msg-1@example.com>');
  });

  test('omits In-Reply-To and References when not provided', () => {
    const raw = encodeRfc2822(
      {
        from: 'me@example.com',
        to: ['allowed@example.com'],
        subject: 'hello',
      },
      'test',
    );

    const decoded = Buffer.from(raw, 'base64url').toString('utf-8');
    expect(decoded).not.toContain('In-Reply-To');
    expect(decoded).not.toContain('References');
  });
});

describe('headerValue', () => {
  test('returns the value unchanged when it has no CR/LF', () => {
    expect(headerValue('subject', 'hello world')).toBe('hello world');
  });

  test('throws when value contains CR', () => {
    expect(() => headerValue('subject', 'a\rb')).toThrow('subject must not contain CR or LF');
  });

  test('throws when value contains LF', () => {
    expect(() => headerValue('subject', 'a\nb')).toThrow('subject must not contain CR or LF');
  });
});

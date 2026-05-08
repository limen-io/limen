import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { loadPoliciesFromDir, loadPolicy } from './loader';

describe('loadPolicy', () => {
  // ─── Happy path ────────────────────────────────────────────────────────

  test('parses a valid policy YAML into a Policy', () => {
    const yaml = `
version: 1
rules:
  - id: deny-blocked-recipient
    description: Block recipients on the blocklist
    when:
      to:
        in:
          - blocked@example.com
`;

    const result = loadPolicy(yaml, 'send_email');

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.tool).toBe('send_email');
      expect(result.policy.version).toBe(1);
      expect(result.policy.rules).toHaveLength(1);
      expect(result.policy.rules[0]?.id).toBe('deny-blocked-recipient');
      expect(result.policy.rules[0]?.when).toEqual({
        to: { in: ['blocked@example.com'] },
      });
    }
  });

  // ─── Quarantine ────────────────────────────────────────────────────────

  test('quarantines the tool when YAML is malformed', () => {
    // Unclosed bracket — yaml parser will throw.
    const yaml = `version: 1\nrules: [`;

    const result = loadPolicy(yaml, 'send_email');

    expect(result.status).toBe('quarantined');
    if (result.status === 'quarantined') {
      expect(result.tool).toBe('send_email');
      expect(result.error.type).toBe('engine_error');
      expect(result.error.code).toBe('invalid_yaml');
    }
  });

  test('quarantines the tool when version field is missing', () => {
    const yaml = `
rules:
  - id: some-rule
    when:
      to:
        in: ['blocked@example.com']
`;

    const result = loadPolicy(yaml, 'send_email');

    expect(result.status).toBe('quarantined');
    if (result.status === 'quarantined') {
      expect(result.error.code).toBe('invalid_policy');
    }
  });

  test('quarantines the tool when a rule is missing id', () => {
    const yaml = `
version: 1
rules:
  - when:
      to:
        in: ['blocked@example.com']
`;

    const result = loadPolicy(yaml, 'send_email');

    expect(result.status).toBe('quarantined');
    if (result.status === 'quarantined') {
      expect(result.error.code).toBe('invalid_policy');
    }
  });

  test('quarantines the tool when a rule uses an unknown operator (typo)', () => {
    // 'not_inn' is a typo of 'not_in'. Without strict validation, zod would
    // silently drop the unknown key and the rule would never fire — exactly the
    // silent drop the spec forbids.
    const yaml = `
version: 1
rules:
  - id: deny-outside-allowlist
    when:
      to:
        not_inn: ['ok@example.com']
`;

    const result = loadPolicy(yaml, 'send_email');

    expect(result.status).toBe('quarantined');
    if (result.status === 'quarantined') {
      expect(result.error.code).toBe('invalid_policy');
    }
  });
});

describe('loadPoliciesFromDir', () => {
  test('loads each *.yaml file as a separate tool, deriving tool name from filename', () => {
    const dir = mkdtempSync(join(tmpdir(), 'limen-policies-'));
    try {
      writeFileSync(
        join(dir, 'send_email.yaml'),
        `version: 1\nrules:\n  - id: deny-x\n    when:\n      to:\n        in: ['x@x.com']\n`,
      );
      writeFileSync(join(dir, 'archive.yaml'), 'not valid yaml: [');
      // Non-yaml file should be ignored.
      writeFileSync(join(dir, 'README.md'), '# this should be ignored');

      const results = loadPoliciesFromDir(dir);

      expect(results).toHaveLength(2);

      const sendEmail = results.find((r) => r.tool === 'send_email');
      expect(sendEmail?.status).toBe('ok');

      const archive = results.find((r) => r.tool === 'archive');
      expect(archive?.status).toBe('quarantined');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

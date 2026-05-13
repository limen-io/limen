import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { loadPolicy, loadPolicyForTool } from './loader';

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

    const result = loadPolicy(yaml);

    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.policy.version).toBe(1);
      expect(result.policy.rules).toHaveLength(1);
      expect(result.policy.rules[0]?.id).toBe('deny-blocked-recipient');
      expect(result.policy.rules[0]?.when).toEqual({
        to: { in: ['blocked@example.com'] },
      });
    }
  });

  // ─── Quarantine ────────────────────────────────────────────────────────

  test('quarantines when YAML is malformed', () => {
    const yaml = `version: 1\nrules: [`;

    const result = loadPolicy(yaml);

    expect(result.status).toBe('quarantined');
    if (result.status === 'quarantined') {
      expect(result.error.type).toBe('engine_error');
      expect(result.error.code).toBe('invalid_yaml');
    }
  });

  test('quarantines when version field is missing', () => {
    const yaml = `
rules:
  - id: some-rule
    when:
      to:
        in: ['blocked@example.com']
`;

    const result = loadPolicy(yaml);

    expect(result.status).toBe('quarantined');
    if (result.status === 'quarantined') {
      expect(result.error.code).toBe('invalid_policy');
    }
  });

  test('quarantines when a rule is missing id', () => {
    const yaml = `
version: 1
rules:
  - when:
      to:
        in: ['blocked@example.com']
`;

    const result = loadPolicy(yaml);

    expect(result.status).toBe('quarantined');
    if (result.status === 'quarantined') {
      expect(result.error.code).toBe('invalid_policy');
    }
  });

  test('quarantines when a rule uses an unknown operator (typo)', () => {
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

    const result = loadPolicy(yaml);

    expect(result.status).toBe('quarantined');
    if (result.status === 'quarantined') {
      expect(result.error.code).toBe('invalid_policy');
    }
  });
});

describe('loadPolicyForTool', () => {
  test('returns ok when <toolName>.yaml exists and parses', () => {
    const dir = mkdtempSync(join(tmpdir(), 'limen-policies-'));
    try {
      writeFileSync(
        join(dir, 'send_email.yaml'),
        `version: 1\nrules:\n  - id: deny-x\n    when:\n      to:\n        in: ['x@x.com']\n`,
      );

      const result = loadPolicyForTool('send_email', dir);

      expect(result.status).toBe('ok');
      if (result.status === 'ok') {
        expect(result.policy.rules[0]?.id).toBe('deny-x');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('returns missing when no policy file exists for the tool (ADR 0008)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'limen-policies-'));
    try {
      const result = loadPolicyForTool('unconfigured_tool', dir);

      expect(result.status).toBe('missing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('quarantines when the file exists but YAML is invalid', () => {
    const dir = mkdtempSync(join(tmpdir(), 'limen-policies-'));
    try {
      writeFileSync(join(dir, 'broken.yaml'), 'not valid yaml: [');

      const result = loadPolicyForTool('broken', dir);

      expect(result.status).toBe('quarantined');
      if (result.status === 'quarantined') {
        expect(result.error.code).toBe('invalid_yaml');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('accepts a .yml extension as a fallback', () => {
    const dir = mkdtempSync(join(tmpdir(), 'limen-policies-'));
    try {
      writeFileSync(join(dir, 'short_ext.yml'), `version: 1\nrules: []\n`);

      const result = loadPolicyForTool('short_ext', dir);

      expect(result.status).toBe('ok');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

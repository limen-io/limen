import { describe, expect, test } from 'vitest';
import type { Policy } from '../limen/types';
import { decide, evaluate } from './evaluator';
import type { LoadedPolicy } from './loader';

describe('evaluate', () => {
  // ─── Baseline ──────────────────────────────────────────────────────────

  test('returns allow when the only rule does not match', () => {
    const policy: Policy = {
      version: 1,
      rules: [
        {
          id: 'deny-blocked-recipient',
          when: { to: { in: ['blocked@example.com'] } },
        },
      ],
    };

    const result = evaluate(policy, { to: ['ok@example.com'] });

    expect(result).toEqual({ decision: 'allow' });
  });

  // ─── Operators ─────────────────────────────────────────────────────────

  test('in: rule fires when a recipient is on the blocklist', () => {
    const policy: Policy = {
      version: 1,
      rules: [
        {
          id: 'deny-blocked-recipient',
          when: { to: { in: ['blocked@example.com'] } },
        },
      ],
    };

    const result = evaluate(policy, { to: ['blocked@example.com'] });

    expect(result.decision).toBe('deny');
    if (result.decision === 'deny') {
      expect(result.denials[0]?.ruleId).toBe('deny-blocked-recipient');
      expect(result.denials[0]?.violations).toContainEqual(
        expect.objectContaining({ field: 'to', value: 'blocked@example.com' }),
      );
    }
  });

  test('not_in: rule fires when a recipient is outside the allowlist', () => {
    const policy: Policy = {
      version: 1,
      rules: [
        {
          id: 'deny-outside-allowlist',
          when: { to: { not_in: ['ok@example.com'] } },
        },
      ],
    };

    const result = evaluate(policy, { to: ['blocked@example.com'] });

    expect(result.decision).toBe('deny');
    if (result.decision === 'deny') {
      expect(result.denials).toHaveLength(1);
      expect(result.denials[0]?.ruleId).toBe('deny-outside-allowlist');
      expect(result.denials[0]?.violations).toContainEqual(
        expect.objectContaining({ field: 'to', value: 'blocked@example.com' }),
      );
    }
  });

  test('contains: rule fires when a string field includes the substring', () => {
    const policy: Policy = {
      version: 1,
      rules: [
        {
          id: 'deny-confidential-body',
          when: { body: { contains: 'CONFIDENTIAL' } },
        },
      ],
    };

    const result = evaluate(policy, {
      body: 'This is a CONFIDENTIAL document',
    });

    expect(result.decision).toBe('deny');
    if (result.decision === 'deny') {
      expect(result.denials[0]?.ruleId).toBe('deny-confidential-body');
      expect(result.denials[0]?.violations).toContainEqual(
        expect.objectContaining({ field: 'body' }),
      );
    }
  });

  // ─── Composition ───────────────────────────────────────────────────────

  test('AND across when fields: rule does not fire when only one field matches', () => {
    const policy: Policy = {
      version: 1,
      rules: [
        {
          id: 'deny-blocked-recipient-with-public-announcement',
          when: {
            to: { in: ['blocked@example.com'] },
            subject: { in: ['public-announcement'] },
          },
        },
      ],
    };

    // `to` fires (blocked@example.com IS in blocklist), but `subject` does not
    // (regular-subject is NOT in blocklist). AND requires both — rule does not fire.
    const result = evaluate(policy, {
      to: ['blocked@example.com'],
      subject: 'regular-subject',
    });

    expect(result.decision).toBe('allow');
  });

  test('AND across when fields: rule fires and aggregates violations from all fields', () => {
    const policy: Policy = {
      version: 1,
      rules: [
        {
          id: 'deny-blocked-recipient-with-public-announcement',
          when: {
            to: { in: ['blocked@example.com'] },
            subject: { in: ['public-announcement'] },
          },
        },
      ],
    };

    const result = evaluate(policy, {
      to: ['blocked@example.com'],
      subject: 'public-announcement',
    });

    expect(result.decision).toBe('deny');
    if (result.decision === 'deny') {
      expect(result.denials).toHaveLength(1);
      expect(result.denials[0]?.violations).toHaveLength(2);
      const fields = result.denials[0]?.violations.map((v) => v.field).sort();
      expect(fields).toEqual(['subject', 'to']);
    }
  });

  test('OR across rules: a non-matching first rule does not block a matching second rule', () => {
    const policy: Policy = {
      version: 1,
      rules: [
        {
          id: 'deny-blocked-recipient',
          when: { to: { in: ['blocked@example.com'] } },
        },
        {
          id: 'deny-public-announcement-subject',
          when: { subject: { in: ['public-announcement'] } },
        },
      ],
    };

    // First rule does not fire (recipient is OK), but second rule fires (subject is blocked).
    // OR between rules: any rule firing causes deny.
    const result = evaluate(policy, {
      to: ['ok@example.com'],
      subject: 'public-announcement',
    });

    expect(result.decision).toBe('deny');
    if (result.decision === 'deny') {
      expect(result.denials).toHaveLength(1);
      expect(result.denials[0]?.ruleId).toBe('deny-public-announcement-subject');
    }
  });

  test('stop on first match: only the first matching rule is reported even if later rules also match', () => {
    const policy: Policy = {
      version: 1,
      rules: [
        {
          id: 'deny-blocked-recipient',
          when: { to: { in: ['blocked@example.com'] } },
        },
        {
          id: 'deny-public-announcement-subject',
          when: { subject: { in: ['public-announcement'] } },
        },
      ],
    };

    // Both rules would fire (blocked recipient AND blocked subject).
    // Evaluator stops on first match — denials reports only rule 1.
    const result = evaluate(policy, {
      to: ['blocked@example.com'],
      subject: 'public-announcement',
    });

    expect(result.decision).toBe('deny');
    if (result.decision === 'deny') {
      expect(result.denials).toHaveLength(1);
      expect(result.denials[0]?.ruleId).toBe('deny-blocked-recipient');
    }
  });

  // ─── Array semantics ───────────────────────────────────────────────────

  test('existential semantics: a single bad element in an array fires the rule', () => {
    const policy: Policy = {
      version: 1,
      rules: [
        {
          id: 'deny-outside-allowlist',
          when: { to: { not_in: ['ok@example.com'] } },
        },
      ],
    };

    // Mixed array: one allowed, one not. Existential semantics — any element
    // violating the predicate fires the rule. Violations reference only the
    // bad element.
    const result = evaluate(policy, {
      to: ['ok@example.com', 'blocked@example.com'],
    });

    expect(result.decision).toBe('deny');
    if (result.decision === 'deny') {
      expect(result.denials).toHaveLength(1);
      const values = result.denials[0]?.violations.map((v) => v.value);
      expect(values).toEqual(['blocked@example.com']);
    }
  });
});

describe('decide', () => {
  test('returns error when the tool is quarantined', () => {
    const quarantined: LoadedPolicy = {
      status: 'quarantined',
      error: {
        type: 'engine_error',
        code: 'invalid_yaml',
        detail: 'unclosed bracket on line 5',
      },
    };

    const result = decide(quarantined, { to: ['anything@example.com'] });

    expect(result.decision).toBe('error');
    if (result.decision === 'error') {
      expect(result.error.code).toBe('invalid_yaml');
      expect(result.error.detail).toBe('unclosed bracket on line 5');
    }
  });

  test('returns allow when the policy is missing (ADR 0008 default-allow)', () => {
    const missing: LoadedPolicy = { status: 'missing' };

    const result = decide(missing, { to: ['anything@example.com'] });

    expect(result.decision).toBe('allow');
  });

  test('delegates to evaluate when the policy is loaded', () => {
    const loadedPolicy: LoadedPolicy = {
      status: 'ok',
      policy: {
        version: 1,
        rules: [
          {
            id: 'deny-blocked-recipient',
            when: { to: { in: ['blocked@example.com'] } },
          },
        ],
      },
    };

    const result = decide(loadedPolicy, { to: ['blocked@example.com'] });

    expect(result.decision).toBe('deny');
    if (result.decision === 'deny') {
      expect(result.denials[0]?.ruleId).toBe('deny-blocked-recipient');
    }
  });
});

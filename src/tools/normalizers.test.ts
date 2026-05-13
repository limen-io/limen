import { describe, expect, test } from 'vitest';
import { applyNormalize } from './normalizers';

describe('applyNormalize', () => {
  test('returns params unchanged when no normalize config is provided', () => {
    const params = { to: ['  X@Y.COM  '], subject: 'hello' };

    const result = applyNormalize(params, undefined);

    expect(result).toEqual({ to: ['  X@Y.COM  '], subject: 'hello' });
  });

  test('applies trim to a string field', () => {
    const params = { subject: '  hello  ' };

    const result = applyNormalize(params, { subject: ['trim'] });

    expect(result).toEqual({ subject: 'hello' });
  });

  test('applies transformers in declared order', () => {
    const params = { subject: '  HELLO  ' };

    const result = applyNormalize(params, { subject: ['trim', 'lowercase'] });

    expect(result).toEqual({ subject: 'hello' });
  });

  test('applies transformers to each element of a string[] field', () => {
    const params = { to: ['  A@X.com  ', '  B@Y.COM  '] };

    const result = applyNormalize(params, { to: ['trim', 'lowercase'] });

    expect(result).toEqual({ to: ['a@x.com', 'b@y.com'] });
  });

  test('leaves non-string elements in arrays untouched', () => {
    const params = { mixed: ['  HELLO  ', 42, true] };

    const result = applyNormalize(params, { mixed: ['trim', 'lowercase'] });

    expect(result).toEqual({ mixed: ['hello', 42, true] });
  });

  test('passes through fields not listed in the normalize config', () => {
    const params = { subject: '  HELLO  ', body: '  Body  ' };

    const result = applyNormalize(params, { subject: ['trim', 'lowercase'] });

    expect(result).toEqual({ subject: 'hello', body: '  Body  ' });
  });

  test('does not mutate the input params', () => {
    const params = { to: ['  A@X.com  '] };

    applyNormalize(params, { to: ['trim', 'lowercase'] });

    expect(params).toEqual({ to: ['  A@X.com  '] });
  });
});

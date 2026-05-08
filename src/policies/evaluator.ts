import type { LoadResult } from './loader';
import type { Denial, EngineError, Policy, Predicate, Rule, Scalar, Violation } from './types';

export type EvaluationResult = { decision: 'allow' } | { decision: 'deny'; denials: Denial[] };

// What the handler ultimately needs: allow, deny, or engine error (quarantine).
// `pending_approval` joins this union in slice 2+. Pure evaluation never produces
// `error` — that variant only comes from quarantine, hence the wrapper below.
export type DecisionResult = EvaluationResult | { decision: 'error'; error: EngineError };

// Each operator returns the violations produced when its condition is met.
// Empty array = condition NOT met (predicate did not fire).
type OperatorFn = (field: string, opValue: unknown, value: unknown) => Violation[];

// A string[] field with a singular predicate fires the rule if any element
// satisfies the predicate (first-slice.md "Operadores e gramática"). Scalars
// are wrapped to behave uniformly.
function existential(
  field: string,
  value: unknown,
  matches: (el: unknown) => boolean,
  message: string,
): Violation[] {
  const elements = Array.isArray(value) ? value : [value];
  return elements.filter(matches).map((el) => ({ field, value: el, message }));
}

const operators: Record<string, OperatorFn> = {
  in: (field, opValue, value) => {
    const blocklist = opValue as readonly Scalar[];
    return existential(
      field,
      value,
      (el) => blocklist.includes(el as Scalar),
      `${field} value is in the disallowed list`,
    );
  },
  not_in: (field, opValue, value) => {
    const allowed = opValue as readonly Scalar[];
    return existential(
      field,
      value,
      (el) => !allowed.includes(el as Scalar),
      `${field} value is not in the allowed list`,
    );
  },
  contains: (field, opValue, value) => {
    const needle = opValue as string;
    return existential(
      field,
      value,
      (el) => typeof el === 'string' && el.includes(needle),
      `${field} contains the disallowed substring`,
    );
  },
};

// Returns violations if every operator on the field fires (AND); empty if any fails.
function evaluatePredicate(field: string, predicate: Predicate, value: unknown): Violation[] {
  const collected: Violation[] = [];
  for (const [op, opValue] of Object.entries(predicate)) {
    const fn = operators[op];
    if (!fn) return []; // unknown operator: treat as not-matched
    const opViolations = fn(field, opValue, value);
    if (opViolations.length === 0) return []; // AND across operators fails
    collected.push(...opViolations);
  }
  return collected;
}

// Returns a Denial if the Rule fires (every field's predicate matches, AND).
function evaluateRule(rule: Rule, params: Record<string, unknown>): Denial | null {
  const collected: Violation[] = [];
  for (const [field, predicate] of Object.entries(rule.when)) {
    const fieldViolations = evaluatePredicate(field, predicate, params[field]);
    if (fieldViolations.length === 0) return null; // AND across fields fails
    collected.push(...fieldViolations);
  }
  return {
    ruleId: rule.id,
    reason: 'rule_matched',
    violations: collected,
  };
}

export function evaluate(policy: Policy, params: Record<string, unknown>): EvaluationResult {
  for (const rule of policy.rules) {
    const denial = evaluateRule(rule, params);
    if (denial) return { decision: 'deny', denials: [denial] };
  }
  return { decision: 'allow' };
}

// Top-level entry point used by the MCP handler. A quarantined Tool short-circuits
// to `decision: error`; an ok Tool delegates to the pure evaluator.
export function decide(loadedTool: LoadResult, params: Record<string, unknown>): DecisionResult {
  if (loadedTool.status === 'quarantined') {
    return { decision: 'error', error: loadedTool.error };
  }
  return evaluate(loadedTool.policy, params);
}

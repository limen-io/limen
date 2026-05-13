import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { EngineError, Policy } from '../limen/types';

// Outcome of attempting to load a single Tool's policy file.
//   ok           → parsed and schema-validated.
//   quarantined  → YAML or schema rejected the operator's intent (ADR 0002).
//   missing      → no file present; treated as empty allow (ADR 0008). The
//                  warning is emitted by the boot caller, not the loader.
export type LoadedPolicy =
  | { status: 'ok'; policy: Policy }
  | { status: 'quarantined'; error: EngineError }
  | { status: 'missing' };

const ScalarSchema = z.union([z.string(), z.number(), z.boolean()]);

// All object schemas are strict: unknown keys cause validation to fail.
// This is what catches operator typos like `not_inn` instead of `not_in` —
// the spec explicitly forbids silently dropping rules (first-slice.md §3,
// "Carregamento de Policies e quarentena").
const PredicateSchema = z
  .object({
    in: z.array(ScalarSchema).optional(),
    not_in: z.array(ScalarSchema).optional(),
    contains: z.string().optional(),
  })
  .strict();

// `deny_when` (not `when`) keeps the verb next to the condition; see ADR 0001.
// `allow_when` is not yet supported and intentionally NOT accepted here:
// strict() will quarantine any policy that uses it, which is the right signal
// until the desugaring is implemented.
const RuleSchema = z
  .object({
    id: z.string(),
    description: z.string().optional(),
    deny_when: z.record(z.string(), PredicateSchema),
  })
  .strict();

const PolicySchema = z
  .object({
    version: z.literal(1),
    rules: z.array(RuleSchema),
  })
  .strict();

function quarantine(code: string, detail: string): LoadedPolicy {
  return {
    status: 'quarantined',
    error: { type: 'engine_error', code, detail },
  };
}

// Pure parse + schema validation. Exposed for unit testing; production callers
// go through loadPolicyForTool which handles filesystem I/O.
export function loadPolicy(content: string): LoadedPolicy {
  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (err) {
    return quarantine('invalid_yaml', err instanceof Error ? err.message : String(err));
  }

  const result = PolicySchema.safeParse(parsed);
  if (!result.success) {
    return quarantine('invalid_policy', result.error.message);
  }

  return { status: 'ok', policy: result.data };
}

// Looks for `<toolName>.yaml` in `policiesDir` (then `.yml` as fallback).
// Missing file is a domain outcome, not an error: ADR 0008 says a Tool without
// a Policy file loads as an empty allow. The boot layer is responsible for
// turning that into a visible warning.
export function loadPolicyForTool(toolName: string, policiesDir: string): LoadedPolicy {
  for (const ext of ['yaml', 'yml']) {
    const path = join(policiesDir, `${toolName}.${ext}`);
    let content: string;
    try {
      content = readFileSync(path, 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
    return loadPolicy(content);
  }
  return { status: 'missing' };
}

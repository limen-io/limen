import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { EngineError, Policy } from '../limen/types';

export type LoadedTool =
  | { status: 'ok'; tool: string; policy: Policy }
  | { status: 'quarantined'; tool: string; error: EngineError };

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

const RuleSchema = z
  .object({
    id: z.string(),
    description: z.string().optional(),
    when: z.record(z.string(), PredicateSchema),
  })
  .strict();

const PolicySchema = z
  .object({
    version: z.literal(1),
    rules: z.array(RuleSchema),
  })
  .strict();

function quarantine(tool: string, code: string, detail: string): LoadedTool {
  return {
    status: 'quarantined',
    tool,
    error: { type: 'engine_error', code, detail },
  };
}

export function loadPolicy(content: string, tool: string): LoadedTool {
  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (err) {
    return quarantine(tool, 'invalid_yaml', err instanceof Error ? err.message : String(err));
  }

  const result = PolicySchema.safeParse(parsed);
  if (!result.success) {
    return quarantine(tool, 'invalid_policy', result.error.message);
  }

  return { status: 'ok', tool, policy: result.data };
}

// Loads every *.yaml / *.yml in `directory` as an independent Tool. Tool name
// is derived from the filename (basename without extension). Non-yaml files
// are ignored. Results are returned sorted by tool name for determinism.
export function loadPoliciesFromDir(directory: string): LoadedTool[] {
  return readdirSync(directory)
    .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => {
      const tool = basename(file, extname(file));
      const content = readFileSync(join(directory, file), 'utf-8');
      return loadPolicy(content, tool);
    });
}

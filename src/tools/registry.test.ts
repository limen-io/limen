import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { loadTools, wireAdapters } from './registry';
import type { Adapter, GmailClient, ToolDefinition, ToolDeps } from './types';

const stubDeps: ToolDeps = {
  gmailClient: {} as GmailClient,
  gmailFrom: '',
};

function makeDef(name: string, adapter: Adapter): ToolDefinition {
  return {
    name,
    description: `${name} description`,
    inputSchema: { x: z.string() },
    createAdapter: () => adapter,
  };
}

describe('wireAdapters', () => {
  test('produces a Map keyed by tool name', () => {
    const adapterA: Adapter = async () => ({ status: 'success', result: { tag: 'a' } });
    const adapterB: Adapter = async () => ({ status: 'success', result: { tag: 'b' } });
    const defs = [makeDef('tool_a', adapterA), makeDef('tool_b', adapterB)];

    const map = wireAdapters(defs, stubDeps);

    expect(map.get('tool_a')).toBe(adapterA);
    expect(map.get('tool_b')).toBe(adapterB);
    expect(map.get('does_not_exist')).toBeUndefined();
  });
});

describe('loadTools', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'limen-tools-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('builds a LoadedTool per definition with policy resolved from disk', () => {
    writeFileSync(
      join(dir, 'tool_a.yaml'),
      `version: 1\nrules:\n  - id: deny-x\n    deny_when:\n      x:\n        in: ['no']\n`,
    );
    const adapter: Adapter = async () => ({ status: 'success', result: {} });
    const defs = [makeDef('tool_a', adapter)];

    const loaded = loadTools(defs, stubDeps, dir);

    const a = loaded.get('tool_a');
    expect(a?.policy.status).toBe('ok');
    expect(a?.adapter).toBe(adapter);
    expect(a?.definition.description).toBe('tool_a description');
  });

  test('tools without a policy file load as `missing` (ADR 0008)', () => {
    const defs = [makeDef('orphan_tool', async () => ({ status: 'success', result: {} }))];

    const loaded = loadTools(defs, stubDeps, dir);

    expect(loaded.get('orphan_tool')?.policy.status).toBe('missing');
  });

  test('quarantining one tool does not affect the others', () => {
    writeFileSync(join(dir, 'broken_tool.yaml'), 'not valid yaml: [');
    writeFileSync(
      join(dir, 'healthy_tool.yaml'),
      `version: 1\nrules:\n  - id: deny-x\n    deny_when:\n      x:\n        in: ['no']\n`,
    );
    const defs = [
      makeDef('broken_tool', async () => ({ status: 'success', result: {} })),
      makeDef('healthy_tool', async () => ({ status: 'success', result: {} })),
    ];

    const loaded = loadTools(defs, stubDeps, dir);

    expect(loaded.get('broken_tool')?.policy.status).toBe('quarantined');
    expect(loaded.get('healthy_tool')?.policy.status).toBe('ok');
  });
});

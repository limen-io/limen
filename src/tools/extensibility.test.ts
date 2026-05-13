import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { handleToolCall } from '../mcp/handler';
import { fixtureTool } from './__fixtures__/fixture-tool';
import { loadTools } from './registry';
import type { GmailClient, ToolDeps } from './types';

// Slice 2 extensibility criterion (slice002.md §7, ADR 0006). The fixtureTool
// declares its own name, schema, normalize, and adapter. The point of this
// suite is that the loadTools → handleToolCall path treats it correctly with
// no changes anywhere in handler / server / evaluator. If a fixture forces
// edits to those files, the abstraction has leaked.
//
// stubDeps is a ToolDeps satisfying the structural type without resolving any
// real provider — the fixture never touches gmailClient, so the empty stubs
// stay unused.
const stubDeps: ToolDeps = {
  gmailClient: {} as GmailClient,
  gmailFrom: '',
};

describe('extensibility (fixture tool)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('loadTools exposes the fixture with its declared description and inputSchema', () => {
    const dir = mkdtempSync(join(tmpdir(), 'limen-ext-'));
    try {
      const loaded = loadTools([fixtureTool], stubDeps, dir);
      const loadedFixture = loaded.get('fixture_tool');

      expect(loadedFixture).toBeDefined();
      expect(loadedFixture?.definition.description).toBe(fixtureTool.description);
      expect(loadedFixture?.definition.inputSchema).toBe(fixtureTool.inputSchema);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('missing policy file → empty allow (ADR 0008)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'limen-ext-'));
    try {
      const loaded = loadTools([fixtureTool], stubDeps, dir);
      expect(loaded.get('fixture_tool')?.policy.status).toBe('missing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('handler dispatches to the fixture adapter (not any other) and propagates its result', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dir = mkdtempSync(join(tmpdir(), 'limen-ext-'));
    try {
      const loaded = loadTools([fixtureTool], stubDeps, dir);
      const loadedFixture = loaded.get('fixture_tool');
      if (!loadedFixture) throw new Error('fixture_tool missing from registry');

      const result = await handleToolCall(
        {
          tool: 'fixture_tool',
          jsonRpcId: 1,
          params: { label: '  HELLO  ' },
        },
        loadedFixture,
      );

      expect(result.isError).toBe(false);
      expect(result.structuredContent).toMatchObject({
        tool: 'fixture_tool',
        decision: 'allow',
        executed: true,
      });
      if (result.structuredContent.decision === 'allow' && result.structuredContent.executed) {
        // The fixture echoes the params it saw. After normalize, label is
        // trimmed and lowercased — proves normalize fires for arbitrary tools,
        // not just hardcoded fields.
        expect(result.structuredContent.result).toEqual({ echo: { label: 'hello' } });
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

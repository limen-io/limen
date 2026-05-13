import { z } from 'zod';
import type { ToolDefinition } from '../types';

// No-op ToolDefinition used by the extensibility test (slice002.md §7).
// Calling its adapter never reaches a real SDK; it just echoes the params it
// received as `result`, so tests can assert wiring without setting up Gmail or
// any other provider. The presence of this fixture proves that adding a Tool
// to a registry is mechanical: nothing in handler/server/evaluator/registry
// needs to know it exists.
export const fixtureTool: ToolDefinition = {
  name: 'fixture_tool',
  description: 'A no-op tool used by the slice 2 extensibility test.',
  inputSchema: {
    label: z.string(),
  },
  normalize: {
    label: ['trim', 'lowercase'],
  },
  createAdapter: () => async (params) => ({
    status: 'success',
    result: { echo: params },
  }),
};

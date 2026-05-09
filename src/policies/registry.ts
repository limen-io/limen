import { type LoadedTool, loadPoliciesFromDir } from './loader';

export type ToolRegistry = {
  get(tool: string): LoadedTool | undefined;
  list(): string[];
};

// Loads every policy file in `directory` once at boot. Returns a frozen view
// (no hot reload in slice 1; restart the dev server to pick up YAML changes).
export function loadRegistry(directory: string): ToolRegistry {
  const map = new Map<string, LoadedTool>();
  for (const result of loadPoliciesFromDir(directory)) {
    map.set(result.tool, result);
  }
  return {
    get: (tool) => map.get(tool),
    list: () => [...map.keys()],
  };
}

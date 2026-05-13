import { loadPolicyForTool } from '../policies/loader';
import { draftReplyTool } from './gmail/draft-reply';
import { sendEmailTool } from './gmail/send-email';
import type { Adapter, LoadedTool, ToolDefinition, ToolDeps } from './types';

// Central catalogue of every Tool the MCP server exposes. Adding a Tool means
// authoring its ToolDefinition file under src/tools/<provider>/, importing it
// here, and appending to this array. Filesystem-based discovery was rejected
// (ADR 0006) — exposure is an explicit opt-in.
export const toolDefinitions: ToolDefinition[] = [sendEmailTool, draftReplyTool];

// Resolves every ToolDefinition's adapter using the shared deps bag. Returns a
// name → Adapter map so the handler can dispatch by Tool name without knowing
// which provider each Tool came from.
export function wireAdapters(definitions: ToolDefinition[], deps: ToolDeps): Map<string, Adapter> {
  const map = new Map<string, Adapter>();
  for (const def of definitions) {
    map.set(def.name, def.createAdapter(deps));
  }
  return map;
}

// Builds the runtime view used by the handler: per Tool, the definition (for
// name/schema/normalize), the policy load outcome, and the wired Adapter. The
// caller is the boot path; the result is cached for the lifetime of the
// process.
export function loadTools(
  definitions: ToolDefinition[],
  deps: ToolDeps,
  policiesDir: string,
): Map<string, LoadedTool> {
  const adapters = wireAdapters(definitions, deps);
  const map = new Map<string, LoadedTool>();
  for (const def of definitions) {
    const adapter = adapters.get(def.name);
    if (!adapter) continue; // unreachable: wireAdapters fills every name
    map.set(def.name, {
      definition: def,
      policy: loadPolicyForTool(def.name, policiesDir),
      adapter,
    });
  }
  return map;
}

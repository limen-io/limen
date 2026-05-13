import type { gmail_v1 } from 'googleapis';
import type { z } from 'zod';
import type { AdapterResult } from '../limen/types';
import type { LoadedPolicy } from '../policies/loader';
import type { NormalizeConfig } from './normalizers';

// Re-export so call sites can pull AdapterResult from the tool layer where it
// is most relevant (the Adapter return type). Canonical declaration stays in
// limen/types.ts (also referenced by AuditEvent.execution).
export type { AdapterResult } from '../limen/types';

// The raw Gmail SDK client. Lives in tools/gmail/client.ts in slice 2; the type
// is referenced here so ToolDeps can carry it. Future providers add their own
// client types to this file alongside this one.
export type GmailClient = gmail_v1.Gmail;

// Bag of provider clients resolved once at boot and passed to every
// createAdapter factory. Each Tool destructures only what it uses. Grows
// monotonically as new providers come online (ADR 0006).
//
// `gmailFrom` is the authorised sender's email address used as the `From:`
// header. It sits alongside `gmailClient` because both are properties of "the
// Gmail account this Limen instance is bound to".
export type ToolDeps = {
  gmailClient: GmailClient;
  gmailFrom: string;
};

// (params: Record<string, unknown>) => Promise<AdapterResult>. Params arrive
// validated by the Tool's Zod inputSchema (MCP SDK validates before the handler
// is invoked), so the Adapter can destructure safely (ADR 0005).
export type Adapter = (params: Record<string, unknown>) => Promise<AdapterResult>;

// A single exported object per Tool, declared in src/tools/<provider>/<tool>.ts
// and listed in src/tools/registry.ts. Carries everything needed to expose and
// run the Tool: name, description, Zod inputSchema, the Adapter factory, and
// optional per-field normalization (ADR 0006, 0007).
export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  createAdapter: (deps: ToolDeps) => Adapter;
  normalize?: NormalizeConfig;
};

// The composite runtime view of a Tool: its declaration, its policy load
// outcome, and its wired Adapter. This is what the MCP handler dispatches on.
// Built once at boot from the central toolDefinitions array + the policies/
// directory + the resolved ToolDeps.
export type LoadedTool = {
  definition: ToolDefinition;
  policy: LoadedPolicy;
  adapter: Adapter;
};

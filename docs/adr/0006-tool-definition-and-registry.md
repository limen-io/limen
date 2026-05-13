# Tool definition and registry

Each Tool is declared as a single exported object (`ToolDefinition`) in `src/tools/<provider>/<tool>.ts`, carrying every field needed to expose and run it: `name`, `description`, `inputSchema` (Zod), `createAdapter` (factory), and optional `normalize`. A central array in `src/tools/registry.ts` imports these objects and lists the Tools that the MCP server exposes.

Dependencies that adapters need at runtime (the Gmail OAuth client, future Slack client, etc.) are resolved once at boot and passed as a single `ToolDeps` bag to every `createAdapter` call. Each Tool destructures from the bag what it actually uses.

## Why colocation

A Tool is a small bounded unit: one MCP name, one Policy file, one side effect, one error mapping. Splitting those across `mcp/tools.ts` (registration), `tools/<provider>/<tool>.ts` (adapter), and `mcp/handler.ts` (normalize) — which is what slice 1 ended up doing — forces a reader to chase three files to understand a single Tool. Colocation keeps the unit intact: one file, one story.

## Why an array in code, not filesystem discovery

The registry is an explicit opt-in list. Adding a Tool to the array is the act that exposes it to the MCP server. Filesystem-based discovery (glob `src/tools/**/*.ts` at boot) would feel more "automatic" but trades an explicit decision for an accident-prone convention: a file that exports something tool-shaped becomes a live Tool. Magic is the wrong axis for a security product.

The cost of the array is one line per new Tool. The benefit is that the catalog of exposed Tools is grep-able from a single file.

## Why one shared `ToolDeps` bag, not per-Tool generic types

A per-Tool `TDeps` generic (`ToolDefinition<{ gmailClient }>` vs `ToolDefinition<{ slackClient }>`) would be more precise type-theoretically. In TypeScript, it makes the generic `for (const t of toolDefinitions) ...` loop in the boot wiring impossible to type without higher-kinded type encoding tricks that are not worth the complexity at this size.

Using a shared `ToolDeps` bag keeps the loop trivial. Each Tool stays honest about what it uses through destructuring at the `createAdapter` signature: `createAdapter: ({ gmailClient }) => ...` makes the dependency visible on the first line of the file. Unused fields in the destructure are dead code obvious in review.

`ToolDeps` grows monotonically (each new provider adds one key). It is acceptable as a "god type" at this scale; if it ever holds 50+ providers the project has bigger structural problems to solve first.

## Consequences

- `src/tools/types.ts` defines `ToolDefinition` and `ToolDeps`.
- `src/tools/registry.ts` exports `toolDefinitions: ToolDefinition[]` and a `wireAdapters(definitions, deps)` function that returns `Map<string, Adapter>`.
- `src/tools/gmail/client.ts` (renamed from slice 1's `sender.ts`) exports `createGmailClient(config)` and `gmailClientFromEnv()`.
- The MCP registration in `src/mcp/tools.ts` becomes `registerTools(mcpServer, registry, adapters)`, iterating the registry rather than calling a per-Tool function.
- Adding a Tool to the catalog is mechanical: create the policy YAML, create the Tool file with a `ToolDefinition` export, add one import + one entry to `toolDefinitions`, add the provider's client to `ToolDeps` if it does not exist yet.

## Alternatives considered

- **Index file with metadata, adapters separate.** Splits a Tool's story across two files for no benefit.
- **Filesystem discovery.** Implicit, surprising, accident-prone.
- **Per-Tool `TDeps` generic.** More precise but blocks a clean wiring loop in TypeScript.

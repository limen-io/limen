# Limen

Open source policy enforcement engine that decides whether an AI agent's tool call is allowed, blocked, or queued for human approval.

## Language

**Tool**:
An integration the agent can call, exposed via the MCP server (e.g., `send_email`).
_Avoid_: action, capability, function

**Tool definition**:
The TypeScript object exported from `src/tools/<provider>/<tool>.ts` that declares everything about a Tool: name, description, Zod `inputSchema`, `createAdapter` factory, and optional `normalize` config. The central array in `src/tools/registry.ts` lists every Tool definition the server exposes; that array is the source of truth for "which Tools exist".
_Avoid_: tool spec, tool manifest, tool config

**Policy**:
The configuration that restricts a Tool. One Policy per Tool, stored in `policies/<tool>.yaml`. A Tool with no matching Policy file loads as an empty Policy (allow-all, with a warning at boot) — see ADR 0008.
_Avoid_: ruleset, config

**Rule**:
A single deny clause inside a Policy, with `id`, `deny_when`, and an optional `description`. Every Rule is implicitly deny; the condition lives under `deny_when:` so the verb sits next to the condition it qualifies. There is no `effect` field. A Policy contains many Rules. See ADR 0001 for the grammar rationale.
_Avoid_: statement, clause

**Policy engine**:
The runtime component that loads Policies and evaluates Rules against incoming Tool calls.
_Avoid_: rule engine, evaluator

**Decision**:
The verdict produced by the Policy engine: `allow`, `deny`, `pending_approval`, or `error`.
_Avoid_: verdict, outcome, result

**Adapter**:
A function `(params) => Promise<AdapterResult>` that performs the actual side effect of a Tool and returns either a `success` with a result payload or a `failed` with an `AdapterError`. The try/catch that converts SDK exceptions into the `failed` variant lives inside the Adapter (ADR 0005). The raw SDK client the Adapter calls (e.g., the Gmail googleapis client) is a private implementation detail of the Tool's folder, not a publicly exported type. Runs only when the Decision is `allow`.
_Avoid_: integration, driver, connector

**Tool deps**:
A bag of provider clients (Gmail OAuth client, future Slack client, etc.) resolved once at boot and passed to every Adapter factory. Each Tool destructures from the bag what it actually uses; the bag grows monotonically as new providers come online (ADR 0006).
_Avoid_: services, dependencies, injectables

**Transformer**:
A named function from a closed set defined in `src/tools/normalizers.ts` (`trim`, `lowercase` in slice 2) that normalizes a parameter value before policy evaluation and Adapter execution. Declared per Tool, per field; multiple Transformers applied in declared order (ADR 0007).
_Avoid_: normalizer (the verb), filter, transform

**Audit event**:
A single structured record describing one Tool call's full journey through the engine. Emitted as JSON Lines on stdout (at some point will be persisted). Captures the raw params the agent sent, regardless of any normalization applied downstream.
_Avoid_: log entry, trace, span

## Relationships

- A **Tool** is declared by exactly one **Tool definition** in code, listed in the central registry.
- A **Tool** has at most one **Policy** (matched by file name). A Tool without a Policy file loads as an empty Policy.
- A **Policy** contains zero or more **Rules**.
- The **Policy engine** evaluates a Tool call against the matching Policy and produces a **Decision**.
- An **Adapter** is produced by the Tool definition's `createAdapter` factory, given the **Tool deps** bag at boot. The Adapter runs only when the Decision is `allow`.
- A **Transformer** is applied to a parameter value before the Policy engine sees it and before the Adapter runs.
- Every Tool call produces exactly one **Audit event**, regardless of Decision.

## Example dialogue

> **Dev:** "When the agent calls `send_email`, what runs first?"
> **Limen author:** "The MCP handler looks up the Tool definition in the registry. It applies the Tool's `normalize` (if declared) to the raw params. The Policy engine loads `policies/send_email.yaml` and evaluates each Rule against the normalized params. If the Decision is `allow`, the Adapter (produced from the Tool's `createAdapter`) is invoked with the normalized params. If `deny`, the Adapter is never called and the response includes the matched Rule in the `denials` array. Either way, one Audit event is emitted with the raw params."

> **Dev:** "What's the difference between a Policy and a Rule?"
> **Limen author:** "A Policy is a file. A Rule is a line item inside that file. You write Rules; the file they live in is the Policy. The Policy is named after the Tool it restricts."

> **Dev:** "Where does the Gmail OAuth client live?"
> **Limen author:** "It's resolved once at boot from environment variables and put into the Tool deps bag. Every Gmail Adapter destructures `gmailClient` from that bag in its `createAdapter` factory. Slack and other providers will add their own clients to the same bag when they arrive."

## Flagged ambiguities

- "Policies" and "Rules" are sometimes used interchangeably in casual speech. In Limen they are not synonyms: a Policy is a configuration file, a Rule is one entry in it.
- "Tool" can mean either an MCP-level concept (a registered method the agent can call) or a Limen domain concept (a thing with a Tool definition and optionally a Policy). In Limen these coincide: every MCP tool registered by Limen comes from a Tool definition in the registry.
- "Adapter" sometimes refers loosely to the entire Tool folder (`src/tools/gmail/send-email.ts`). Strictly, the Adapter is the function returned by `createAdapter`; the folder also contains the Tool definition, the inputSchema, and any private SDK client setup.
- "Channel" is reserved for future work (Tool plus listener for ingress). Not a slice 1 or slice 2 concept.

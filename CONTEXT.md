# Limen

Open source policy enforcement engine that decides whether an AI agent's tool call is allowed, blocked, or queued for human approval.

## Language

**Tool**:
An integration the agent can call, exposed via the MCP server (e.g., `send_email`).
_Avoid_: action, capability, function

**Policy**:
The configuration that restricts a Tool. One Policy per Tool, stored in `policies/<tool>.yaml`.
_Avoid_: ruleset, config

**Rule**:
A single deny clause inside a Policy, with `id`, `when`, and an optional `description`. Every Rule is implicitly deny; there is no `effect` field. A Policy contains many Rules.
_Avoid_: statement, clause

**Policy engine**:
The runtime component that loads Policies and evaluates Rules against incoming Tool calls.
_Avoid_: rule engine, evaluator

**Decision**:
The verdict produced by the Policy engine: `allow`, `deny`, `pending_approval`, or `error`.
_Avoid_: verdict, outcome, result

**Adapter**:
The code that performs the actual side effect of a Tool (e.g., the Gmail API client behind `send_email`). Runs only when the Decision is `allow`.
_Avoid_: integration, driver, connector

**Audit event**:
A single structured record describing one Tool call's full journey through the engine. Emitted as JSON Lines on stdout in slice 1; persisted from slice 2 onward.
_Avoid_: log entry, trace, span

## Relationships

- A **Tool** has exactly one **Policy** (matched by file name).
- A **Policy** contains zero or more **Rules**.
- The **Policy engine** evaluates a Tool call against the matching Policy and produces a **Decision**.
- An **Adapter** runs only when the Decision is `allow`.
- Every Tool call produces exactly one **Audit event**, regardless of Decision.

## Example dialogue

> **Dev:** "When the agent calls `send_email`, what runs first?"
> **Limen author:** "The MCP handler routes the call to the Policy engine. The engine loads `policies/send_email.yaml`, evaluates each Rule, and returns a Decision. If the Decision is `allow`, the Gmail Adapter is invoked. If `deny`, the Adapter is never called and the response includes the matched Rule in the `denials` array."

> **Dev:** "What's the difference between a Policy and a Rule?"
> **Limen author:** "A Policy is a file. A Rule is a line item inside that file. You write Rules; the file they live in is the Policy. The Policy is named after the Tool it restricts."

## Flagged ambiguities

- "Policies" and "Rules" are sometimes used interchangeably in casual speech. In Limen they are not synonyms: a Policy is a configuration file, a Rule is one entry in it.
- "Tool" can mean either an MCP-level concept (a registered method the agent can call) or a Limen domain concept (a thing with a Policy attached). In Limen these coincide: every MCP tool registered by Limen has a Policy.
- "Channel" is reserved for future work (Tool plus listener for ingress). Not a slice 1 concept.

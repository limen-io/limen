# Normalize via named transformers, per Tool

A Tool can optionally declare parameter normalization as a map of `{ field → [TransformerName, ...] }`, where `TransformerName` is drawn from a closed set defined in `src/tools/normalizers.ts`. Slice 2 ships with `trim` and `lowercase`. New transformers are added as discrete, named functions; arbitrary inline transforms are not allowed.

Normalization is applied uniformly to all calls of the Tool, before policy evaluation and before the Adapter runs. Both the Policy engine and the Adapter see the normalized params. The `AuditEvent` records the **raw** params, preserving the spec from slice 1.

## Why named transformers (closed set), not arbitrary functions

The long-term direction (see `internal/product/feature-ideas.md`) is to put normalization decisions in the hands of the operator, declared in `policies/<tool>.yaml` rather than in Tool code. That migration is only possible if the vocabulary is closed: a YAML config can list transformer names (`[trim, lowercase]`) but cannot express arbitrary TypeScript functions. Starting with a closed set now means the future migration is a relocation, not a redesign.

The cost is that any new transformation requires a code change to `normalizers.ts`. Slice 2's two-element set is the seed; expanding it is one line per addition.

## Why per Tool, not per Rule

Per-Tool normalization covers the common case: emails are case-insensitive, period, regardless of which Rule references them. Per-Rule normalization (each Rule declaring its own transformers) gives more flexibility for the edge case of "Rule X wants exact match while Rule Y wants case-insensitive on the same field", at the cost of duplication in the common case and a real risk of silent drift (operator forgets `lowercase` in one Rule and a bypass appears).

The hybrid that may be needed in the long run is documented in `feature-ideas.md`: Tool-level defaults with per-Rule override. Slice 2 ships only the Tool-level half; adding the override is purely additive and does not require changing the engine.

## Why uniform application, not policy-only

If normalize were applied only for policy evaluation (and the Adapter received raw params), policy and execution could see different values. For email casing this is harmless (RFC 5321 treats local-part casing as the receiver's choice; sending `JOAO@EXAMPLE.COM` and `joao@example.com` lands at the same mailbox). For other future transformations (URL canonicalization, number parsing) the divergence is dangerous: the engine permits action on the canonical form, the Adapter executes the raw form, and the audit trail does not show which version "actually ran". Applying normalize uniformly closes the gap; audit captures raw so fidelity to the agent's original request is not lost.

## Consequences

- `src/tools/normalizers.ts` exports a `transformers` record and a `TransformerName` type derived from its keys.
- `src/tools/types.ts` defines `ToolDefinition.normalize?: Record<string, TransformerName[]>`.
- `applyNormalize(params, normalizeConfig)` lives in the handler (or a small util) and applies transformers in declared order; for `string[]` fields, each element is transformed individually.
- The `normalize()` function hardcoded for `send_email` in slice 1's `mcp/handler.ts` is removed.
- A new transformer is added by appending one function to `transformers` and using its name in any Tool. No engine change.

## Alternatives considered

- **Arbitrary function in code (`normalize: (p) => p`).** Maximum flexibility, blocks the operator-controlled future, no shared vocabulary.
- **Per-Rule normalize block.** More granular but duplicates in the common case and invites silent drift.
- **Case-aware operator variants (`not_in_ci`, `contains_ci`, ...).** Solves the case dimension cleanly, explodes combinatorially as more dimensions appear (whitespace, accents, unicode).
- **Zod `.transform()` in `inputSchema`.** Violates the "audit captures raw" invariant from slice 1 and conflates type validation with semantic normalization.

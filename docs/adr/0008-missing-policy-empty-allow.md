# Missing Policy file is an empty Policy

If a Tool is registered in `src/tools/registry.ts` but no matching `policies/<tool>.yaml` exists, the Tool loads with an empty Policy: zero Rules, no restrictions, every call is allowed. The boot log emits a warning naming the Tool ("Tool `draft_reply` has no policy file. All calls will be allowed."). The Tool is otherwise fully exposed and functional.

This generalises the principle of ADR 0002 ("broken Policy quarantines the Tool") with one explicit exception: **missing** is not **broken**. An invalid YAML or a schema-rejecting Policy still quarantines, because the operator's stated intent could not be parsed. A missing file is read as "the operator chose not to write restrictions for this Tool yet", which is a valid stance in Limen's model.

## Why allow, not quarantine

Two reasons, one local and one strategic.

Locally, the policy model from ADR 0001 is default-allow: exposing a Tool grants the capability, and Rules only restrict. A Policy with zero Rules is a valid state of that model (it is exactly what `version: 1\nrules: []` would express). Requiring the operator to type that file explicitly is ceremony without protective value: forgetting to write the file is no different in outcome from writing the empty file.

Strategically, Limen is also intended to serve as a fast gateway for exposing APIs to agents without policy authoring upfront. An operator who wants to plug a Gmail account into their agent and iterate from there should not be blocked by mandatory policy authoring. Restrictions can be added incrementally as real risks surface. The warning in the boot log ensures the lack of a policy is visible rather than silent.

The future UI is also expected to make accidental "exposed without protection" cases rare, because exposing a Tool through the UI will be a deliberate click rather than a file deletion or oversight.

## Consequences

- `loadPoliciesFromDir` in `src/policies/loader.ts` is no longer the source of truth for which Tools exist. The source of truth becomes the array in `src/tools/registry.ts`. The loader is called once per registered Tool, with the Tool name; it tries to read `policies/<name>.yaml`.
- If the file is missing: returns `{ status: 'ok', tool, policy: { version: 1, rules: [] } }`. The boot prints a warning.
- If the file exists but is invalid (parse failure or schema failure): unchanged from ADR 0002; the Tool is quarantined.
- The `policies/` directory is no longer scanned for "what Tools exist". A stray `policies/orphan.yaml` whose name does not match any registered Tool is ignored (with a warning, so misnamed files are visible).
- A Tool with empty policy still produces full `AuditEvent`s with `decision: 'allow'`, `denials: null`. Auditability is preserved even without rules.

## Trade-off accepted

A Tool exposed without a Policy file is a Tool with no automated protection. The risk is real but bounded by the warning in the boot log and by the fact that operators register Tools deliberately (the array in code is opt-in). The risk is judged acceptable in exchange for unblocking the "gateway with optional restrictions" use case.

## Alternatives considered

- **Quarantine on missing.** Maximally defensive, but blocks the gateway use case and forces ceremony (empty YAML files) for legitimate scenarios.
- **Fatal boot.** Even more aggressive; degrades developer experience when adding new Tools and contradicts the default-allow model.

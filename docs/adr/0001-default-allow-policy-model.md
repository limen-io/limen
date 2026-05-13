# Default-allow policy model

The Policy engine is default-allow: exposing a Tool grants the capability, and Rules only restrict. If no Rule matches a call, the call proceeds. This is the permanent model, not a slice 1 simplification.

The IAM/Cedar/OPA convention is default-deny because their universe of actions exists independent of configuration: network packets arrive without a firewall, AWS APIs exist without a role. Default-deny is necessary there to claw back what already happens. Limen is the inverse. Nothing exists until the operator exposes it; the Tool registry IS the explicit allow. The right analogy is middleware/decorator (Express middleware, Rails `before_action`, ASP.NET filters), not IAM.

## Consequences

- The engine never emits an `allow` verdict. Every Rule under `rules:` is implicitly deny.
- The Rule grammar uses `deny_when:` as the key for the rule's condition. The verb lives next to the condition it qualifies, so a Rule reads top-to-bottom as `id … description … deny_when to not_in […]`. Without the verb on the same line as the condition, readers have to remember from elsewhere that the rule is restrictive — which is the very confusion this grammar avoids.
- There is no `effect:` field. An explicit `effect: deny` on every Rule is redundant (the engine is deny-only forever) and an explicit `effect:` field invites operators to try `effect: allow`, which has no meaning in this model. Putting the verb in the condition's key (`deny_when:`) gives the same readability without opening that door.
- `allow_when:` is reserved as the positive form of the same slot, for cases where "permit only when X" reads more naturally than "deny when not X" (typically high blast-radius Tools — see [[strategic-decisions]] §14). When implemented, it desugars at load time to the equivalent `deny_when not X`. Exactly one of `deny_when` or `allow_when` is allowed per Rule. The engine remains deny-only forever; there is no precedence between allow and deny to resolve.
- Until `allow_when` lands, only `deny_when:` is accepted by the schema. Unknown keys (`when:`, `allow:`, `effect:`, typos) are rejected by strict schema validation and quarantine the Tool — never silently dropped (ADR 0002).

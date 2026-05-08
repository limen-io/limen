# Default-allow policy model

The Policy engine is default-allow: exposing a Tool grants the capability, and Rules only restrict. If no Rule matches a call, the call proceeds. This is the permanent model, not a slice 1 simplification.

The IAM/Cedar/OPA convention is default-deny because their universe of actions exists independent of configuration: network packets arrive without a firewall, AWS APIs exist without a role. Default-deny is necessary there to claw back what already happens. Limen is the inverse. Nothing exists until the operator exposes it; the Tool registry IS the explicit allow. The right analogy is middleware/decorator (Express middleware, Rails `before_action`, ASP.NET filters), not IAM.

## Consequences

- The engine never emits an `allow` verdict; all Rules use `effect: deny`.
- There is no precedence between allow and deny to resolve.
- Param-level restriction is available via `allow_when` syntactic sugar, which desugars to `deny when not X` at load time. The engine remains deny-only.
- Operators write Rules in negative form ("block when X") or sugared positive form ("permit only when X"); both produce the same internal representation.

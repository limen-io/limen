# Deny is a tool-call failure

When the Policy engine denies a Tool call, the MCP `CallToolResult` carries `isError: true` at the top level alongside the structured `denials` payload. Deny is treated as a tool-call failure, not as a successful response with a "no" verdict.

The framing that says deny is a deliberate decision (and therefore not an error) is the operator's perspective, not the agent's. From the agent, the world outside is Limen, not Gmail. Calling `send_email` and getting deny is functionally identical to calling Gmail directly and getting a 403: the Tool's contract was "send the email"; the email was not sent. `isError: true` honours that contract.

JSON-RPC `error` (method not found, invalid params, crash before dispatch) is a separate, protocol-level mechanism and is never used for deny. The engine ran and decided; the response comes back as `result` with `isError: true` and `decision: deny` in `structuredContent`.

## Mapping

`isError: true` ↔ the Tool did not do what was asked AND is not pending.

| `decision` | `executed` | `isError` |
|---|---|---|
| `allow` | `true` | `false` |
| `allow` | `false` | `true` |
| `deny` | `false` | `true` |
| `pending_approval` | `false` | `false` |
| `error` | `false` | `true` |

`pending_approval` is `false` because the tool is in progress, not failed (analogous to HTTP 202 Accepted with a job handle).

## Consequences

A future Tool whose contract is the verdict itself (e.g., `check_can_send_email`) would NOT use `isError: true` for a `false` answer, because answering "no" satisfies that contract. The rule is per-Tool: `isError` reflects whether the Tool's stated contract was fulfilled, not whether the Policy engine emitted a decision.

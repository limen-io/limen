# Adapter contract

An Adapter is `(params: Record<string, unknown>) => Promise<AdapterResult>`. The try/catch that converts SDK exceptions into the `failed` variant lives **inside** the Adapter, not in the handler. The raw transport (the Gmail SDK client, in the case of `send_email` and `draft_reply`) is a private implementation detail of each Tool's folder, not a publicly exported type.

The reason is colocation. Opening `src/tools/<provider>/<tool>.ts` should give the full story of one Tool: params, side effect, error mapping. If the handler owned the try/catch, half of each Tool's contract would live elsewhere, and the Tool would lose the ability to classify errors at the granularity it knows about (e.g., distinguishing `gmail_thread_not_found` from `gmail_quota_exceeded` from a generic 5xx). The handler is intentionally tool-agnostic and cannot make those distinctions.

The cost is a small block of boilerplate (~4 lines of try/catch) per Tool. That is judged cheap relative to the readability benefit. If a future point comes where the boilerplate dominates (5+ Tools all classifying errors identically), a `withErrorWrapping` helper is mechanical to introduce without changing the contract.

## Consequences

- Adapter return type is uniform across all Tools: `{ status: 'success'; result: Record<string, unknown> } | { status: 'failed'; error: AdapterError }`. The shape of `result` is free per Tool (`{ messageId }`, `{ draftId }`, etc.).
- The handler never inspects `result`; it only propagates it into the MCP `structuredContent` envelope and the `AuditEvent.execution.result` field.
- Transport types (e.g., `GmailSender` in slice 1) are removed from exports. They survive as private aliases inside `src/tools/<provider>/`.
- Strong typing of params lives in the Zod `inputSchema` of the Tool, validated by the MCP SDK before the handler is invoked. Adapters receive `Record<string, unknown>` and destructure internally; the runtime coercion is safe because validation already happened.

## Alternatives considered

- **Adapter = raw transport; try/catch in the handler.** Smaller per-Tool files, but the handler becomes the single place that classifies errors for every Tool, which it cannot do well because it does not know the SDK.
- **Adapter = raw transport; shared `runAdapter()` helper centralizes try/catch.** Elegant but solves a problem that does not exist yet; defer until repetition is real.

# One Policy file per Tool

Each Tool has its own Policy file at `policies/<tool>.yaml`. The file name IS the Tool reference; Rules inside have no `tool:` field. There is no global `policies.yaml`.

The reason is blast radius: if `policies/send_email.yaml` fails validation, only `send_email` is quarantined and other Tools load fine. A single global file would mean one bad Rule kills everything.

## Quarantine semantics

A Tool with a broken Policy stays registered in the MCP server but returns `decision: error` on every call until the file is fixed. Rules are never silently dropped: a malformed Rule quarantines the entire Tool. Silently reducing protection is the worst possible failure mode for a security product, so the engine refuses to do it.

## Cross-Tool Rules

Out of scope for slice 1. The likely future shape is `policies/_global.yaml` for Rules that span multiple Tools (rate limiting, time-of-day windows, etc.). A broken global config quarantines all Tools, consistent with the principle that a broken cross-cutting Rule cannot be silently ignored.

# Limen is invisible to the agent

The MCP tool description does not expose Rules. An agent calling `send_email` sees `"Send an email via Gmail."` plus the parameter schema, nothing about the allowlist or any other restriction. When a call is denied, the agent learns from the deny payload (`structuredContent.denials[].message`) and adjusts.

Limen positions itself as boundary control, and real boundaries (firewall, IAM, kernel ACLs) are invisible to the controlled process. Making Rules visible turns the engine from a boundary into a participant in the agent's reasoning, which weakens both the positioning and the security posture: jailbreak surface widens when the LLM can read "block when subject contains 'CONFIDENTIAL'" and reason around it.

## Operator escape hatch

Operators who want their agents to know restrictions upfront can write them into the Tool description manually. That is a deliberate, per-deployment choice and stays out of the engine's responsibility.

Limen-generated transparent descriptions (or an opt-in `policies://<tool>` MCP resource that the agent can read on demand) are tracked as a feature idea, but explicitly opt-in, never the default.

import { ulid } from 'ulid';
import type { AuditEvent, AuditEventInput } from '../policies/types';

// Builds an AuditEvent by adding system fields (schemaVersion, eventId,
// timestamp) and emits it as one JSON Lines record on stdout. Slice 1 has no
// logger framework: console.log is the transport. Returns the built event so
// the handler can also use it (e.g., for assertion in tests, or for echoing
// in error messages).
export function recordAuditEvent(input: AuditEventInput): AuditEvent {
  const event = {
    schemaVersion: 1 as const,
    eventId: `evt_${ulid()}`,
    timestamp: new Date().toISOString(),
    ...input,
  } as AuditEvent;
  console.log(JSON.stringify(event));
  return event;
}

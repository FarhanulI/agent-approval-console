# Module 11D — Audit Run Relationship Design

Status: implemented for the **mock backend**. The `erp-mcp-bridge` relationship contract remains **unverified**.

## Relationship inventory

| Relationship | Status | Evidence and limitation |
| --- | --- | --- |
| `AuditEvent → AgentRun` | verified (mock-only) | Audit event records, DTOs and writers previously had no `runId`. Module 11D adds a decision-time snapshot only when the run exists, reciprocally lists the action, and belongs to the event tenant. |
| `AuditEvent → PendingAction` | verified | `actionId` is optional and is populated by the decision audit writer and seed events. |
| `PendingAction → AgentRun` | verified as an explicit reference | `runId` is optional; mock fixtures now reference only runs that exist. The real backend's referential integrity is unverified. |
| `AgentRun → PendingActions` | verified as an explicit reference | `actionIds` lists associated actions. The BFF checks those actions exist in the same tenant before returning the run. |

No timestamp, identifier pattern, or inferred action relationship is used to create a run link. No relationship entity was introduced.

## Model and invariants

- One audit event has zero or one associated run; a run may have many audit events.
- `runId: string` means the run association was verified when recorded. `runId: null` means the event is known not to belong to a run. An omitted `runId` means the relationship could not be established or is unavailable (including older records).
- `actionId` remains optional. A decision audit record retains its action reference independently from the run reference.
- The decision BFF reads the action's explicit `runId`, checks `run:view`, and verifies the run ID and tenant before copying it into the audit record. Missing or cross-tenant runs do not become links.
- The mock audit backend rejects a non-null run reference that cannot be found in the event tenant. The run BFF validates every listed action against the run tenant and `action:view`.
- Run/action fixture references are reciprocal and tenant-consistent. The mock seed includes multiple actions for one run and user/system decision events with known no-run associations.
- Audit and run APIs have no update/delete operation. The UI cannot mutate a historical association. The mock store remains in-memory, non-durable, and mutable by tests; there is no database-level foreign key or durable immutability guarantee.
- If an associated run's details cannot be loaded, the run page returns the existing safe not-found or sanitized error state. This does not rewrite the audit event association.

## API and UI

The internal audit DTO accepts an optional nullable `runId`. Audit list query validation supports `runId` and `actionId` filters before sorting/pagination. The Audit Log renders a run link only for an explicit valid ID; null and omitted values display distinct states. The Run Detail view displays verified action references and a server-filtered, ordered, paginated list of audit events. Active runs refresh that list periodically so later audit writes can appear.

These are internal BFF contracts only. The bridge audit/run adapters remain unavailable and do no network I/O.

## Verification scope

Tests cover nullable/omitted/invalid run identifiers, fixture consistency, decision-time association and cross-tenant rejection, run-to-action validation, audit filtering and pagination, UI relationship states, audit-to-run navigation, run-to-audit navigation, and unavailable run details.

Not established without a verified backend contract: bridge field compatibility, durable foreign keys, atomic audit/decision writes, retention, immutable history, or run deletion semantics.

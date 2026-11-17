# Bridge Compatibility Report

## 1. Verification status

No authoritative `erp-mcp-bridge` contract is available in this project. Compatibility between the console and the real bridge is therefore `Unverified`. The console contracts in `src/features/approvals/contracts.ts` and related services and routes describe the internal application API; they do not establish the bridge's API.

## 2. Console-to-bridge compatibility matrix

| Capability | Console contract | Bridge contract | Compatibility | Notes |
|---|---|---|---|---|
| Action list | `ActionListResponse` and `PendingAction` in `src/features/approvals/contracts.ts` | Unverified | Unverified | No bridge operation or pagination, filter, or sort contract is available. |
| Action detail | `getAction` in `ActionsBackend` | Unverified | Unverified | Entity, evidence, and version mapping are unknown. |
| Pending approve/reject | `decide` command with internal `idempotencyKey`, `tenantId`, and `recordVersion` fields | Unverified | Unverified | Atomicity, validation, and conflict codes are unverified. |
| Bulk decision | `bulkDecide` with per-item outcomes | Unverified | Unverified | Whether the bridge supports bulk decisions is unknown. |
| Audit search/list | `auditEventSchema` and `AuditBackend` | Unverified | Unverified | The bridge event contract and audit durability are unknown. |
| Run snapshot | `agentRunSchema` and `RunsBackend.get` | Unverified | Unverified | Authoritative state and replay behavior are unknown. |
| SSE recovery | Internal `getEvents` flow and mock recovery behavior | Unverified | Unverified | Bridge event IDs, ordering, replay, and cursor expiration are unknown. |

## 3. DTO differences and mapping requirements

It is not possible to determine whether the console models match the bridge models. If a bridge contract becomes available, explicitly verify and map at least:

- `actionId`: the bridge's authoritative action identifier.
- `tenantId`: trusted server-side tenant scope and authorization context.
- `recordVersion`: the bridge's concurrency/version token, if provided.
- `actorId`: the bridge's representation of human, agent, or system identity.
- `decision`: approve/reject operation and result representation.
- `requestId` / `correlationId`: request tracing and audit attribution.
- `runId` / `eventId`: run association and event replay/order semantics.
- `status`: the authoritative lifecycle and its mapping to console states.

Treating a mock contract as the bridge contract could compromise data integrity or authorization boundaries.

## 4. Assumptions that must not be made

Do not assume:

1. `GET /api/actions` is the bridge's actual action-list operation.
2. `POST /api/actions/:id/approve` matches an actual bridge approval operation.
3. The bridge uses a field named `recordVersion` or provides equivalent concurrency protection.
4. The bridge supports a bulk-decision operation.
5. The bridge provides SSE event IDs or supports `Last-Event-ID`.
6. Mock audit behavior establishes durable bridge audit.

These are internal or proposed console contracts, not verified bridge endpoints or guarantees.

## 5. Integration blockers

Bridge integration remains blocked until the following are verified:

- The bridge repository or an official API/protocol specification.
- The supported transport: REST, MCP, or both.
- Authentication, delegated actor identity, and tenant enforcement.
- Action list/detail operations and their pagination/query schemas.
- Atomic decision validation and conflict behavior.
- Idempotency-key semantics and unknown-outcome lookup.
- Audit persistence and correlation-ID behavior.
- Run snapshots and SSE event ordering/replay semantics.

## 6. Adapter design after contract verification

Once an authoritative bridge contract is available, implement and validate adapters for the existing server-side ports:

- `ActionsBackend` in `src/features/approvals/server/` for action reads and decisions.
- `AuditBackend` in `src/features/audit/server/` for audit writes and queries.
- `RunsBackend` in `src/features/runs/server/` for run snapshots and event streams.

Add bridge-specific schema validation and error mapping at the adapter boundary. Preserve the existing console contract where practical; change it only when verified bridge semantics require a deliberate, documented adaptation. Do not introduce bridge endpoints based on assumptions.

## 7. Conclusion

The current compatibility status is `Unverified`, not compatible or incompatible. Keep the mock-safe path and fail-closed bridge placeholder until authoritative bridge evidence is available.

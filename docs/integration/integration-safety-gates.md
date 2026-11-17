# Integration Safety Gate Report

## 1. Gate summary

| Gate | Result | Evidence | Rationale |
|---|---|---|---|
| Gate 1 — Authorization | blocked | `docs/integrations/erp-mcp-bridge-contract.md`; `src/features/approvals/server/bridge-backend.ts`; `src/lib/config/readiness.ts` | Bridge authentication, delegated actor identity, and tenant enforcement have not been verified. |
| Gate 2 — Decision Correctness | blocked | `src/features/approvals/server/actions-backend.ts`; `src/features/approvals/server/bridge-backend.ts` | Atomic transitions, version validation, idempotency, and reconciliation semantics have not been verified. |
| Gate 3 — Audit Integrity | blocked | `src/features/audit/server/bridge-audit-backend.ts`; `src/features/audit/server/audit-backend.ts`; `docs/modules-spec/module-07-audit-log.md` | The bridge audit contract and its durability and consistency guarantees are unknown. |
| Gate 4 — Run Recovery | blocked | `src/features/runs/server/bridge-runs-backend.ts`; `src/features/runs/server/runs-backend.ts` | Snapshot authority, event ordering, replay cursors, and retention have not been verified. |

## 2. Gate 1 — Authorization

### Result: blocked

**Evidence**

- `src/features/approvals/server/bridge-backend.ts` states that BFF authentication and propagation/enforcement of the end-user actor and tenant must be verified before implementation.
- `src/features/approvals/server/actions-backend.ts` defines a backend context containing a session-derived principal, but this does not establish how the bridge authenticates or authorizes requests.

**Unverified requirements**

- Whether the bridge independently authenticates the actor.
- Whether it distinguishes human, agent, and system actors.
- Whether tenant scope comes from trusted credentials.
- Whether it prevents cross-tenant resource access.
- Whether it performs server-side permission checks for sensitive operations.

The gate cannot pass without authoritative evidence for these requirements.

## 3. Gate 2 — Decision Correctness

### Result: blocked

**Evidence**

- `src/features/approvals/server/actions-backend.ts` defines internal `decide` and `bulkDecide` interfaces.
- `src/features/approvals/server/bridge-backend.ts` intentionally has no real bridge implementation.

**Unverified requirements**

- Status and record-version validation at decision time.
- Atomic state transitions and concurrent-decision behavior.
- Backend-supported idempotency and duplicate-request behavior.
- An authoritative method to reconcile an unknown outcome.
- Whether audit recording is transactionally consistent with the decision.

Until these guarantees are verified, decisions must remain on the mock path. A timeout must not be interpreted as failure or trigger an automatic retry.

## 4. Gate 3 — Audit Integrity

### Result: blocked

**Evidence**

- `src/features/audit/server/bridge-audit-backend.ts` does not implement a real bridge audit backend.
- `src/features/audit/server/audit-backend.ts` defines an internal port but does not establish bridge durability or decision/audit consistency.
- The mock audit implementation is in-memory and does not prove durable persistence.

**Unverified requirements**

- Durable audit writes and retention.
- Trusted actor attribution and tenant isolation.
- Consistency between a decision and its audit event.
- Independent audit querying and pagination.

Mock audit behavior is not evidence that these guarantees exist in the bridge.

## 5. Gate 4 — Run Recovery

### Result: blocked

**Evidence**

- `src/features/runs/server/bridge-runs-backend.ts` leaves the bridge run and event-stream backend unavailable.
- `src/features/runs/server/runs-backend.ts` defines an internal interface; it does not establish the bridge event protocol.

**Unverified requirements**

- An authoritative run snapshot.
- Event identity and ordering semantics.
- Support for `Last-Event-ID` or an equivalent replay cursor.
- Replay retention and cursor-expiration behavior.
- Reconciliation between a snapshot and the event stream after reconnect.

Without these guarantees, recovery from an SSE disconnection cannot be considered verified.

## 6. Overall conclusion

All four integration safety gates are `blocked` because the real bridge evidence needed to evaluate them is unavailable. Passing mock tests does not satisfy these gates. Keep the bridge path fail-closed until authoritative specifications, source code, or executable contract tests establish the required guarantees.

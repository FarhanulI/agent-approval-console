# Module 7 — Searchable Audit Log

Status: implemented for the **mock backend**. The real `erp-mcp-bridge` audit integration remains **unavailable** (fail closed, `503 audit_unavailable`). Nothing here shows that audit records are durable, immutable or tamper-resistant.

## 1. Gap analysis (before this module)

| Question | Finding |
| --- | --- |
| Audit contract | `contracts.ts` already had `auditEventSchema`, `auditEventListResponseSchema`, `AuditQuery`, `getAuditEvents` (untouched). No `tenantId`, `eventType` is a free string, no `unknown` outcome. |
| Events recorded | None. Only the mock `decisionLog` (command shape) and BFF console JSON logs, neither of which is an audit event. |
| Durable? | No. Everything is in-memory and lost on restart. |
| Route / UI | None; `/audit` was a placeholder. |
| Bridge | Audit endpoints, durability, tenant scoping and atomicity are **unknown**. |

## 2. Contract (proposed extension, `src/features/audit/schemas/`)

`contracts.ts` is unchanged. The extension is isolated and documented:

| Field | Status | Notes |
| --- | --- | --- |
| `id` | required | Server-assigned. |
| `eventType` | required | Finite union: `decision.accepted`, `decision.conflict`, `decision.denied`, `decision.outcome_unknown`. No "executed" type exists: execution is a separate state this console never claims. |
| `outcome` | required | `success\|failure\|rejected\|pending\|partial\|unknown`. `unknown` is **not** in the `contracts.ts` enum; it is a documented extension and renders as a non-success tone. |
| `occurredAt` | required | ISO 8601, UTC (replaces `timestamp`). Assigned by the store (server clock; fixed clock in the mock). |
| `actorType`, `actorId` | required / optional | `actorId` is the internal user id; absent for system events. |
| `actionId`, `requestId` | optional | Correlation. |
| `summary` | required | Fixed server-chosen text, ≤ 300 chars. |
| `details` | optional | Strict allow-list: `decision`, `recordVersion`, `reasonProvided` (boolean only), `resultingStatus`, `conflictCode`. The decision **reason text and request bodies are never stored or exposed**. |
| `tenantId` | server-internal, required | On `AuditEventRecord` only; `toAuditEventDto` drops it, and the DTO schema is strict. |
| `runId` | unavailable | No run linkage exists in the domain yet. |

## 3. Recording semantics (mock)

Recorded only at the BFF decision boundary (`handleDecision`) through the `AuditBackend` port; never from UI code.

| Situation | Event | Outcome |
| --- | --- | --- |
| Backend accepted the decision | `decision.accepted` | `success` (approve says "Execution has not been performed") |
| Stale `recordVersion` / non-pending action / backend conflict | `decision.conflict` | `rejected` |
| Authenticated user lacks permission (own tenant) | `decision.denied` | `rejected` |
| Timeout, lost response, unconfirmed result | `decision.outcome_unknown` | `unknown` |
| Idempotent replay | none (no duplicate) | |
| 401, invalid origin/body/key, cross-tenant or missing action | none | |

Why no event for 401/CSRF/cross-tenant: the tenant is unknown or belongs to someone else, so recording would break isolation or expose other tenants' actions; those stay in the security log. A permission denial is recorded only when the target action is in one of the user's own tenants.

**Known gaps (not hidden):** the action state change and the audit write are **not atomic**; an audit write failure is logged and does not change the decision response, so a decision can exist without an event. The mock store is in-memory (lost on restart, mutable by tests), not durable, not immutable.

## 4. API (proposed, read-only, BFF)

- `GET /api/audit-events`: strict Zod query: `page`, `pageSize` ≤ 100, `sortBy=occurredAt`, `sortDirection`, `eventType`, `outcome`, `actionId`, `from`/`to` (UTC instants, `from ≤ to`, ≤ 366 days), `search` (≤ 200; matches summary and action id only). Unknown keys (`tenantId`, `actorId`, `role`, …) → 400. Response `{ items: AuditEventDto[], pagination }`.
- `GET /api/audit-events/:eventId`: one event; missing and cross-tenant events return the same 404.
- Pipeline: session (401) → `audit:view` (403) → validation (400) → backend scoped by the session's tenants → defensive tenant check (502, fail closed) → DTO mapping. `no-store`, `x-request-id`, existing error envelope. Backend failure → sanitized 502/504; bridge → 503 `audit_unavailable`.
- Only `GET` is exported; there is no write/update/delete endpoint.
- Policy: existing roles only; `audit:view` is granted to both `viewer` and `reviewer`, so no current role gets a 403 on this module (the branch exists but cannot be exercised with real roles).

## 5. UI (`/audit`)

TanStack Table (manual sort/pagination), URL state (`q`, `type`, `outcome`, `from`, `to`, `sort`, `page`; any change but `page` resets to 1), date inputs are UTC days. States: loading, initial empty, no results (with clear filters), error + retry (with request id), stale rows, background refetch notice, refresh-failed banner, out-of-range page fallback. Rows show UTC time, type/outcome badges, summary, actor, action link (only for well-formed ids; the action page authorizes again), and a Details dialog backed by the detail endpoint. All strings render as text; no raw JSON.

## 6. Contract evidence required before enabling the real bridge

Confirmed audit read/write endpoints and schemas; how tenant scope and the end-user actor are propagated and enforced; whether decision and audit are recorded atomically; durability, immutability and retention; event taxonomy mapping (including an `unknown`-like outcome); ordering and pagination guarantees; idempotency of audit writes.

## 7. Acceptance criteria and tests

| ID | Criterion | Tests |
| --- | --- | --- |
| AUDIT-001 | Schema validity; unknown outcome distinct; no tenant/secret/free text in DTO | `audit-schemas.test.ts` |
| AUDIT-002 | Strict, bounded query validation | `audit-schemas.test.ts`, `handlers.test.ts` |
| AUDIT-003 | 401 unauthenticated; read-only route | `handlers.test.ts`, `e2e/audit.spec.ts` |
| AUDIT-004 | Tenant isolation for list and detail; forged tenant/actor/role rejected; leak fails closed | `handlers.test.ts`, `e2e/audit.spec.ts` |
| AUDIT-005 | Sanitized errors; bridge 503; no silent/production mock | `handlers.test.ts` |
| AUDIT-006 | Decision semantics: accepted/conflict/denied/unknown, replay no duplicate, nothing recorded for 401/cross-tenant/invalid, actor from session, no reason text, audit failure does not alter outcome | `handlers.test.ts`, `e2e/audit.spec.ts` |
| AUDIT-007 | Filters, sort, pagination, URL state | `audit-state.test.ts`, `audit-log.test.tsx`, `e2e/audit.spec.ts` |
| AUDIT-008 | UI states, text-only rendering, detail dialog, action link | `audit-log.test.tsx`, `e2e/audit.spec.ts` |
| AUDIT-009 | HTTP adapter validation and error mapping | `audit-service.test.ts` |

Cannot be verified without a real backend: durability, immutability, atomicity, retention, bridge tenant enforcement. No accessibility tool (axe) was run.

## 8. Verification

`npm run lint`, `npm run typecheck`, `npm test`, `NEXT_PUBLIC_API_MOCKING=enabled npm run build`, `E2E_SERVER=start npx playwright test`.

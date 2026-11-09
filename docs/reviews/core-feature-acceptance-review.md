# Core Feature Acceptance Audit

**Audit date:** 2026-11-05  
**Scope:** Pending Actions Queue, Action Detail, Live Run Timeline, and Audit Log  
**Mode:** Read-only application audit. No application source files, dependencies, or secrets were changed or read.

**Module 11A follow-up:** 2026-11-09. The queue's mock-backed bulk decision and guarded keyboard-shortcut gaps have since been implemented; this follow-up does not change the bridge-integration findings below.

## Executive summary

The repository contains functional, typed UI-to-BFF paths for all four capabilities in **mock mode**. The implementations include substantial validation, loading/error/stale states, session-based BFF checks, tenant scoping, and component/API/E2E tests. The production integration is not complete: the `erp-mcp-bridge` adapters intentionally make no network calls and return unavailable errors. No bridge endpoints or behavior can be treated as verified.

**Overall acceptance: PARTIAL; not production-ready for real business operations.** In addition to the bridge blocker:

- The queue now supports mock-backed bulk approve/reject with per-item outcomes and confirmation-only A/R shortcuts. Real bridge bulk behavior remains unverified and unavailable.
- Action decisions are carefully guarded in the mock path, but the BFF's status/version pre-check is not atomic. Atomicity, idempotency, independent backend authorization, and unknown-outcome reconciliation are unverified for the bridge.
- Run event ordering, duplicate suppression, gap detection, reconnect, and snapshot refresh are implemented against fixtures. The stream and its replay are not durable and cannot demonstrate recovery after process restart.
- The audit UI has date, event-type, outcome, and summary/action-ID search, but no user/actor or system/agent filter, and no run reference. Audit writes are in-memory and not atomic with decisions.

The smallest safe path forward is to obtain and agree the real backend contracts and guarantees first. The queue gap is closed only in the mock path; preserve the fail-closed behavior until each bridge contract is verified.

## Acceptance matrix

Statuses describe the repository as audited, not a claim that mock behavior is available from the real bridge. Where an item works only with mocks, that limitation is stated explicitly.

| Feature | Requirement | Status | Evidence / qualification |
|---|---|---|---|
| Queue | Server-side pagination, filters, search, sorting | **PARTIAL** | BFF + mock backend support page, status/risk, search, and sort. Sort parameters are an unverified extension; real backend is unavailable. |
| Queue | Selection and bulk approve/reject | **COMPLETE (mock only)** | Fresh pending rows remain scoped to the current query/page. Confirmation UI calls the authenticated BFF; the bridge remains unavailable. |
| Queue | Per-item bulk results and partial-success handling | **COMPLETE (mock only)** | Strict bounded contracts return `approved`, `rejected`, `conflict`, `forbidden`, `failed`, or `outcome_unknown`; the UI displays each item independently. No batch-wide success is implied. |
| Queue | Keyboard shortcuts with accessibility safeguards | **COMPLETE (mock only)** | Visible and `aria-keyshortcuts`-exposed A/R shortcuts only open confirmation; editable targets and active dialogs are guarded. Component and Playwright coverage added. |
| Queue | Loading, empty, error, and stale states | **COMPLETE** | Explicit states and retry/stale behavior are implemented and covered in component/E2E tests for mock data. |
| Action Detail | Concise agent reasoning summary | **COMPLETE** | Displays the supplied summary separately from source evidence and explicitly does not present it as hidden reasoning. Mock data only. |
| Action Detail | Traceable source evidence | **PARTIAL** | Evidence shows source type/reference, observed time, title and optional excerpt as inert text. The application cannot verify source authenticity or resolve the reference to an authoritative source. |
| Action Detail | Before/after record diff | **COMPLETE** | Handles changed, added, removed, unchanged, absent and unknown values; rendering and unit tests exist. Mock data only. |
| Action Detail | Safe approve/reject confirmation | **COMPLETE** | Confirmation displays record version; only pending/current actions are offered; BFF checks origin, session, role, tenant, status/version and idempotency. These are application/mock guarantees only. |
| Action Detail | Conflict, stale-version, authorization, unknown-outcome handling | **PARTIAL** | UI/BFF and mock tests cover these cases. A BFF pre-check is not atomic; real backend authorization, atomic version checks, idempotency and lookup/reconciliation are unverified. |
| Run Timeline | Run list and detail | **PARTIAL** | List/detail BFF, service and UI exist for mock data; list search is local. The bridge adapter is unavailable. |
| Run Timeline | Ordered timeline | **COMPLETE** | Events are rendered and merged by sequence; snapshot remains authoritative. Verified only against mock fixtures. |
| Run Timeline | SSE connection, reconnection, replay, and recovery | **PARTIAL** | Same-origin EventSource, `Last-Event-ID`, reconnect status, and snapshot invalidation are implemented for the mock stream. No durable event log, cross-process replay, or verified bridge cursor contract exists. |
| Run Timeline | Duplicate/out-of-order handling | **COMPLETE** | Duplicate IDs/sequences are dropped and events are sorted by sequence in the client. Unit tests cover these behaviors; no real stream has been tested. |
| Run Timeline | Sequence-gap detection and authoritative snapshot reconciliation | **COMPLETE** | Gaps invalidate the run-detail query; reconnect also refreshes the snapshot. Snapshot fields are not overwritten by event payloads. Mock-only behavior. |
| Run Timeline | Approval distinct from execution completion | **COMPLETE** | UI and mock run transition explicitly distinguish approval from execution; no completion claim is inferred from approval. |
| Audit Log | Search and filters by user, system/agent, and date | **PARTIAL** | Date range, event type and outcome filters work; search matches summary/action ID only. No actor ID/type or system/agent filter exists. |
| Audit Log | Server-side pagination | **COMPLETE** | BFF/backend query supports bounded page-based pagination in mock mode. |
| Audit Log | Decision outcomes and actor metadata | **COMPLETE** | Decision event DTOs show outcome and actor type/ID; mock BFF records decisions, conflicts, denials, and unknown outcomes. |
| Audit Log | Related action/run references where supported | **PARTIAL** | Action references are displayed and linked. No `runId` is represented or joined. |
| Audit Log | Tenant isolation and read-only access | **PARTIAL** | Read-only GET routes, session permission checks, tenant scoping, defensive checks, and mock tests exist. Bridge-side enforcement is unverified. |
| Audit Log | Durable and trustworthy audit requirements documented | **PARTIAL** | Requirements and limitations are documented, but current audit records are in-memory, mutable, non-durable, and not atomic with decisions. |

### Real-backend status

The real-backend status for all four features is **BLOCKED**. `createBridgeBackend`, `createBridgeRunsBackend`, and `createBridgeAuditBackend` deliberately perform no network I/O; selectors use them when mock mode is disabled and fail closed. There is no authoritative `erp-mcp-bridge` API/protocol specification or test instance in the repository. The frontend `/api/...` paths below are this application's BFF routes, not verified bridge endpoints.

## Feature traces and findings

### 1. Pending Actions Queue

**UI-to-backend trace**

`src/app/(console)/approvals/page.tsx` → `PendingActionsQueue` / `QueueToolbar` / `QueueTable` / `SelectionBar` → query and bulk mutation hooks → `ActionsService` → `GET /api/actions` and proposed BFF `POST /api/actions/bulk-decision` → authenticated handlers → `ActionsBackend` → mock or unavailable bridge adapter.

**Existing implementation**

- URL state drives search, status/risk filters, sort, and page. The table uses manual sorting/pagination and the BFF/mock applies the query server-side.
- Selection is scoped to the current query/page, pending rows only; stale placeholder rows cannot be selected or paged. Clear selection is available.
- Initial load, empty/no-match, error/retry, refetch-error, stale and out-of-range-page states are explicit.
- Rows link to Action Detail. E2E tests verify search/filter/sort/page and selection.
- Bulk approve/reject requires explicit confirmation and returns independently checked outcomes. The batch is not transactional; selected items can produce partial success. Item keys are unique and stable per logical decision while an outcome is unknown. A successful idempotent replay does not duplicate its accepted audit event.
- A/R open confirmation only. Editable controls, modifiers, open dialogs, stale rows and empty selection do not trigger shortcuts. The browser still never supplies actor or tenant identity.
- BFF and mock tests cover partial success, permission/tenant results, stale versions, key reuse/replay, unknown outcomes and audit behavior; component and Playwright tests cover confirmation and shortcut guards.
- Sort fields (`createdAt`, `risk`) are an app-level proposed extension and are implemented by the mock. The real backend's support is unknown.

**Mock vs real:** Bulk decisions are functional in the mock BFF path only. The bridge bulk method returns unavailable and performs no network I/O; no bridge bulk endpoint, authorization, idempotency, atomicity or result semantics are claimed.

**Relevant files:** `src/app/(console)/approvals/page.tsx`; `src/features/approvals/components/`; `src/features/approvals/hooks/`; `src/features/approvals/services/`; `src/features/approvals/server/{handlers,actions-backend,mock-backend,bridge-backend}.ts`; `src/mocks/actions-list.ts`; `src/app/api/actions/route.ts`; `e2e/approvals.spec.ts`.

### 2. Action Detail

**UI-to-backend trace**

`src/app/(console)/approvals/[actionId]/page.tsx` → `ActionDetail` and its summary/evidence/diff/decision components → action query/service → `GET /api/actions/:actionId` → BFF tenant check → `ActionsBackend`. Decisions flow through the decision mutation/service to `POST /api/actions/:actionId/approve|reject` → `handleDecision` → session-derived actor and backend port. The mock path records an audit event through `AuditBackend`.

**Existing implementation**

- Summary, user-facing agent summary, evidence, and before/after diff are rendered from validated action payloads. Untrusted evidence and values are rendered as text; source references are intentionally not made clickable.
- Confirmation displays the submitted record version. UI blocks decisions for non-pending, stale/refetching, role-read-only, unavailable, or unresolved-unknown states.
- BFF enforces same-origin requests, authentication, role, tenant, bounded strict request body, idempotency-key shape, pending status and record version. `actorId` is taken from the session, not the browser.
- Mock scenarios/tests cover stale version, invalid transition, forbidden, timeout/lost response, replay and key reuse. A timeout is not blindly retried, and approval is not reported as execution.
- The BFF's status/version pre-check is explicitly non-atomic. Only the mock backend simulates atomic commit/idempotency. There is no verified bridge guarantee or decision lookup to resolve an unknown outcome. Audit write failure is logged but does not fail the decision, so the two writes can diverge.
- Source evidence is traceable as supplied metadata, not independently authenticated or verified. The UI displays an action's `tenantId`; unlike the audit DTO, the action response does not strip it. Confirm whether tenant identifiers are intended browser-visible data and minimize the DTO if not.

**Mock vs real:** Detail and decisions work in mock mode behind the BFF. In real mode the bridge adapter returns unavailable and sends nothing. UI/BFF guards do not replace the required authorization and atomicity guarantees of a real backend.

**Relevant files:** `src/features/action-details/`; `src/features/approvals/{contracts.ts,schemas/decision-request.ts,services/,server/}`; `src/app/api/actions/`; `src/features/audit/server/handlers.ts`; `e2e/action-detail.spec.ts`.

### 3. Live Run Timeline

**UI-to-backend trace**

`src/app/(console)/runs/page.tsx` and `src/app/(console)/runs/[runId]/page.tsx` → run list/detail components and query hooks → `RunsService` → `GET /api/runs`, `GET /api/runs/:runId`, and `GET /api/runs/:runId/events` → authenticated BFF handlers → `RunsBackend` → mock or unavailable bridge adapter.

**Existing implementation**

- Tenant-scoped run list and detail snapshots are available in mock mode. List search operates locally on the loaded list.
- The timeline is a semantic ordered list. Sequence ordering, duplicate suppression, gap detection and a refetch of the authoritative snapshot are implemented. Event data only updates the event history, not snapshot state/status.
- Same-origin EventSource uses cookies. The mock endpoint emits event IDs and accepts `Last-Event-ID`; the client reports connection state, relies on EventSource reconnection, and invalidates the run query on reconnect. Terminal runs stop subscribing.
- The mock stream replays fixture history and remains open with keepalives. Its cursor/replay history is in-memory/fixture-based; there is no durable replay or recovery after process restart. Handler tests check authorization and SSE response setup; unit tests cover merge/gap behavior; E2E covers a reconnect scenario. End-to-end sequence-gap recovery and durable replay are not proven.
- Approval and execution phases are labelled separately. The mock demonstrates transition to a running state after approval but explicitly says business execution is not confirmed.

**Mock vs real:** Entire run data and stream behavior are mock-only. The bridge adapter has no list/detail/event calls, and no real event names, cursor semantics, ordering, replay, or snapshot authority have been confirmed.

**Relevant files:** `src/features/runs/`; `src/app/api/runs/`; `src/app/(console)/runs/`; `src/mocks/fixtures/runs.ts`; `src/mocks/scenarios.ts`; `e2e/runs.spec.ts`.

### 4. Audit Log

**UI-to-backend trace**

`src/app/(console)/audit/page.tsx` → `AuditLog` / `AuditToolbar` / `AuditTable` / detail dialog → audit query/service → `GET /api/audit-events` and `GET /api/audit-events/:eventId` → authenticated read-only handlers → `AuditBackend` → mock or unavailable bridge adapter. `handleDecision` writes allow-listed decision events to `AuditBackend` in mock mode.

**Existing implementation**

- Query supports server-side page, time sort, event type, outcome, action ID, UTC date range and search. Search is limited to summary and action ID. Actor/system/agent filtering is absent.
- The UI displays actor type/ID, outcome and action references; the read-only route exposes GET only. Tenant IDs are kept in internal records, stripped from browser DTOs, and enforced by BFF checks.
- Decision events use a strict allow-list and omit decision-reason text. Mock tests cover actor attribution, event filtering, tenant isolation, read-only routes, redaction, idempotent replay, unknown outcomes and failure behavior.
- `runId` is absent from the audit model, so related-run navigation is unavailable.
- Audit store is in-memory and mutable. It is not durable, append-only/tamper-resistant, replicated, or atomic with action changes. An audit failure does not alter a decision response. Audit events only capture the decision workflow, not a general durable record of all relevant system/user/agent activity.
- Existing roles both have `audit:view`; the 403 path is not exercised by current roles. The real bridge adapter returns `503 audit_unavailable`.

**Mock vs real:** Read and decision-generated audit events are functional in mock mode only. No bridge audit endpoint, persistence, retention, integrity, ordering, tenant enforcement, or atomic decision/audit guarantee is verified.

**Relevant files:** `src/features/audit/`; `src/app/api/audit-events/`; `src/app/(console)/audit/`; `src/mocks/audit-store.ts`; `src/features/approvals/server/handlers.ts`; `e2e/audit.spec.ts`.

## Security and data-integrity assessment

### Implemented protections (mock/BFF boundary)

- Protected pages and API handlers resolve a session; BFF handlers independently enforce permissions rather than relying only on page guards.
- Client-supplied actor/tenant/role claims are rejected for decision requests. Action/run/audit records are scoped to session tenants; cross-tenant details are concealed with not-found behavior or fail closed on a list leak.
- Decision posts validate origin, content type, bounded body, strict schemas and idempotency-key shape. UI and BFF do not automatically retry uncertain business decisions.
- Audit DTOs drop tenant IDs and free-form decision reasons; audit routes are read-only.
- External display strings are treated as text. Run event schemas are strict and allow-list payload fields.

### Remaining risks/blockers

1. **Backend authorization and tenant enforcement:** mandatory but unverified. BFF enforcement cannot compensate for a backend that trusts an untrusted caller or actor claim.
2. **Atomic decision correctness:** the BFF status/version check is a pre-check; the real backend must atomically validate status/version and commit. Real idempotency, key-reuse behavior and replay are unknown.
3. **Unknown decision outcomes:** the client blocks unsafe resubmission, but a durable authoritative lookup/reconciliation path is not available. The bridge contract must define this before enabling real decisions.
4. **Audit integrity:** action transition and audit write are separate; an audit failure can leave no event for a committed decision. In-memory records are lost on restart and can be altered/reset; no durable append-only store or retention controls exist.
5. **SSE consistency:** real event ID/sequence, replay cursor, retention, gap detection and snapshot reconciliation semantics are unknown. EventSource reconnect alone is not durable recovery.
6. **Audit search/traceability:** actor and system/agent filters are absent; audit events cannot reference runs.
7. **Bulk decisions:** the mock path now defines per-item keys, authorization/version checks, partial outcomes and audit behavior. Real bulk operations remain blocked on verified bridge authorization, atomic transitions, idempotency/replay, unknown-outcome reconciliation and audit guarantees.
8. **Operational controls:** process-local rate limiting and in-memory mock state are not distributed production guarantees, as also documented in the production-readiness guide.

No exploitable vulnerability is asserted by this functional acceptance audit. The auth and security tests are useful application-level evidence, not a penetration test or a substitute for backend guarantees.

## Test coverage and verification

### Existing acceptance evidence

- Queue: `src/features/approvals/components/*test.tsx`, `src/features/approvals/utils/queue-state.test.ts`, `src/features/approvals/utils/queue-shortcuts.test.ts`, `src/features/approvals/schemas/bulk-decision.test.ts`, `src/mocks/actions-list.test.ts`, `e2e/approvals.spec.ts`. Module 11A adds handler/service/schema coverage for per-item outcomes, partial success, tenant/permission/version checks, idempotency, unknown outcomes and audit; component and Playwright coverage includes confirmation and shortcut guards.
- Action Detail/decisions: `src/features/action-details/components/action-detail.test.tsx`, `src/features/action-details/utils/*test.ts`, `src/features/approvals/services/actions-service*.test.ts`, `src/features/approvals/server/handlers.test.ts`, `e2e/action-detail.spec.ts`.
- Runs: `src/features/runs/schemas/run.test.ts`, `src/features/runs/utils/run-events.test.ts`, `src/features/runs/services/run-service.test.ts`, `src/features/runs/server/handlers.test.ts`, `e2e/runs.spec.ts`. Unit ordering/gap tests exist. The service test validates event parsing/cleanup, not a complete real reconnect/replay cycle.
- Audit: `src/features/audit/schemas/audit-schemas.test.ts`, `src/features/audit/utils/audit-state.test.ts`, `src/features/audit/services/audit-service.test.ts`, `src/features/audit/server/handlers.test.ts`, `src/features/audit/components/audit-log.test.tsx`, `e2e/audit.spec.ts`. No test verifies actor/system/agent filtering because those filters do not exist; no persistence or atomicity test can pass against the in-memory implementation.

### Checks run for this audit

| Command | Result |
|---|---|
| `npm.cmd test` | **PASS** — 35 test files, 307 tests. Vitest emitted a non-failing warning about `configLoader: 'native'`. |
| `npm.cmd run lint` | **PASS** |
| `npx.cmd tsc --noEmit` | **PASS** |
| Playwright E2E | **NOT RUN** — running Next.js/E2E could load `.env.local`, which was explicitly out of scope. Existing E2E files were inspected, not executed. |
| Next build / `next typegen` | **NOT RUN** — not required for this audit and intentionally avoided to respect the no-secret-read constraint. |
| Bridge contract/integration tests | **BLOCKED** — no authoritative contract or backend test environment was present in the repository. |

The successful local checks validate the current code and mock tests only. They do not prove bridge compatibility, durability, distributed concurrency, or production authorization.

## Prioritized implementation backlog

### P0 — Resolve integration contracts before enabling a real backend

Obtain authoritative bridge source/specification and a test environment. Confirm authentication, trusted actor and tenant propagation, action/run/audit operations, schemas, pagination/sort support, conflict/error codes, idempotency, atomic record-version transition, unknown-outcome lookup, audit durability/atomicity, and SSE event IDs/order/replay/reconciliation. Keep adapters unavailable until verified.

### P1 — Close correctness and auditability dependencies

Agree the durable audit and decision boundary: persist audit events durably and append-only, define atomic/outbox semantics with decisions, and provide an authoritative way to reconcile a decision after an unknown outcome. Add tests against a contract-faithful backend, including tenant isolation, races, retries, and audit-write failure.

### P2 — Complete the queue acceptance contract

Implement bulk approve/reject only after defining per-item authorization, version, idempotency, failure, and audit behavior. Return and render per-item results; preserve partial successes without implying all-or-nothing. Add keyboard shortcuts only with documented discoverability, focus/input guards, confirmation, and accessibility tests. Keep current per-page selection scoping and stale-data protections.

### P3 — Complete audit and run acceptance details

Add actor/user and system/agent query filters once the model and authorized fields are agreed; add run references when a trusted relationship exists. For runs, verify real SSE cursor/replay and snapshot contracts, then add integration tests for reconnect, sequence gaps, out-of-order/duplicate delivery, replay expiry, and process restart. Do not equate approval with execution completion.

### P4 — Production acceptance

Run the complete checks, production build and Playwright acceptance suite in a controlled environment that does not expose local secrets; add automated accessibility checks and backend integration/security tests. Review deployment persistence, multi-instance coordination, rate limiting, retention, monitoring and incident recovery.

## Dependencies and blockers

- **Primary blocker:** no verified `erp-mcp-bridge` repository/API/protocol contract or test instance. The inventory is in `docs/integrations/erp-mcp-bridge-contract.md`.
- Decision work depends on verified backend auth/tenant enforcement, atomic version/status transitions, idempotency/replay, and unknown-outcome reconciliation.
- Bulk work depends on a per-item result contract and clear partial-success/audit semantics.
- Run recovery depends on event cursor/replay retention and authoritative snapshot guarantees.
- Audit acceptance depends on persistent, trustworthy storage, retention/integrity guarantees, actor/system filter semantics, and any run-to-action relation.
- Current test success depends on deterministic mock fixtures and does not remove any of these blockers.

## Recommended smallest safe sequence

1. **Contract first:** verify the backend's auth, tenant, decision, idempotency, run/SSE and audit guarantees; update the bridge inventory without inventing endpoints.
2. **Decision/audit integrity:** wire only the documented single-item operation, atomic version checks/idempotency and unknown-outcome reconciliation; establish durable audit semantics and backend authorization before enabling real decisions.
3. **Queue completion:** mock-backed per-item bulk behavior and guarded keyboard shortcuts are implemented in Module 11A. Keep real decisions disabled until the documented bridge contract is verified.
4. **Run recovery:** implement the documented replay/cursor and snapshot reconciliation contract; retain the semantic ordered-list UI unless graph visualization adds verified value.
5. **Audit completion and production verification:** add supported actor/system filters and run references, then run backend-backed acceptance, E2E, accessibility and deployment checks.

This sequence preserves the working mock workflows and existing service/backend boundaries. It does not require rewriting the UI or selecting undocumented bridge routes.

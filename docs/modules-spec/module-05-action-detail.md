# Module 5 — Action Detail View & Safe Approve/Reject Workflow

## Purpose
Read-only action detail (summary, agent summary, evidence, before/after diff) plus a single-item approve/reject workflow **backed by MSW only**. Out of scope: bulk decisions, SSE, real ERP execution, audit UI, an authentication rewrite.

## Confirmed vs proposed

| Item | Status |
|---|---|
| `PendingAction`, `RecordChange`, `Evidence`, `ActionDecisionRequest`, `DecisionResult`, `ApiErrorResponse` schemas | **Confirmed** in `contracts.ts` (internal frontend contract; not verified against `erp-mcp-bridge`) |
| `GET /api/actions/:id`, `POST /api/actions/:id/approve\|reject` | **Proposed** in `product-architecture.md`; implemented by MSW only |
| 404 → not-found on detail/decision endpoints | **Proposed** |
| 409 + `version_conflict` / `invalid_transition` | **Proposed, MSW-only**; a 409 with any other code is NOT treated as a conflict |
| Browser decision DTO `{decision, reason?, recordVersion}` (no `actorId`) | **Proposed** (`schemas/decision-request.ts`) |
| Decision timeout (15 s) and "5xx / unreadable 2xx = unknown outcome" | **Frontend policy**, not a backend guarantee |
| `recordVersion` compare-and-commit, status check, atomicity | **Modelled in MSW only**; unverified for the real backend |
| Idempotency, ETag, audit persistence, authorization | **Not in the contract**; not implemented, not claimed |

## Authentication and actor identity
- `ActionDecisionRequest.actorId` is required by `contracts.ts`, but a browser-supplied id is not a trusted identity. **Mismatch documented; `contracts.ts` untouched.**
- **Proposed minimal correction:** make `actorId` server-derived — drop it from the browser-facing request and have a trusted server boundary (Next.js Route Handler/BFF, using the Auth.js session) build the backend command `ActionDecisionRequest` with the actor from the session. The backend must authorize independently.
- Three shapes are kept distinct: browser DTO (`BrowserDecisionRequest`, strict, no actor) → server-side authenticated command (`ActionDecisionRequest`, does not exist yet; MSW builds it with an isolated test identity `MOCK_ACTOR_ID` in `src/mocks/action-store.ts`) → backend API DTO (unknown).
- **Superseded by Module 6** (`module-06-auth-authorization.md`): Auth.js and a server-side BFF now exist (`src/app/api/actions/**`), the actor is taken from the session, and the MSW browser worker was removed (the mock now runs server-side, mock mode only). `decisionsEnabled` is only a UI hint; the BFF returns `503 decisions_unavailable` when no verified backend exists. Real decisions remain unavailable.
- Historical (Module 5): Auth.js was not wired up and no BFF existed, so `decisionsEnabled` was true only when the build flag `NEXT_PUBLIC_API_MOCKING=enabled` was set. The flag must never be set in a real deployment.

## Concurrency and unknown outcomes
- The decision sends the `recordVersion` currently displayed; the confirmation dialog shows the same value. Decisions are blocked while the detail is refetching or its last refetch failed (stale).
- UI duplicate-submit prevention (`inFlightRef` + disabled controls) is not idempotency.
- Definite failures (4xx): conflict, not-found, other http (e.g. 403 shown as "not authorized"). The reason text is preserved. Detail and lists are refetched on conflict.
- Unknown outcome (connection failure/timeout, 5xx, unreadable or mismatching 2xx): never auto-retried. The action is re-read. If it now shows another version, a reconciliation note is shown. If it still shows the same status and version, resubmission stays **disabled** (one successful GET does not prove nothing was committed) and the user is directed to the audit history/administrator. No in-product recovery path exists yet.
- Approve is reported as `approved`; execution is never claimed.

## Acceptance criteria and tests
Unit/component/integration: Vitest. E2E: Playwright (`e2e/action-detail.spec.ts`).

| ID | Criterion | Tests |
|---|---|---|
| ACTION-DETAIL-001 | Service validates detail payloads; maps network/http/malformed/not-found | `actions-service-detail.test.ts` (getAction) |
| ACTION-DETAIL-002 | Summary shows id, status, risk, agent, target, version, timestamps | `action-detail.test.tsx` (rendering); E2E "opens from the queue…" |
| ACTION-DETAIL-003 | Agent summary labelled, separate from evidence; no chain-of-thought | `action-detail.test.tsx` (rendering) |
| ACTION-DETAIL-004 | Evidence rendered as inert text; empty state | `action-detail.test.tsx` (hostile, empty) |
| ACTION-DETAIL-005 | Diff distinguishes changed/added/removed/unchanged/null/absent | `diff.test.ts`; `action-detail.test.tsx` (every diff kind) |
| ACTION-DETAIL-006 | Loading, not-found, error+retry, malformed, stale-refresh states | `action-detail.test.tsx`; E2E not-found |
| ACTION-DETAIL-007 | Obsolete requests abort; query key `approvalKeys.detail(id)` | `actions-service-detail.test.ts` (abort) |
| ACTION-DETAIL-008 | Navigation back to the queue | `action-detail.test.tsx`; E2E |
| DECISION-001 | Controls only for pending (and when enabled); reason shown otherwise | `decision-eligibility.test.ts`; `action-detail.test.tsx`; E2E non-pending |
| DECISION-002 | Keyboard-operable confirmation; cancel sends nothing | `action-detail.test.tsx` |
| DECISION-003 | Displayed version = submitted version; no actor in browser DTO; no duplicate submit | `actions-service-detail.test.ts`; `action-detail.test.tsx` (version, duplicate) |
| DECISION-004 | Approve reported as approved, not executed; reject reported | `action-detail.test.tsx`; E2E approve |
| DECISION-005 | 409 conflict / invalid transition handled, no false success, reason preserved | service + component tests; E2E conflict |
| DECISION-006 | Unknown outcome: no auto-retry, reconcile, ambiguous stays blocked | service (timeout, lost response) + component tests; E2E |
| DECISION-007 | Detail and list caches invalidated only after confirmed success; queue shows new status | `action-detail.test.tsx` (cache); E2E approve → back |
| DECISION-008 | Decisions unavailable without the mocking flag; no silent mock fallback; actorId rejected by strict DTO | `actions-service-detail.test.ts`; `action-detail.test.tsx` |

## Mock-only behaviour (not the real `erp-mcp-bridge`)
`src/mocks/action-store.ts` (state overlay + decision log), `handlers/action-details.ts` (scenarios: ok/delay, conflict, invalid-transition, forbidden, server-error, malformed, network-error, lost-response; detail: ok/delay, server-error, malformed, not-found), `fixtures/action-details.ts` (detail-only enrichment of `act_0001`–`act_0003`). Tests reset scenarios and state in `afterEach`. Mock behaviour does not prove any production guarantee.

## Remaining backend integration blockers
1. Trusted server-side identity boundary (Auth.js session + BFF) and backend authorization.
2. Confirmed detail/decision endpoints and error/conflict codes (404/409 semantics, `version_conflict`, `invalid_transition`).
3. Backend-verified atomic version/status check, plus an idempotency key or other duplicate-decision protection.
4. A way to confirm the outcome of an uncertain decision (decision/audit lookup by request id).
5. Eligibility/permission field (today only `status === "pending"` is a hint).
6. Queue filters are not preserved by the "Back" link (it goes to `/approvals`).

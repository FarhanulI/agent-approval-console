# Module 8 — Backend Integration & Functional End-to-End Workflow

Status: **functional mock-backed workflow verified; real `erp-mcp-bridge` integration blocked by the missing verified contract.**

## Scope and boundary

The browser continues to use the existing path:

`UI → typed HTTP service → Next.js Route Handler (BFF) → backend port → mock or bridge adapter`

Module 8 does not add bridge calls, new endpoints, dependencies, persistence, execution, or changes to Modules 4–7 contracts. In mock mode, the BFF uses the in-memory server-side `ActionsBackend` and `AuditBackend`. In bridge mode, both adapters remain unavailable and do not fall back to mock data.

## Mock workflow

| Step | Existing implementation | Verification |
|---|---|---|
| Queue list, search, filters, sort and pagination | `useActionsQuery` → `ActionsService` → `/api/actions` → `ActionsBackend` → deterministic fixtures/list logic | `e2e/approvals.spec.ts`; `src/features/approvals/server/handlers.test.ts` |
| Action detail, summary, evidence and before/after diff | Typed detail request and Zod validation, BFF tenant check, detail fixtures | `e2e/action-detail.spec.ts`; action detail component/service tests |
| Approve/reject pending action | Session-derived actor, role/tenant checks, status/version validation, stable mock idempotency lookup, mock state transition | `e2e/action-detail.spec.ts`; `src/features/approvals/server/handlers.test.ts` |
| Decision result | Server result drives the UI; approval is not reported as execution | `e2e/action-detail.spec.ts`; `e2e/audit.spec.ts` |
| Decision audit event | The BFF records an allow-listed event in the in-memory mock audit store; audit read/list API returns tenant-scoped DTOs | `e2e/audit.spec.ts`; `src/features/audit/server/handlers.test.ts` |
| Queue/detail reconciliation | Successful decisions invalidate action detail and queue lists; conflict and unknown outcomes re-read action state | `e2e/action-detail.spec.ts` |
| Audit reconciliation | Successful decisions, conflicts, unknown outcomes and 403 denials invalidate cached audit lists when they may have written an event | `e2e/audit.spec.ts` — “refreshes a cached audit query after a decision” |

Audit recording and the decision transition are **not atomic**. The stores are in memory, are lost on process restart, and do not establish durability or immutability. If mock audit recording fails, the decision result is preserved and the failure is logged. Mock idempotency and the synchronous state transition are simulations, not guarantees about a distributed backend.

## Error and safety behavior

- The BFF rejects unauthenticated, unauthorized, cross-tenant, invalid-origin, invalid-body and stale/invalid-transition requests.
- The actor is derived from the session; browser identity and tenant fields are not trusted.
- Conflicts and ambiguous outcomes do not show success. Decisions are not automatically retried; unknown outcomes keep resubmission blocked until the action is reconciled.
- The UI reports an approval, not execution.
- API errors are sanitized; no upstream stack trace or secret is returned to the browser.

These are application/mock-path behaviors. They do not prove that the real bridge independently authorizes, scopes tenants, deduplicates, atomically checks record versions, or persists audit events.

## Real backend status

The contract inventory is [erp-mcp-bridge-contract.md](../integrations/erp-mcp-bridge-contract.md). No authoritative bridge source or specification was available. Authentication, identity/tenant propagation, action reads, decision semantics, idempotency, unknown-outcome reconciliation, audit, and error mapping remain **unverified**. No real operation is enabled.

To proceed with a real adapter, supply the actual bridge repository or API/protocol specification, its authentication and trusted actor/tenant rules, action and decision request/response contracts, idempotency and reconciliation semantics, audit contract, error mapping, and a legitimate test environment. Do not select an unrelated public repository based only on its name.

## Acceptance criteria and test mapping

| ID | Criterion | Evidence |
|---|---|---|
| BRIDGE-CONTRACT-001 | Track authoritative contract sources without inventing support | Contract inventory; current result: blocked |
| BRIDGE-AUTH-001 | Keep real bridge authentication and actor propagation verified | No bridge adapter sends credentials; blocked |
| BRIDGE-ACTIONS-001 | Real action list/detail contract | Bridge adapter remains unavailable; blocked |
| BRIDGE-DECISION-001 | Real decision and atomic status/version semantics | Bridge adapter remains unavailable; blocked |
| BRIDGE-IDEMPOTENCY-001 | Real backend idempotency and replay semantics | Unverified; mock behavior is covered in handler tests |
| BRIDGE-AUDIT-001 | Real audit reads, durability and decision atomicity | Bridge audit remains unavailable; mock audit behavior is covered in audit handler and E2E tests |
| BRIDGE-TENANT-001 | Enforce tenant scope in the real backend | Unverified; mock/BFF isolation is covered in handler and E2E tests |
| BRIDGE-ERRORS-001 | Normalize documented upstream errors | No documented upstream errors; blocked |
| BRIDGE-NO-FALLBACK-001 | Never use mock data as fallback for bridge mode | `src/features/approvals/server/handlers.test.ts`; backend selector and mock-mode tests |
| BRIDGE-TESTS-001 | Verify the mock-backed user workflow end-to-end | `e2e/action-detail.spec.ts`, `e2e/audit.spec.ts`, `e2e/approvals.spec.ts`; full Playwright suite on production build |

## Verification record

On 2026-11-05, the production build and complete Playwright suite were run with the mock mode explicitly enabled for the E2E environment:

- `npm test` — 24 files, 259 tests passed.
- `npm run lint` — passed.
- `npm run typecheck` — passed (`next typegen` and `tsc --noEmit`).
- `NEXT_PUBLIC_API_MOCKING=enabled npm run build` — passed after retrying the Next.js security reminder. The installed Next.js version displayed a security upgrade warning.
- `E2E_SERVER=start npx playwright test e2e/audit.spec.ts --reporter=line` — 11 passed.
- `E2E_SERVER=start npx playwright test --reporter=line` — 44 passed.

The earlier development-server E2E run was unstable (32/43 passed; on rerun, 32/39 passed). All tests passed against the production build. This confirms the local mock-backed workflow only; it is not a real bridge integration or a durability/atomicity guarantee.

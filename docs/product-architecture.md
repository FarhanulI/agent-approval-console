# Agent Approval Console — Project Core Context

## Project identity
- Repository: `agent-approval-console`
- Product: A human-supervision console for AI agent actions.
- Primary question: What did the agent do, what does it want to do next, why, and should a human allow it?
- This is a supervision UI, not the AI agent or ERP execution engine itself.
- Backend integration target: `erp-mcp-bridge`.
- Initial development mode: MSW mock APIs; later switch to the real backend through a stable service/API contract.

## Required stack
- Next.js App Router
- TypeScript (strict)
- Tailwind CSS
- TanStack Query
- TanStack Table
- React Flow (`@xyflow/react`) where graph visualization adds value; a step list is acceptable for the first version
- Auth.js
- Mock Service Worker (MSW)
- Playwright
- Zod for runtime validation
- React Hook Form only where useful for complex forms

## Required product modules
1. Pending Actions Queue: server-side pagination, filters, sorting, search, row selection, bulk approve/reject, keyboard shortcuts.
2. Action Detail: agent reasoning summary, source evidence, before/after record diff, risk, target record, approval/rejection confirmation.
3. Live Run Timeline: run state, ordered events, SSE streaming, reconnect/replay behavior and connection status.
4. Audit Log: searchable and filterable by actor/user, system, event type, outcome, resource and date.
5. Authentication & Authorization: protected pages, session handling, roles/permissions and tenant boundaries.
6. Integration readiness: same frontend service interface for MSW and real HTTP API; no assumptions about undocumented `erp-mcp-bridge` endpoints.
7. Testing & production readiness: unit/component/API/E2E tests, accessibility, error handling, security checks, CI and monitoring.

## Architecture principles
- Keep `src/app` focused on routes, layouts and composition.
- Keep business features in `src/features/<feature>`.
- Keep reusable visual primitives in `src/components/ui`.
- Keep API communication in typed services/adapters, not scattered across components.
- Use TanStack Query for server state; avoid unnecessary global state management.
- Validate external API payloads at runtime with Zod.
- Separate domain models from API DTOs and map DTOs in service/adapters.
- Keep loading, empty, stale, error, partial-success and reconnecting states explicit.
- Use server components by default; use client components only for interactivity.
- Keep secrets server-side; never expose credentials via `NEXT_PUBLIC_*`.
- Mock APIs must cover success, empty, timeout, validation error, unauthorized, forbidden, conflict and partial bulk failure.
- Do not claim compatibility with a backend endpoint until its contract is confirmed.

## Approval lifecycle (initial model)
`pending -> approved | rejected | expired | cancelled`
`approved -> executing | conflict`
`executing -> executed | failed`
Backend contract may require additional states. Approval and execution are separate: approved does not mean execution succeeded.

## Core domain concepts
- PendingAction: proposal, status, risk, target record, changes, evidence, record version, timestamps and associated run.
- AgentRun: execution ID, status, start/end timestamps and associated actions.
- Evidence: source reference, source type, excerpt if allowed, and observed timestamp.
- RecordChange: field, label, before value and proposed after value.
- AuditEvent: actor, event type, resource, outcome, timestamp and request/correlation ID.
- Keep agent reasoning as a concise user-facing summary; do not expose hidden chain-of-thought.

## Proposed frontend API contract (must be reconciled with backend)
- `GET /api/actions`
- `GET /api/actions/:id`
- `POST /api/actions/:id/approve`
- `POST /api/actions/:id/reject`
- `POST /api/actions/bulk-decision`
- `GET /api/runs/:id`
- `GET /api/runs/:id/events` (SSE)
- `GET /api/audit-events`

These are proposed frontend contracts, not claims about existing bridge endpoints.

## Security and correctness requirements
- Backend must authorize every sensitive operation; disabled buttons and frontend route guards are not security boundaries.
- Derive tenant and actor identity from trusted server-side session/credentials, not client-supplied tenant IDs.
- Validate action status, policy, permissions and record version at decision time.
- Use optimistic concurrency/version checks to prevent approval of stale proposals.
- Make decision/execution retries safe using backend-supported idempotency and atomic state transitions.
- Bulk decisions must report per-item success/failure; never assume all-or-nothing unless backend guarantees it.
- Treat SSE as transport, not the source of truth. Support event IDs/order, duplicate handling, reconnect/replay and reconciliation with authoritative run state.
- Native `EventSource` cannot set arbitrary Authorization headers; choose cookie-authenticated same-origin streaming, authenticated BFF streaming or a fetch-based SSE client. Never put access tokens in URL query strings.
- Keep durable audit events server-side; redact secrets and unnecessary sensitive data.
- A timeout does not prove that a business operation failed; reconcile status before retrying execution.

## Suggested folder structure
```text
src/
  app/
    (auth)/login/page.tsx
    (console)/layout.tsx
    (console)/approvals/page.tsx
    (console)/approvals/[actionId]/page.tsx
    (console)/runs/[runId]/page.tsx
    (console)/audit/page.tsx
    api/auth/[...nextauth]/route.ts
    layout.tsx
    providers.tsx
  components/
    ui/
    layout/
    feedback/
  features/
    approvals/{components,hooks,services,schemas,utils,types.ts}
    action-details/
    runs/
    audit/
    authentication/
  lib/{api,auth,config,utils}/
  mocks/{handlers,fixtures}/
  test/
e2e/
```
Create folders when needed rather than creating many empty folders at the start.

## Implementation sequence
1. Foundation: inspect repo, configure Next.js/TypeScript/Tailwind/scripts, domain types, Zod schemas, service interface, MSW and shell.
2. Vertical slice: queue -> detail -> approve/reject -> mock execution result -> audit entry.
3. Queue improvements: server pagination, filters, bulk decisions and keyboard support.
4. Run monitoring: timeline first, then React Flow if needed; SSE with reconnect/replay.
5. Audit search/filter and details.
6. Auth.js session plus server-side/backend authorization contract.
7. Integrate `erp-mcp-bridge` through the real adapter after its API/auth/SSE contract is documented.
8. Playwright, accessibility, security, CI and deployment readiness.

## Engineering workflow
- Work one module or vertical slice at a time.
- Before changes, inspect existing files and preserve established conventions.
- Prefer minimal, reviewable changes over broad rewrites.
- Run lint, type-check and relevant tests after each module.
- Report exactly what was changed, which checks were actually run, failures, assumptions and follow-up work.
- Do not claim tests passed unless executed.
- Ask one focused question only when an essential decision blocks progress; otherwise state a reasonable assumption and continue.

# Module 9 — Live Run Timeline

Status: implemented for the **mock backend**. The `erp-mcp-bridge` run and event-stream contract remains **unverified and unavailable**.

## Scope and boundary

The browser uses the existing application layering:

`Run UI → RunsService → authenticated Route Handler → RunsBackend → mock or unavailable bridge adapter`

The Live Runs pages show tenant-scoped run summaries, snapshot details, ordered steps and events, run outcomes, and links to the existing Action Detail workflow. The timeline does not add another approval mechanism. Approval and execution remain separate; approving the linked action only moves the mock run into a subsequent execution state and does not claim that a business change was performed.

The feature reuses `runStatusSchema` and `AgentIdentity` from `features/approvals/contracts.ts`. Run-specific step/event schemas are isolated in `features/runs/schemas/run.ts`; the approval lifecycle contract is unchanged. The existing `waiting` run status is presented as “Waiting for approval” when the current snapshot identifies a pending linked action.

## Domain and event schemas

| Model | Purpose |
|---|---|
| `RunSummary` | Run ID, status, concise summary, linked action IDs, start/completion time, current step and agent identity. |
| `RunDetail` | Run summary plus ordered `RunStep` and `RunEvent` arrays, with optional result/error summaries. |
| `RunStep` | Safe step title/description, status, timestamps/duration, optional related action ID and concise error summary. |
| `RunEvent` | Event ID, run ID, positive sequence, application-level event type, timestamp, optional step ID and a strict allow-listed payload. |

Supported application-level event types are `run.started`, `step.started`, `step.completed`, `step.failed`, `approval.required`, `approval.resolved`, `run.completed`, `run.failed`, and `run.cancelled`. These are **mock application event types**, not verified bridge event names. Event payloads reject unknown fields, so access tokens, credentials and arbitrary backend metadata are not passed to the timeline.

`canTransitionRunStatus` documents the accepted lifecycle edges for the existing run status enum. Repeated state is allowed; completed, failed, cancelled and rejected states are terminal.

## API contract

These are application/BFF routes only:

- `GET /api/runs` — tenant-scoped `{ items: RunSummary[] }`.
- `GET /api/runs/:runId` — tenant-scoped `{ run: RunDetail }`.
- `GET /api/runs/:runId/events` — cookie-authenticated mock SSE, with `run-event` messages, event IDs, and `Last-Event-ID` continuation.

Every route checks the session and `run:view`; the backend scopes by session tenant IDs, and the BFF checks tenant scope again before returning data. Missing and cross-tenant run details share a 404 response. Tenant IDs are internal backend fields and are not included in browser DTOs. Responses are not cached.

The run HTTP service validates JSON snapshots and SSE event data with Zod. UI components do not issue API requests directly. The bridge adapter returns a sanitized `503 runs_unavailable` and performs no network request or mock fallback.

## Mock event transport

Fixtures cover running, waiting-for-approval, completed, failed and cancelled runs. A mock SSE connection emits the fixture's ordered events, includes sequence/event IDs, and sends keepalives while the client remains subscribed. The browser uses the same service subscription interface intended for a later SSE adapter. Native `EventSource` uses same-origin session cookies; cleanup closes the source when the run changes or the view unmounts.

Development/test mock controls include empty and server-error reads, malformed payloads, delayed events, duplicate events, out-of-order events, and a one-time disconnect. The disconnect scenario exercises EventSource reconnection; on a subsequent connection the UI refetches the authoritative run snapshot. When an approval decision changes the linked mock action, a fresh run snapshot exposes `approval.resolved` and either a running execution phase or a rejected terminal state.

## Ordering and recovery

- Events are ordered by `sequence`, not timestamps.
- The client drops duplicate event IDs and duplicate sequence numbers.
- A sequence gap triggers a fresh snapshot query.
- Event messages update the visible event history only; they do not overwrite run status or summary fields.
- EventSource reconnection triggers snapshot reconciliation. `Last-Event-ID` allows the mock adapter to continue after the last known event when that ID is still in the fixture history.
- The run snapshot is authoritative. The mock store is in-memory and does not provide durable replay, exactly-once delivery, or recovery after process restart.

## Approval integration

The waiting run highlights the pending approval and links to the authorized Action Detail page only for a valid action ID. Approve/reject remains in the existing action workflow. Returning to the run refetches its snapshot. An approved action yields a run in a subsequent `running` phase and explicitly states that business execution has not been confirmed. A rejected action stops before execution.

## UI states

The list and detail views handle initial loading, empty results, no search matches, request errors with retry, stale snapshots, not-found runs, reconnecting/disconnected/connected transport states, waiting approval, and completed/failed/cancelled outcomes. The timeline is a semantic ordered list, and connection status is announced with a polite status region. The list search is local to the already tenant-scoped page of mock results.

## Tests

- `schemas/run.test.ts` — valid fixtures, invalid status/sequence, strict payload and unknown-field rejection.
- `utils/run-events.test.ts` — ordering, duplicate IDs/sequences, gap detection and lifecycle transitions.
- `services/run-service.test.ts` — response validation, ID encoding, HTTP error mapping, SSE event validation and cleanup.
- `server/handlers.test.ts` — authentication, tenant isolation, response redaction, mock failure, bridge-unavailable behavior, approval reconciliation and SSE route authorization.
- `e2e/runs.spec.ts` — list/search, live timeline, approval navigation and reconciliation, terminal outcomes, empty/error and reconnect scenarios.

Run the repository checks using the commands in `CLAUDE.md`. Results should be reported from the actual execution environment; the mock tests do not establish bridge compatibility or durability.

## Limitations and real SSE prerequisites

Run fixtures and decisions are in-memory and reset on process restart. The UI currently has no server-side run filters or pagination. The mock stream replays fixture history and keeps a connection open; it is not a production event broker or durable event log.

Before enabling a real adapter, obtain the authoritative bridge contract for run list/detail operations, authentication and tenant enforcement, event transport, event IDs/order, cursor/replay and reconnect semantics, lifecycle mapping, error behavior, and whether event snapshots are authoritative. Do not infer endpoint paths or payload compatibility from this mock contract.

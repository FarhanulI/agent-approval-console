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

Development/test mock controls include empty and server-error reads, malformed payloads, delayed events, duplicate/out-of-order/late events, sequence gaps, one-time disconnects, expired cursors, unavailable history, process-restart simulations, completion during a disconnect, and snapshot recovery failures. Recovery controls are available only through the authenticated mock-control route and are simulations, not bridge guarantees.

## Ordering and recovery

- Events are ordered by the contract's positive integer `sequence`, never by timestamps or assumptions about event ID ordering.
- Event ingestion is scoped to the run and idempotent by event ID and sequence. A fresh subscription carries the last accepted opaque cursor; native EventSource reconnects continue to use `Last-Event-ID`.
- An unknown/expired cursor produces an explicit `run-recovery` control event instead of silently replaying from the beginning. The client closes that source, validates and reconciles a fresh run snapshot, then resumes from the snapshot's last known event cursor when replay is available.
- A sequence gap triggers snapshot reconciliation. Known events from the local timeline and the snapshot are merged and deduplicated; missing history is never fabricated. If a gap remains, the UI reports incomplete recovery. A later event can fill the gap.
- Event messages update timeline history only; they do not overwrite run status or summary fields. The snapshot is authoritative, and illegal/stale lifecycle transitions cannot regress a cached terminal run.
- The mock stream's retry delay is 250 ms and a subscription stops after five reconnect errors. Retry creates a fresh subscription only after snapshot reconciliation. Cleanup closes the EventSource and aborts in-flight snapshot reads.
- The mock store is in-memory and does not provide durable replay, exactly-once delivery, or real process-restart recovery. Mock restart scenarios model interruption and replay availability only.

## Approval integration

The waiting run highlights the pending approval and links to the authorized Action Detail page only for a valid action ID. Approve/reject remains in the existing action workflow. Returning to the run refetches its snapshot. An approved action yields a run in a subsequent `running` phase and explicitly states that business execution has not been confirmed. A rejected action stops before execution.

## UI states

The list and detail views handle initial loading, empty results, no search matches, request errors with retry, stale snapshots, not-found runs, connected/reconnecting/recovering/recovery-incomplete/history-unavailable/disconnected states, waiting approval, and completed/failed/cancelled outcomes. Snapshot failures and unavailable history retain the known run state and expose a retry path; timeline completeness is not implied by a successful snapshot. The timeline is a semantic ordered list, and connection status is announced with a polite status region. The list search is local to the already tenant-scoped page of mock results.

## Tests

- `schemas/run.test.ts` — fixture and event/run association validation, invalid status/sequence, strict payload and recovery-control validation.
- `utils/run-events.test.ts` — run-scoped ordering, duplicate IDs/sequences, gap fill, snapshot reconciliation, terminal status protection and lifecycle transitions.
- `services/run-service.test.ts` — snapshot validation/deduplication, cursor handoff, bounded reconnect attempts, SSE event/control validation and cleanup.
- `server/handlers.test.ts` — authentication, tenant isolation, response redaction, snapshot failures, cursor expiration, history availability, process-restart simulation and SSE route authorization.
- `e2e/runs.spec.ts` — list/search, live timeline, approval navigation and reconciliation, terminal outcomes, cursor expiration, history unavailable, snapshot retry and completion during disconnection.

Run the repository checks using the commands in `CLAUDE.md`. Results should be reported from the actual execution environment; the mock tests do not establish bridge compatibility or durability.

## Limitations and real SSE prerequisites

Run fixtures and decisions are in-memory and reset on process restart. Recovery metadata and cursor controls are local mock behavior. Reconnect retries are bounded, but use the browser's native EventSource retry interval rather than exponential backoff. Snapshot payloads have no version/revision field, so the client cannot determine freshness between two otherwise valid nonterminal snapshots. The UI currently has no server-side run filters or pagination. The mock stream is not a production event broker or durable event log.

Before enabling a real adapter, obtain the authoritative bridge contract for run list/detail operations, authentication and tenant enforcement, event transport, event IDs/order, cursor/replay and reconnect semantics, lifecycle mapping, error behavior, and whether event snapshots are authoritative. Do not infer endpoint paths or payload compatibility from this mock contract.

# Module 11E — Mock SSE Recovery & Reliability

Status: implemented for the **mock backend**. No `erp-mcp-bridge` replay, retention, snapshot-version, or durability capability is established by this module.

## Architecture

The existing path remains:

`Run UI → RunsService → authenticated Route Handler → RunsBackend → mock or unavailable bridge adapter`

The run snapshot remains authoritative for status and summary fields. SSE events update only the timeline. Run details validate that every event belongs to the enclosing run. Client history merges by run ID, event ID, and positive sequence number; ordering never uses timestamps or assumes event IDs are numeric. Duplicate snapshot and stream delivery is deduplicated.

When a sequence gap is observed, the client fetches and Zod-validates a new snapshot, merges its events with known history, and retains previously known events. A remaining gap is shown as recovery-incomplete; no missing event is synthesized. Late delivery can fill the gap. If the event service reports unavailable history, the client preserves the snapshot and known timeline but does not claim historical completeness.

An expired cursor is an explicit mock `run-recovery` SSE control. The client closes that stream, reconciles the snapshot, and starts a fresh subscription from its last known event cursor. The cursor may appear in the internal mock route's `cursor` query parameter for a newly created EventSource; this is not an access token. Native EventSource reconnects continue to use `Last-Event-ID`. The BFF prefers that header when both forms are present.

Each subscription stops after five reconnect errors. The mock SSE server sends a fixed 250 ms retry interval; no exponential-backoff algorithm is implemented. A user retry first reconciles the snapshot. EventSource listeners are removed on close, and snapshot reads are aborted on effect cleanup.

The client prevents an invalid lifecycle transition from replacing an already accepted status, including a terminal-to-active regression. Run snapshots do not have a version/revision field, so freshness between otherwise valid nonterminal snapshots cannot be independently established.

## Deterministic mock scenarios

The authenticated, mock-only `/api/mock-control` accepts these run scenario kinds:

| Scenario | Simulated behavior |
| --- | --- |
| `duplicate-events` | Repeats an event in the replay stream. |
| `out-of-order-events`, `late-events` | Reorders event delivery while retaining sequence-based presentation. |
| `event-gap` | Omits a sequence from stream replay; snapshot reconciliation can fill it. |
| `disconnect-once` | Closes one stream so native EventSource reconnect can be exercised. |
| `expired-cursor` | Closes after the initial replay, then reports an expired cursor once; replay resumes after reconciliation. |
| `history-unavailable` | Reports that historical replay cannot be retrieved. |
| `process-restart-history-available` | Simulates a stream interruption and successful cursor continuation. |
| `process-restart-history-unavailable` | Simulates a stream interruption followed by unavailable history. |
| `run-completes-during-disconnect` | The run snapshot becomes terminal while the stream is interrupted. |
| `snapshot-failure` | Snapshot read times out. |
| `snapshot-failure-on-recovery` | The initial snapshot succeeds; the recovery snapshot fails until the scenario is reset. |
| `snapshot-unavailable`, `snapshot-malformed` | Simulate unavailable or invalid snapshot data. |

These controls mutate in-memory test state only. They do not model an actual server process termination or imply durable event history.

## UI recovery states

The run detail connection notice distinguishes connected, reconnecting, recovering, recovery-incomplete, history-unavailable, disconnected, connecting, and inactive states. Incomplete recovery and unavailable history retain the last known timeline and expose `Retry recovery`. Snapshot errors use a generic message and do not surface raw backend errors.

## Verification

Coverage includes:

- Schema validation for event/run association and recovery control payloads.
- Run-scoped deduplication, sequence ordering, gaps, late events, snapshot merge, and terminal-state protection.
- HTTP snapshot errors/malformed responses, cursor propagation, bounded reconnect attempts, recovery controls, and transport cleanup.
- BFF tenant authorization, safe snapshot failures, expired cursor, unavailable history, and process-restart simulations.
- Playwright workflows for expired cursor, snapshot recovery failure/retry, unavailable history, and completion during disconnection.

Run the repository checks in `CLAUDE.md`; report only commands that actually ran. The mock tests do not establish bridge compatibility, exact-once delivery, durable replay, or snapshot freshness/version guarantees.

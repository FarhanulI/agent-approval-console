# Module 11A: Bulk Decisions and Queue Keyboard Shortcuts

## Goal and boundary

Complete approve/reject for selected queue actions using the existing authenticated BFF and mock backend. This is a proposed application BFF contract only; it does not assert or implement bulk support in `erp-mcp-bridge`. The bridge backend continues to fail closed without network I/O.

Bulk processing is **per item**, not transactional. A response can contain successes and failures together. Approval changes an action to `approved`; it does not mean that business execution completed.

## Request and result contract

`POST /api/actions/bulk-decision` accepts a strict JSON object with 1–25 unique decisions. Each item contains:

- `actionId`
- `decision` (`approve` or `reject`)
- the displayed `recordVersion`
- optional `reason`
- a unique per-item `idempotencyKey`

Actor and tenant identity are intentionally absent. The BFF derives the actor and tenant scope from the authenticated session. Item IDs and idempotency keys are unique within a batch; unknown fields, oversized batches, malformed keys, and duplicate IDs/keys are rejected before mutation.

Every response item includes the action ID, requested decision, outcome, and a safe message. Confirmed outcomes also include the resulting status and record version. Outcomes are:

| Outcome | Meaning |
| --- | --- |
| `approved` / `rejected` | The backend confirmed the corresponding decision. |
| `conflict` | The action is no longer pending or its record version changed. |
| `forbidden` | The actor lacks permission or the action is missing/outside their tenant; missing and cross-tenant resources share one result. |
| `failed` | The decision was not sent or a definite non-commit was identified (for example, preflight/rate limit or idempotency-key reuse). |
| `outcome_unknown` | A decision call may have committed but was not confirmed. Reconcile before any manually initiated retry. |

No automatic request retry is performed. A network failure, timeout, 5xx, or invalid success response is not represented as a confirmed business failure.

## Server-side decision semantics

The route checks trusted origin and authentication once, then handles each item independently:

1. Apply the per-user decision rate limit.
2. Load the action; hide missing and cross-tenant records behind the same `forbidden` outcome.
3. Check the decision-specific permission for that action and tenant.
4. Look up the item-scoped idempotency key before status/version checks. A same-key/same-fingerprint committed decision replays its original result; a key reused with a different payload is a definite `failed` result.
5. Check pending status and the submitted `recordVersion`.
6. Submit eligible items to `ActionsBackend.bulkDecide`, which rechecks authorization/tenant in the mock and commits each action atomically and independently. There is no batch rollback.

The browser generates a different key for every logical item decision. The key is stable in the client while that item’s outcome is unknown, and is discarded after a definite result. The mock backend scopes the key to the actor and fingerprints tenant/action/decision/version/reason, preventing one actor from reusing a key for another item or decision. The backend rechecks the key alongside its atomic mock transition, so concurrent duplicates cannot commit twice; a replay of an accepted result does not append another accepted audit event.

The mock BFF records an allow-listed audit event for each newly resolved accepted decision, conflict, permission denial, or unknown outcome. Failed preflight checks and idempotency-key reuse do not produce a decision audit event because no new decision was submitted. Audit writes remain in-memory, non-durable, and not atomic with the action update; those limitations are not changed by this module.

## Queue behavior

- Selection remains limited to fresh, pending rows on the current query/page.
- Approve/reject controls open a confirmation dialog listing the selected action and displayed record version. The user must explicitly confirm; approval is not execution.
- The result panel displays each item outcome separately, including partial success and uncertainty. Unknown outcomes advise rechecking the queue; the UI never retries them automatically.
- Confirmed and unknown workflows invalidate the affected action details, all action lists, and audit lists.
- Real mode keeps decisions unavailable; neither the UI nor the adapter claims that the bridge has a bulk endpoint.

## Keyboard and accessibility

- `A` opens the approve confirmation; `R` opens the reject confirmation. Neither shortcut submits a decision.
- Shortcuts are ignored in input, textarea, select, and content-editable elements; when a modifier is held; while any native dialog is open; and when there is no fresh selection or decisions are unavailable.
- A/R are discoverable in the selection bar and exposed through `aria-keyshortcuts`.
- The existing native modal dialog provides focus containment, Escape handling, and focus restoration. The confirmation still requires activating its explicit button.
- Keyboard navigation uses the existing labelled checkboxes, action buttons, table region, and dialog controls. No automated full-page accessibility audit is claimed.

## Implementation surfaces

| Surface | Responsibility |
| --- | --- |
| `src/features/approvals/schemas/bulk-decision.ts` | Strict bounded request and per-item result schemas |
| `src/features/approvals/types.ts` and `services/actions-service.ts` | Typed browser service operation and response validation |
| `src/features/approvals/server/actions-backend.ts` | Per-item backend port contract |
| `src/features/approvals/server/handlers.ts` | Authenticated BFF, per-item checks, result mapping and audit events |
| `src/features/approvals/server/mock-backend.ts` | Independent mock authorization and transitions |
| `src/features/approvals/server/bridge-backend.ts` | Explicitly unavailable bulk operation; no network calls |
| `src/app/api/actions/bulk-decision/route.ts` | App Router route composition |
| `src/features/approvals/hooks/use-bulk-decision-mutation.ts` | Per-item stable keys and query invalidation |
| `src/features/approvals/components/` | Confirmation, outcome feedback and shortcuts |
| `src/features/approvals/utils/queue-shortcuts.ts` | Shortcut guards |

## Tests and verification

Coverage includes strict schema shapes/bounds, service response matching and unknown outcomes, BFF authentication and validation, partial success, permission and tenant isolation, stale versions, idempotent replay/key reuse, unknown outcomes, audit semantics, UI confirmation/partial results/input guards, and Playwright bulk approval.

Run the repository checks:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- Build with `NEXT_PUBLIC_API_MOCKING=enabled`, then run Playwright with `E2E_SERVER=start`

### Verification completed

- `npm.cmd run lint` — passed.
- `npm.cmd run typecheck` — passed.
- `npm.cmd test -- --maxWorkers=1` — passed: 37 test files, 332 tests.
- Production build with `NEXT_PUBLIC_API_MOCKING=enabled` — passed.
- `E2E_SERVER=start npx.cmd playwright test e2e/approvals.spec.ts` — passed: 15 tests, including bulk confirmation and A/R shortcut guards.
- `git diff --check` — passed.

The E2E run covered `e2e/approvals.spec.ts`, not the complete Playwright suite. No real-bridge tests were run.

The mock-only checks do not certify any real backend behavior.

## Remaining limitations

- No verified bridge bulk or single-decision contract; bridge decisions remain unavailable.
- Mock action, idempotency, and audit state are in-memory and resettable.
- Audit persistence is not durable/atomic with decisions.
- There is no authoritative backend lookup for unknown outcomes. Client idempotency keys live only in memory; after reload, the reviewer must recheck the queue and make a deliberate new submission only if the action is still pending.
- Rate limiting is process-local and is not a distributed production control.

## Follow-up before enabling real decisions

Confirm with the bridge owners the backend authorization and tenant guarantees, atomic status/version transitions, per-item idempotency and replay semantics, bulk result/error contract, reconciliation behavior for unknown outcomes, and durable audit semantics. Until then, do not implement speculative bridge calls or enable decisions in real mode.

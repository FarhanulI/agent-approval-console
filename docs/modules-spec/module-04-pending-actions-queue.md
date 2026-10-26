# Module 4: Pending Actions Queue

## Purpose

Give reviewers a queue of agent-proposed actions that can be searched, filtered, sorted and paged, backed by a typed service and MSW mock API. This module is the list view only. It does not implement the Action Detail workflow, approve/reject execution, Live Run streaming or the Audit Log.

## Scope

**In scope**
- Typed list service and HTTP adapter for `GET /api/actions` (proposed frontend contract).
- MSW handlers and deterministic fixtures for the list.
- TanStack Query for server state; TanStack Table (v9) for sorting, selection and pagination.
- Server-side search, filtering (status, risk), sorting and pagination, synchronised with the URL.
- Row selection with a safe, non-executing selection bar.
- Loading, empty, no-match, error, background-refetch and stale-data states.
- Navigation from each row to `/approvals/{actionId}`.
- Unit, component and Playwright E2E tests.

**Out of scope**
- Action Detail view, approve/reject/bulk mutations, execution, SSE, React Flow, Audit Log, auth changes, integration with the real `erp-mcp-bridge`, redesign of the Module 3 shell.

## Constraints

- Domain schemas and types in `src/features/approvals/contracts.ts` are authoritative and are not modified. No field renames; the approval lifecycle is unchanged.
- Components never call `fetch`; they depend on the `ActionsService` interface only.
- Server state lives in TanStack Query only; no second cache and no copy of server rows in React state.
- No `any`, `@ts-ignore` or blanket lint disables. No credentials in `NEXT_PUBLIC_*`.
- Nothing may imply that an action was approved, rejected or executed.

## Contract Reconciliation

The existing `ActionQuery` supports `page`, `pageSize`, `status`, `risk`, `search`. The response is `{ items, pagination: { page, pageSize, total } }` (page-based, 1-indexed). There is no separate DTO for actions, so no DTO-to-domain mapping is needed.

| Requirement | Contract status | Decision |
| --- | --- | --- |
| Pagination | Supported | Use as-is |
| Status / risk filter, search | Supported | Use as-is |
| Server-side sort | Not in contract | Proposed `sortBy` (`createdAt`, `risk`) and `sortDirection` declared in `features/approvals/types.ts`, isolated from `contracts.ts`; default `createdAt desc`. Implemented by MSW only; real backend support is unconfirmed |
| Action-type filter | No such field | Not implemented |
| Date-range filter | Not in contract | Not implemented |
| Aggregate counts | Not in contract | No summary indicators; only the response `total` is shown |

Searchable fields are a mock assumption: id, title, summary, target label, target recordId and agent name (case-insensitive).

## Structure

| Path | Responsibility |
| --- | --- |
| `src/app/(console)/approvals/page.tsx` | Route composition: `PageHeader` and `Suspense` around the queue |
| `src/features/approvals/types.ts` | `ActionsService`, `ActionListQuery`, sort and `QueueState` types |
| `src/features/approvals/schemas/action-list-query.ts` | Zod validation of the list query string |
| `src/features/approvals/services/` | HTTP adapter, `ActionsServiceError` (`network`, `http`, `malformed`), default instance |
| `src/features/approvals/utils/` | Query serialisation, URL/UI state mapping, presentation maps |
| `src/features/approvals/hooks/` | `useActionsQuery` and query keys; `useQueueUrlState` |
| `src/features/approvals/components/` | `PendingActionsQueue`, `QueueToolbar`, `QueueTable`, `QueuePagination`, `SelectionBar`, status/risk badges |
| `src/lib/api/client.ts` | `apiFetch`; starts MSW first when mocking is enabled |
| `src/lib/utils/format-date.ts` | Shared timestamp formatter |
| `src/mocks/` | Fixtures, pure list logic, handlers with scenario switch, browser worker |
| (removed in Module 6) `public/mockServiceWorker.js` | The browser MSW worker was removed; the mock runs server-side behind the BFF |

## Behaviour

### Service
- `listActions(query, { signal })` validates the response with `actionListResponseSchema`.
- HTTP errors become `ActionsServiceError` with `status`, `code`, `requestId` when the body matches `apiErrorResponseSchema`. Invalid JSON or schema mismatch becomes `malformed`. Aborts are rethrown unchanged.

### MSW
- Parameters: `page`, `pageSize` (1-100), `status`, `risk`, `search` (max 200), `sortBy`, `sortDirection`. Invalid values return `400 invalid_query`.
- Fixtures: 47 deterministic actions with varied status, risk, targets, agents and timestamps; some without `runId`.
- Scenarios for tests and E2E: `ok` (optional delay), `server-error`, `malformed`, `empty`. As of Module 6 they are shared state in `src/mocks/scenarios.ts`, applied by the server-side mock backend and driven in E2E through `POST /api/mock-control` (mock mode only); `window.__mock` and the browser worker no longer exist.
- Mocking is enabled with `NEXT_PUBLIC_API_MOCKING=enabled`.

### Query
- Key: `["approvals","actions","list", {page,pageSize,status,risk,search,sortBy,sortDirection}]`.
- `placeholderData: keepPreviousData`; `retry: false` (the user retries explicitly); the abort signal is passed to the service.

### URL state
- Parameters: `q`, `status`, `risk`, `sort` (`field` ascending, `-field` descending), `page`. Defaults are omitted.
- Invalid URL values fall back to defaults. Any change other than `page` resets to page 1.
- Search is debounced (300 ms) and also commits on Enter. External URL changes replace the draft.

### Table
- Columns: select, action (title linking to `/approvals/{encodeURIComponent(id)}`, summary), target record, agent/run, risk, status, created.
- Manual sorting (Created, Risk only) and manual pagination; rows keyed by action id.
- Status and risk render as text badges; tone is only reinforcement.
- The table sits in a focusable, labelled scroll region so the page itself does not overflow on mobile.

### Selection
- Only `pending` rows are selectable. Selection is scoped to the current query and cleared when the query changes; IDs not present in the loaded data are dropped.
- Approve/Reject selected are disabled with an explanatory message. "Clear selection" works.
- While placeholder data is shown, selection and pagination are disabled.

### States
| State | UI |
| --- | --- |
| Initial load | `LoadingState`, never an empty message |
| Empty queue | `EmptyState` without clear action |
| No match under filters | `EmptyState` with "Clear filters" |
| Error, no data | `ErrorState` with request id and Retry (`refetch`) |
| Refetch error with data | Inline alert with Retry; last data kept |
| Refetching / stale | "Updating results…" status; table dimmed and `aria-busy` |
| Page past the end | Falls back to the last page |

## Accessibility

- Labelled search, status and risk controls; `role="search"` form.
- Header cells use `scope="col"`; sortable columns expose `aria-sort`.
- Checkboxes are named with action title and target; the select-all box says it covers pending actions on the page.
- Pagination is a labelled `nav` with "Previous page"/"Next page".
- One polite status region for refresh text. No automated accessibility audit tool is installed, so no audit result is claimed.

## Testing

Dependencies added (dev only): `jsdom`, `@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, because the existing setup could only render static markup.

| Layer | Files |
| --- | --- |
| Unit | `utils/queue-state.test.ts`, `mocks/actions-list.test.ts` |
| Service + MSW | `services/actions-service.test.ts` (query params, validation, 400/500, malformed, network, abort) |
| Component | `queue-table`, `queue-toolbar`, `selection-bar`, `pending-actions-queue` tests (jsdom, MSW node server, stateful `next/navigation` mock) |
| E2E | `e2e/approvals.spec.ts` (open, search/filter, deep link, sort, pagination, detail navigation, empty, error + retry, selection, stale state, mobile/desktop) |

E2E runs through `playwright.config.ts`. By default it starts `next dev`; with `E2E_SERVER=start` it serves a production build made with `NEXT_PUBLIC_API_MOCKING=enabled`.

## Acceptance Criteria

- Approvals renders a working queue built on the existing contract, with API access isolated behind `ActionsService`.
- Search, filters, sort and pagination run server-side and are reflected in the URL.
- Every state in the table above is handled explicitly and tested.
- Rows link to the action detail route using the real id.
- Selection never executes or reports a decision.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and the Playwright suite pass.
- `contracts.ts` and Module 3 shell components are unchanged.

## Known Limitations

- Sort parameters are a proposed extension; real backend support is unconfirmed.
- No action-type or date-range filter and no aggregate counts, because the contract lacks them.
- Bulk decisions are disabled by design.
- Fixed page size of 10; no page-size selector.
- Browser mocking requires `NEXT_PUBLIC_API_MOCKING=enabled` (for example in `.env.local`).

## Next Module

Action Detail View: `getAction`, evidence and record changes, single-item approve/reject with `recordVersion`, and conflict handling, before any bulk execution.

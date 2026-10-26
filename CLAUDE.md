# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A human-supervision console for AI agent actions (approve/reject, live runs, audit log). It is the supervision UI, not the agent or ERP engine; the integration target is `erp-mcp-bridge`. Product concepts and the approval lifecycle live in `docs/product-architecture.md`; per-module specs are in `docs/modules-spec/` (modules 2–4 written so far). `.github/copilot-instructions.md` holds the working agreement.

## Commands

- `npm run dev` — dev server (port 3000). Next refuses a second `next dev` in the same folder, so Playwright can't start its own while one is running.
- `npm run lint`, `npm run typecheck` (`next typegen && tsc --noEmit`), `npm run build`
- `npm test` — Vitest (`vitest run`); single file: `npx vitest run src/features/approvals/utils/queue-state.test.ts`; by name: `npx vitest run -t "pattern"`
- `npm run test:e2e` — Playwright on port 3100, starts `next dev` with `NEXT_PUBLIC_API_MOCKING=enabled`. Single file: `npx playwright test e2e/approvals.spec.ts`
- Production-build E2E (use when a dev server is already running): `NEXT_PUBLIC_API_MOCKING=enabled npm run build && E2E_SERVER=start npx playwright test`. The flag is inlined at build time, so a build without it has no mock API.
- To use mock data in the browser with `npm run dev`, put `NEXT_PUBLIC_API_MOCKING=enabled` in `.env.local` (`.env*` is gitignored except `.env.example`).

## Read before coding

`AGENTS.md` says this Next.js (16.4) and React 19.3 differ from training data: read the relevant guide in `node_modules/next/dist/docs/` before writing Next code. `@tanstack/react-table` is **v9** (not v8): features are registered via `tableFeatures({...})` + `useTable`, rendered with `table.FlexRender`; docs ship in `node_modules/@tanstack/react-table/skills/` and `node_modules/@tanstack/table-core/skills/`.

## Architecture

- Layering: `src/app` is route composition only; logic lives in `src/features/<feature>`; shared UI in `src/components/ui` (design tokens in `src/app/globals.css`, Tailwind v4); shell in `src/components/layout`; shared infra in `src/lib`.
- **Domain contract:** `src/features/approvals/contracts.ts` holds all Zod schemas, inferred types and the `ApprovalApiContract`. It is authoritative: don't rename fields or change the lifecycle. Gaps are handled with isolated extensions instead — e.g. the proposed sort params (`sortBy`/`sortDirection`) live in `features/approvals/types.ts`, not in `contracts.ts`.
- **Data path (queue):** component → `useActionsQuery` (TanStack Query) → `ActionsService` interface → `createHttpActionsService` → `apiFetch` (`src/lib/api/client.ts`) → network. The adapter validates responses with the Zod schema and throws `ActionsServiceError` (`network` | `http` | `malformed`). Components never call `fetch`. Swapping in the real backend means changing `services/index.ts` only.
- **Auth & BFF (Module 6):** `src/proxy.ts` (first layer), Auth.js v4 JWT sessions (`src/lib/auth/`), and Route Handlers in `src/app/api/actions/**` backed by the `ActionsBackend` port (`features/approvals/server/`). Identity comes from the session cookie only; policy in `lib/auth/policy.ts`. The mock backend runs server-side only in mock mode (`lib/config/mock-mode.ts`); the bridge backend is intentionally unavailable. See `docs/modules-spec/module-06-auth-authorization.md`. Env: `AUTH_SECRET`, `AUTH_DEV_PASSWORD` (see `.env.example`).
- **Audit (Module 7):** `features/audit/` — strict extension schemas (`AuditEventRecord` has `tenantId`, the browser DTO never does), `AuditBackend` port (mock in-memory / bridge unavailable → `503 audit_unavailable`), BFF `GET /api/audit-events[/:id]`, events recorded only in `handleDecision`. UI at `/audit`. See `docs/modules-spec/module-07-audit-log.md`.
- **MSW:** `src/mocks/` holds deterministic fixtures, pure list logic (`actions-list.ts`), scenario state (`scenarios.ts`, shared via `globalThis`) and handlers used by `msw/node` adapter tests. The browser worker was removed; E2E switches scenarios via `POST /api/mock-control` (`e2e/fixtures.ts`) and signs in through Auth.js. Vitest adapter tests use `msw/node` with an absolute `baseUrl`.
- **Queue state:** the URL is the single source of truth for `q`, `status`, `risk`, `sort`, `page` (`utils/queue-state.ts`, `hooks/use-queue-url-state.ts`); any change except `page` resets to page 1. Table sorting/pagination are TanStack *manual* modes driven by URL state. Row selection is local but scoped to the current query and ignored while placeholder (stale) data is shown. Bulk decisions are intentionally disabled UI.
- Pages that use `useSearchParams` need a `Suspense` boundary.

## Testing notes

- Vitest default environment is `node`; component tests opt into jsdom per file with `// @vitest-environment jsdom` and call `cleanup` in `afterEach` (no globals/setup file). Navigation is mocked with a small URL store (see `pending-actions-queue.test.tsx`).
- Existing Module 3 shell tests use `renderToStaticMarkup`.
- No automated accessibility tool (axe) is installed; don't claim an a11y audit.

## Workflow (from `.github/copilot-instructions.md`)

Work on one module at a time; for a new module, inspect first, present the plan, and wait for explicit approval before editing code. Never claim a check passed unless it ran. Never invent endpoints for `erp-mcp-bridge`; approval and execution are separate states; don't retry business operations blindly.

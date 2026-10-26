---
name: module-complete
description: Post-implementation quality pass for a finished module or change - audit documentation and specification-driven tests, run all checks, and deliver the completion report. Invoke manually after a module is implemented.
disable-model-invocation: true
---

# Module completion: documentation, specification-driven tests, report

Act as a Staff Software Engineer and QA Architect on `agent-approval-console`. Apply this to the module or change just implemented (use `git status` / `git diff` and `$ARGUMENTS` to determine scope). Do not start another module. Do not add features; only close documentation, test and verification gaps, and report anything you cannot close.

## 1. Inspect first

Read `CLAUDE.md`, `AGENTS.md`, the relevant `docs/modules-spec/` file, the domain contract (`src/features/approvals/contracts.ts`), the changed files and their existing tests. Follow existing naming, architecture and test conventions. Do not invent API behaviour, backend guarantees, lifecycle transitions or `erp-mcp-bridge` compatibility. Keep changes minimal and reviewable; never change production behaviour just to make a test pass.

## 2. Documentation audit

For every exported function, hook, component, service, adapter, schema and public type in the changed scope, ensure accurate TSDoc covering what applies:

- Purpose and responsibility; parameters/props and return values.
- Invariants and preconditions; side effects and cleanup.
- Error conditions and failure behaviour.
- Cancellation, concurrency and idempotency semantics.
- For components: responsibility, meaningful props, interactions, accessibility behaviour.
- For Zod schemas and domain types: key constraints and what invalid data means.
- For complex logic: WHY it exists, not what each line does.

Rules: no redundant comments on self-explanatory code; never document behaviour the code does not guarantee; update or delete stale comments; no secrets or needless internals.

## 3. Specification audit

1. List the module's requirements as testable acceptance criteria with stable IDs (e.g. `QUEUE-001`). Keep them next to the feature (existing spec file or test `describe` names); do not create a second documentation system.
2. For each, identify normal, boundary, invalid-input, failure and recovery scenarios.
3. Map every criterion to tests; write the missing ones.

## 4. Test layers (choose by risk, avoid redundancy)

- **Unit:** pure functions, validation, transformations, state transitions, boundaries, error mapping.
- **Component:** rendering, props, interactions, loading/empty/error/stale/disabled/accessibility states. Prefer accessible queries and realistic interactions.
- **Integration:** service/adapter behaviour, Zod response validation, MSW handlers, TanStack Query (cancellation, cache), partial failures.
- **Playwright E2E:** key journeys, navigation, keyboard use, failure recovery.

Quality rules: test success and failure paths and malformed payloads; deterministic fixtures, no random data or real network; no brittle tests tied to private implementation; never weaken or skip tests. For approval workflows, where the actual contract supports them, cover eligibility, duplicate submission, stale record versions, conflicts, uncertain outcomes and per-item results. Never simulate a successful business operation the contract does not support; keep approval and execution separate; never blindly retry non-idempotent operations. Frontend permission checks do not replace backend authorization.

## 5. Verify (run, do not assume)

Run the narrowest relevant tests first, then the full suite:

- `npm run lint`
- `npm run typecheck`
- `npx vitest run` (add `--coverage` only if coverage is already configured; do not add dependencies without clear benefit)
- `npm run build`
- Playwright: `npm run test:e2e`, or if a dev server holds the port, `NEXT_PUBLIC_API_MOCKING=enabled npm run build` then `E2E_SERVER=start npx playwright test`

Coverage is a signal, not a target; prioritise business rules, failure handling and meaningful assertions. Consider mutation testing only if compatible tooling already exists.

## 6. Completion report

Report exactly these, factually:

1. Summary of the change.
2. Files changed and why.
3. Acceptance criteria implemented.
4. Tests added/updated, mapped to criteria IDs.
5. Exact verification commands and actual results.
6. Coverage or mutation results, if measured.
7. Failures, skipped checks, limitations, unverified assumptions.
8. Remaining risks and recommended next step.

Never report a build, test, lint, type-check, accessibility audit or coverage result unless it was actually run and observed.

# Module 2 Spec: Domain Types & API Contract

## Overview

In this module, we defined the shared domain contract for the `agent-approval-console`. The goal was to keep one typed contract across the frontend UI, mock backend, and future real backend so that no feature layer depends on undocumented payload assumptions.

This contract is designed to work with the same interface for both the MSW mock adapter and a future real backend adapter.

## Module Goal

- Define the domain model for `PendingAction`, `AgentRun`, `Evidence`, `RecordChange`, and `AuditEvent`
- Enforce runtime validation with Zod schemas
- Define consistent API error and pagination DTO conventions
- Standardize bulk decision, approval/rejection payloads, audit queries, and run detail responses
- Create a typed boundary for shared mock and real backend usage

## Included Scope

- approval-related enums and schema definitions
- scalar value and record change payload types
- evidence metadata structure
- run and audit event schema
- API error response contract
- action list, audit list, bulk decision, and run detail response DTOs
- the `ApprovalApiContract` interface for backend standardization

## Excluded Scope

- actual UI implementation for the approval queue or detail view
- real `erp-mcp-bridge` integration
- Auth.js session and protected routes
- SSE streaming client or live monitor UI
- database-backed persistence

## Architecture Alignment

This module follows the project architecture rules:

- keep route composition in `src/app` and business-facing contracts in `src/features`
- keep API communication inside typed service boundaries
- validate external payloads with Zod
- keep domain models separate from API DTOs
- support a shared contract between mock and real backends

## Files Added

- [src/features/approvals/contracts.ts](../../src/features/approvals/contracts.ts)
- [src/features/approvals/index.ts](../../src/features/approvals/index.ts)

## Contract Highlights

### Core enums

- `approvalStatusSchema`
- `runStatusSchema`
- `riskLevelSchema`
- `evidenceSourceTypeSchema`

### Domain entities

- `PendingAction`
- `AgentRun`
- `Evidence`
- `TargetRecord`
- `RecordChange`
- `AuditEvent`

### API DTOs

- `ActionListResponse`
- `ActionDecisionRequest`
- `DecisionResult`
- `BulkDecisionRequest`
- `BulkDecisionResult`
- `AuditEventListResponse`
- `RunDetailResponse`
- `ApiErrorResponse`

### Shared service interface

```ts
export interface ApprovalApiContract {
  getActions(params?: ActionQuery): Promise<ActionListResponse>;
  getAction(actionId: string): Promise<PendingAction>;
  approveAction(actionId: string, payload: ActionDecisionRequest): Promise<DecisionResult>;
  rejectAction(actionId: string, payload: ActionDecisionRequest): Promise<DecisionResult>;
  bulkDecision(payload: BulkDecisionRequest): Promise<BulkDecisionResult>;
  getRun(runId: string): Promise<AgentRun>;
  getAuditEvents(params?: AuditQuery): Promise<AuditEventListResponse>;
}
```

## Validation Strategy

- Zod runtime validation for all incoming and outgoing contract payloads
- ISO date string validation through a custom `dateTimeStringSchema`
- `recordChange` supports before/after scalar values and structured payloads
- `ApiError` keeps a consistent structure for `code`, `message`, `requestId`, and optional details

## Verification

The following checks were executed:

- `npm run typecheck` — PASS
- `npm run lint` — PASS

## Notes

- This module does not implement approval logic; it defines the contract that later modules will use.
- Validation is intentionally strict to prevent malformed mock payloads from leaking into downstream feature code.
- This keeps the path clean for Module 3 onward: shell, queue, detail view, runs, and audit flows can all depend on the same contract.

## Next Module Reference

Next module:

- Module 3: Application Shell & Design System

This module will build the navigation shell, layout primitives, reusable UI components, and design-language foundation without changing the domain contract introduced here.

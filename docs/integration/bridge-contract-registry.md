# Bridge Contract Verification Registry

## 1. Discovery summary

No authoritative `erp-mcp-bridge` source code, OpenAPI specification, MCP schema, authentication rules, tenant policy, action or decision contract, audit persistence implementation, or run/SSE contract is available in this repository.

The available evidence is:

- `docs/integrations/erp-mcp-bridge-contract.md` states that the real bridge contract is not verifiable.
- `src/features/approvals/server/bridge-backend.ts` performs no network I/O and returns `BackendError("unavailable")`.
- `src/features/approvals/server/get-backend.ts` selects the mock backend only when mock mode is enabled; otherwise it selects the unavailable bridge adapter.
- `src/features/runs/server/bridge-runs-backend.ts` likewise leaves run and event-stream behavior unavailable pending contract verification.
- `src/lib/config/readiness.ts` reports mock mode as ready only when its configuration checks pass; non-mock mode is identified as `bridge-unavailable`.

Accordingly, there is no verified evidence here that the bridge implements any of the capabilities below. Each remains `unverified`.

## 2. Status definitions

- `verified`: Established by authoritative source code, an official specification, or executable contract tests.
- `unsupported`: Authoritative evidence establishes that the capability does not exist or is explicitly unsupported.
- `unverified`: Available evidence is missing, inaccessible, or insufficient to establish the capability.

## 3. Contract registry

| Contract ID | Capability | Status | Evidence source | Observed behavior | Limitation | Console impact | Next action |
|---|---|---|---|---|---|---|---|
| BRIDGE-CONTRACT-001 | Repository and protocol discovery | unverified | `docs/integrations/erp-mcp-bridge-contract.md`; `docs/modules-spec/module-08-backend-integration.md` | The project documentation records the bridge contract as unknown and unverified. | No bridge repository identity, official specification, or protocol documentation is available here. | Keep the UI and BFF on the mock-only path; do not infer bridge operations. | Obtain the actual bridge repository or its official OpenAPI/MCP specification. |
| BRIDGE-AUTH-001 | Authentication and delegated actor | unverified | `src/features/approvals/server/bridge-backend.ts`; `src/features/approvals/server/actions-backend.ts` | The bridge authentication and actor-propagation logic is not implemented. The internal backend context uses a session-derived principal. | Human, agent, and system actor representation and bridge-side enforcement are unknown. | The trust boundary between the Auth.js BFF and the bridge cannot be established. | Confirm the bridge authentication flow, delegated identity model, and permission enforcement. |
| BRIDGE-TENANT-001 | Tenant isolation | unverified | `src/features/approvals/server/actions-backend.ts`; `docs/modules-spec/module-06-auth-authorization.md` | The internal backend port requires data to be scoped to `ctx.principal.tenantIds`. Bridge-side enforcement has not been verified. | It is unknown whether the bridge derives tenant scope from trusted credentials and enforces ownership checks. | A real adapter cannot rely on BFF scoping alone as proof of bridge tenant isolation. | Verify tenant claims, resource ownership checks, and cross-tenant access controls in the bridge. |
| BRIDGE-ACTIONS-001 | Action listing and detail retrieval | unverified | `src/features/approvals/server/actions-backend.ts`; `src/features/approvals/contracts.ts` | The console has internal list and detail models, but the bridge operations and their pagination, filter, sort, and version semantics are unknown. | No bridge URL, request/query schema, response schema, or page-size rules are available. | Mock list and detail behavior may not match the real backend. | Obtain the bridge action API contract and map its request and response schemas. |
| BRIDGE-DECISION-001 | Approve/reject semantics | unverified | `src/features/approvals/server/actions-backend.ts`; `src/features/approvals/server/bridge-backend.ts` | `decide` and `bulkDecide` exist as internal interfaces; the bridge adapter has no implementation. | Atomic transitions, status and version validation, and conflict behavior are unknown. | Decision workflows remain mock-only; approval must not be treated as execution. | Confirm the bridge decision operations, validation guarantees, and conflict responses. |
| BRIDGE-IDEMPOTENCY-001 | Idempotency and outcome reconciliation | unverified | `src/features/approvals/server/actions-backend.ts`; `src/features/approvals/server/mock-backend.ts` | The mock backend models idempotency and replay. No equivalent bridge behavior has been verified. | Key scope and retention, duplicate behavior, and authoritative lookup after an unknown outcome are unknown. | A timeout must not be treated as failure or trigger an automatic retry. | Verify bridge idempotency semantics and an authoritative decision-outcome lookup. |
| BRIDGE-AUDIT-001 | Durable audit persistence | unverified | `src/features/audit/server/bridge-audit-backend.ts`; `src/features/audit/server/audit-backend.ts`; `docs/modules-spec/module-07-audit-log.md` | An internal audit backend interface exists, but bridge audit storage and transaction consistency are unverified. | The in-memory mock does not establish durable or append-only audit behavior. | Real audit reliability cannot be inferred from mock behavior. | Verify bridge audit writes and queries, durability, and consistency with decisions. |
| BRIDGE-ERRORS-001 | Error mapping and correlation IDs | unverified | `src/features/approvals/server/actions-backend.ts`; `src/lib/server/http.ts`; `src/features/approvals/contracts.ts` | The console defines an internal API error shape, but bridge error codes, retryability, and request/correlation ID conventions are unknown. | No bridge error schema or consistent correlation header has been confirmed. | Upstream errors cannot yet be mapped reliably to console responses. | Obtain the bridge error contract and verify request and correlation ID propagation. |
| BRIDGE-RUNS-001 | Run snapshot and SSE | unverified | `src/features/runs/server/bridge-runs-backend.ts`; `src/features/runs/hooks/use-run-events.ts`; `src/features/runs/server/runs-backend.ts` | Internal run and event interfaces exist, but bridge status, event ordering, replay, and cursor behavior are unverified. | Event retention, sequence semantics, replay expiry, and authoritative snapshot behavior are unknown. | Live-run behavior is verified only against the mock implementation. | Obtain and test the bridge run snapshot and event-stream contract. |

## 4. Discovery blockers

The following sources or contract details are needed to verify the real bridge:

1. The bridge repository or official specification.
2. The supported transport: HTTP REST, MCP, or both.
3. Authentication, authorization, delegated actor, and tenant-enforcement rules.
4. Action list/detail operations and their pagination and query contracts.
5. Atomic approve/reject behavior and status/version validation.
6. Idempotency semantics and unknown-outcome reconciliation.
7. Audit durability and correlation-ID behavior.
8. Run snapshots and SSE replay semantics.

## 5. Evidence references

- `docs/integrations/erp-mcp-bridge-contract.md`
- `docs/modules-spec/module-08-backend-integration.md`
- `src/features/approvals/server/bridge-backend.ts`
- `src/features/approvals/server/get-backend.ts`
- `src/features/approvals/server/actions-backend.ts`
- `src/features/runs/server/bridge-runs-backend.ts`
- `src/lib/config/readiness.ts`
- `src/features/approvals/contracts.ts`

## 6. Conclusion

The evidence establishes that the bridge contract has not been verified in this project; it does not establish that the bridge lacks these capabilities. Keep the mock-safe BFF and fail-closed bridge placeholder until authoritative bridge sources are available and reviewed.

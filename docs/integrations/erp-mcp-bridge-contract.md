# `erp-mcp-bridge` Contract Inventory (Module 8, Phase A)

Last reviewed: 2026-11-05 · Result: **contract NOT verifiable — no real-bridge code was written.**

## 1. Evidence searched

| Source | Result |
|---|---|
| Local workspace (`agent-approval-console`) | Only internal docs/comments; every reference says the bridge contract is unknown (`docs/product-architecture.md`, `docs/modules-spec/module-05/06/07`, `src/features/*/server/bridge-*.ts`). |
| Sibling folders under `Desktop\Projects` and `Desktop` | No `erp-mcp-bridge` checkout. |
| Docs / OpenAPI / protocol files in repo | None for the bridge. |
| Git remotes | Not checked (`git` is not on PATH in this shell). |
| GitHub repository-name search `erp-mcp-bridge` | Five unrelated, third-party repositories (`AchanLin312/Erp-Mcp-Bridge`, `WESTSHINE27/mcp-erp-bridge`, `mffnxman/mcp-erp-bridge`, `No-Smoke/erpnext-mcp-bridge`, `DamilolaAdegunwa/adk-mcp-enterprise-erp-bridge`). Nothing links any of them to this project, so **none is accepted as the integration target**. |

## 2. Capability status

All statuses are `unverified` because no authoritative source exists. "Existing behavior" is the current fail-closed placeholder.

| ID | Capability | Status | Existing behavior |
|---|---|---|---|
| BRIDGE-CONTRACT-001 | Source/spec available | **unverified** | — |
| BRIDGE-AUTH-001 | Console→bridge auth mechanism, credential lifecycle, scopes | **unverified** | No credentials read or sent |
| BRIDGE-AUTH-001 | Delegated user identity / trusted actor propagation | **unverified** | Mock BFF sends `actorId`; bridge trust unknown |
| BRIDGE-TENANT-001 | Tenant/workspace context and enforcement | **unverified** | Enforced only in BFF/mock |
| BRIDGE-ACTIONS-001 | List (pagination/filter/sort), get-by-id | **unverified** | `503 unavailable` |
| BRIDGE-ACTIONS-001 | Evidence, reasoning summary, before/after, `recordVersion` | **unverified** | Shape in `contracts.ts` is the internal contract only |
| BRIDGE-DECISION-001 | Approve/reject operation, atomic status+version check | **unverified** | `503 decisions_unavailable` |
| BRIDGE-IDEMPOTENCY-001 | Idempotency key, replay, key/payload mismatch, concurrency | **unverified** | Only the mock honors keys |
| BRIDGE-DECISION-001 | Decision lookup for unknown-outcome reconciliation | **unverified** | `findRecordedDecision` unavailable |
| BRIDGE-DECISION-001 | Approval vs execution separation | **unverified** | Console treats them as separate |
| BRIDGE-AUDIT-001 | Audit list/detail, durability, append-only, atomic with decision | **unverified** | `503 audit_unavailable`; mock audit is non-atomic and in-memory |
| BRIDGE-ERRORS-001 | Error codes/format, correlation IDs, rate limits | **unverified** | Nothing mapped |
| Runs/SSE | Run list/detail, event stream | **unverified** | Out of scope |

No capability is marked `verified` or `unsupported`; `unsupported` requires evidence of absence.

The mock-backed application workflow and its verification are documented separately in [Module 8](../modules-spec/module-08-backend-integration.md). Passing mock tests does not verify any bridge capability.

## 3. Mapping (domain op → bridge op)

Intentionally empty. Ports: `ActionsBackend` (`listActions`, `getAction`, `findRecordedDecision`, `decide`) and `AuditBackend` (`record`, `list`, `get`) in `src/features/{approvals,audit}/server/`.

## 4. Configuration

No bridge configuration is defined, since inventing variable names, URLs or token formats would be fabrication. Real mode stays fail-closed via `createBridgeBackend` / `createBridgeAuditBackend`, with no mock fallback.

## 5. Information required to proceed

1. Bridge repository or OpenAPI/protocol spec, plus the transport (HTTP REST vs MCP).
2. Auth: how the console authenticates, token format/scopes/rotation, and how the end user and tenant are propagated and enforced.
3. Action read endpoints, with pagination/filter/sort and the `recordVersion` field.
4. Decision endpoint: request fields, idempotency-key header and semantics, conflict/stale codes, atomicity, and a lookup for unknown outcomes.
5. Audit endpoints, if any, with durability, ordering and event taxonomy.
6. Error format and correlation-ID header.
7. A test instance or contract-faithful test server and credentials.

## 6. Next step

Provide the above, then Phase B–J can proceed. The `module-08-backend-integration.md` spec and acceptance-ID-to-test mapping are deferred until contracts exist.

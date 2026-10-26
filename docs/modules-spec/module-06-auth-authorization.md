# Module 6 — Authentication, Authorization & Server-Side Decision Boundary

Status: implemented for the **mock backend**. Real decisions remain **unavailable** (fail closed) until the `erp-mcp-bridge` contract is verified.

## 1. Trust boundaries and threat model

| Boundary | Trust |
| --- | --- |
| Browser | Untrusted. Cannot choose `actorId`, role, tenant, permission or status. |
| Next.js server (proxy, Route Handlers = BFF) | Trusted to resolve the session and enforce the BFF policy. |
| Backend (`erp-mcp-bridge`) | Must authorize independently. **Not verified.** |

Threats considered: unauthenticated access, forged actor/role/tenant in the request, privilege escalation by a read-only user, cross-tenant read/decision and resource enumeration, CSRF on decisions, open redirect on login, session tampering/expiry, duplicate decisions on retry, mock mode leaking into a real deployment, secrets reaching the client.
Not covered (see §11): backend-side enforcement, JWT revocation, rate limiting, real IdP behavior, a formal security audit (**none was performed**).

## 2. Identities (not interchangeable)

1. **Auth.js session** — encrypted JWT in an HttpOnly cookie; proves a login happened.
2. **Application user** — `Principal.userId` (JWT `sub`).
3. **Tenant membership and role** — `tenantIds`, `role` from validated claims (`sessionClaimsSchema`).
4. **Backend identity** — what `erp-mcp-bridge` sees. The BFF sends `actorId = principal.userId`; how the bridge authenticates the BFF and trusts the actor is **unknown**.

Code: `src/lib/auth/principal.ts` (`resolvePrincipal`, `Principal`, `AuthResult`), `policy.ts`, `options.ts`.

## 3. Authentication and session strategy

- Auth.js **v4** (`next-auth@4.24.15`, already installed; peers allow Next 16/React 19; not upgraded).
- **JWT strategy** (no database exists). Lifetime 8 h (`SESSION_MAX_AGE_SECONDS`). A JWT cannot be revoked server-side before expiry; `getToken` also allows ~15 s clock tolerance.
- Cookie: HttpOnly, SameSite=Lax (Auth.js defaults), `Secure` + `__Secure-` name when `APP_URL` is https. Nothing is stored in web storage (test SECURITY-002).
- `resolvePrincipal` reads **only the cookie** (an `Authorization: Bearer` header is ignored). No secret, bad/expired/tampered cookie or malformed claims → unauthenticated.
- Providers: optional OIDC (all of `AUTH_OIDC_ISSUER|CLIENT_ID|CLIENT_SECRET`; **assumed** claims `app_role`, `app_tenants`, validated) and a **dev/test credentials provider** (users `reviewer`, `viewer`, `main-reviewer`; password `AUTH_DEV_PASSWORD`) only when mock mode is on. With neither, nobody can sign in.
- Redirects: `safeCallbackPath` + Auth.js `redirect` callback allow only same-origin relative paths; `/login` and `/api/auth/*` are never redirect targets. `NEXTAUTH_URL` is pinned to `APP_URL`.
- Sign-out: Auth.js `signOut` (POST with CSRF token) clears the cookie.

## 4. Authorization policy (`src/lib/auth/policy.ts`)

| Permission | viewer | reviewer |
| --- | --- | --- |
| `action:view`, `run:view`, `audit:view` | ✔ | ✔ |
| `action:approve`, `action:reject` | ✘ | ✔ |

No hierarchy beyond this; tenant membership is required for any record-level check. The BFF policy is not backend authorization.

## 5. Tenant isolation

- Tenant comes from the record (`targetRecord.tenantId`) compared with the principal's `tenantIds` from the session. A record **without** a tenant is denied.
- Reads: list is scoped by the backend port (`ctx.principal.tenantIds`); the BFF additionally fails closed (502) if a returned item is outside the principal's tenants. Detail and decision return the **same 404** for missing and cross-tenant actions (non-enumeration; timing equality is not guaranteed).
- Client `tenantId` in a request body is rejected by the strict DTO.
- With the real backend, isolation must be enforced there (§10).

## 6. Request flow

```
Browser ──(session cookie, same origin)──▶ proxy.ts (1st layer: redirect pages / 401 API)
  ▶ Route Handler (BFF) src/app/api/actions/**
  ▶ handlers.ts: origin → session(401) → role(403) → content-type/key/strict body(400/415)
     → load action (ActionsBackend) → tenant(404) → idempotent replay → status+recordVersion(409)
     → command {decision, reason, recordVersion, actorId = session user}
  ▶ ActionsBackend: mock (in-memory, mock mode only) | bridge (UNAVAILABLE → 503 decisions_unavailable)
```

Responses are `Cache-Control: no-store`, carry `x-request-id` (inbound id propagated if well-formed), and use the existing `ApiErrorResponse` envelope.

## 7. Decision identity and actor propagation

`ActionDecisionRequest.actorId` (in `contracts.ts`, untouched) is filled by the BFF from the session. The browser DTO (`browserDecisionRequestSchema`) is strict and has no actor, role or tenant field.

## 8. CSRF and cookies

Layers: SameSite=Lax cookie; required matching `Origin` header on decisions (`hasTrustedOrigin`; missing/foreign → 403 `invalid_origin`); JSON content type; Auth.js double-submit CSRF token on its own endpoints; no CORS headers are added. Limitation: relies on browsers sending a truthful `Origin`.

## 9. Idempotency and concurrency

- UI hook keeps one `Idempotency-Key` per logical decision (action+decision+version+reason) while the outcome is unknown, and drops it after a definite outcome. Timeouts never mint a new key and nothing is retried automatically.
- BFF requires the header, scopes replay by `(userId, tenantId, actionId, decision, key)`, rejects key reuse with a different payload (422), and forwards the key.
- `recordVersion` is a separate optimistic-concurrency check.
- **Only the mock backend honors these.** Whether `erp-mcp-bridge` supports idempotency keys, atomic transitions and replay is **unverified**; no exactly-once or duplicate-effect guarantee is claimed. Timeouts/5xx/lost responses surface as `decision_outcome_unknown` (UI: unknown outcome, reconcile by re-reading).

## 10. Confirmed vs proposed contracts

| Item | Status |
| --- | --- |
| `contracts.ts` schemas incl. `ActionDecisionRequest.actorId` | Existing contract |
| `GET /api/actions`, `GET /api/actions/:id`, `POST /api/actions/:id/approve\|reject` (BFF routes) | **Proposed** frontend contracts; BFF side implemented |
| `Idempotency-Key` header, 409 `version_conflict`/`invalid_transition`, 422 `idempotency_key_reuse`, 503 `decisions_unavailable`, 504/502 `decision_outcome_unknown` | **Proposed**, mock-verified only |
| OIDC claims `app_role`, `app_tenants` | **Assumed** |
| Bridge: BFF↔bridge auth, actor/tenant propagation, endpoints, idempotency, atomic transitions, error codes, durable audit | **Unverified — required before enabling real decisions** |

`/api/mock-control` (test control plane) exists only in mock mode, needs a session and a trusted Origin.

Mock mode (`isMockModeEnabled`) = `NEXT_PUBLIC_API_MOCKING=enabled` and, in production builds, also `ALLOW_MOCK_BACKEND_IN_PRODUCTION=true`. There is no runtime fallback from the bridge to the mock. The browser MSW worker was removed; MSW remains for adapter tests (`msw/node`).

## 11. Unresolved security risks

- Backend authorization, tenant enforcement, idempotency and atomicity are not verified; the BFF check is not atomic.
- JWT sessions are not revocable before expiry; no IdP/back-channel logout.
- No rate limiting/lockout on the dev login; dev login is not production authentication.
- OIDC claim mapping is an assumption; no IdP integration was tested.
- BFF logs are console JSON, not a durable audit log; Module 7 owns audit.
- `next` reports a known vulnerability advisory for the installed version (16.4.0); an upgrade was not performed (out of scope).
- No accessibility or penetration testing was done.

## 12. Acceptance criteria and test mapping

| ID | Criterion | Tests |
| --- | --- | --- |
| AUTH-001 | Unauthenticated pages redirect to login; callback is safe; no loop | `src/proxy.test.ts`; `src/lib/auth/policy.test.ts` (safeCallbackPath); `src/lib/auth/options.test.ts` (redirect); `e2e/auth.spec.ts` |
| AUTH-002 | API returns structured 401; invalid/expired/tampered/secret-less sessions fail closed; no leakage | `handlers.test.ts` (AUTH-002 block); `proxy.test.ts`; `e2e/auth.spec.ts` |
| AUTH-003 | Actor comes from the session; forged `actorId` rejected | `handlers.test.ts`; `e2e/auth.spec.ts` |
| AUTHZ-001 | Viewer cannot approve/reject; client role claims ignored | `policy.test.ts`; `handlers.test.ts`; `decision-eligibility-role.test.ts` (UI hint only); `e2e/auth.spec.ts` |
| TENANT-001 | Cross-tenant read/decision denied with non-enumerating 404; list scoped; leak fails closed | `handlers.test.ts`; `policy.test.ts`; `e2e/auth.spec.ts` |
| DECISION-BOUNDARY-001 | Non-pending, stale version, bad body/content type/key rejected server-side | `handlers.test.ts` |
| DECISION-BOUNDARY-002 | Real adapter unavailable; no silent/production mock | `handlers.test.ts`; `options.test.ts`; `actions-service-security.test.ts` |
| SECURITY-001 | Origin check, cookie/session config, Auth.js CSRF | `handlers.test.ts`; `options.test.ts` (secure cookies); `e2e/auth.spec.ts`. Auth.js's own CSRF token is exercised by the E2E sign-in but not unit-tested separately |
| SECURITY-002 | Secrets not in client modules / `NEXT_PUBLIC_*`; no web storage | `options.test.ts` (static source scan — a heuristic, not a bundle audit) |
| IDEMPOTENCY-001 | Stable key per logical decision; replay; key reuse; unknown outcome | `handlers.test.ts`; `actions-service-security.test.ts`; existing Module 5 tests. Backend effect **cannot be verified** without a real backend |

Tests needing a real backend (not possible yet): bridge authorization, atomic transitions, idempotent replay, tenant enforcement, OIDC login against a real IdP.

## 13. Verification commands

`npm run lint`, `npm run typecheck`, `npm test`, `NEXT_PUBLIC_API_MOCKING=enabled npm run build`, then `E2E_SERVER=start npx playwright test` (Playwright sets test-only `AUTH_SECRET`, `AUTH_DEV_PASSWORD`, `ALLOW_MOCK_BACKEND_IN_PRODUCTION`).
For local dev put `NEXT_PUBLIC_API_MOCKING=enabled`, `AUTH_SECRET` (≥ 32 chars) and `AUTH_DEV_PASSWORD` in `.env.local`.

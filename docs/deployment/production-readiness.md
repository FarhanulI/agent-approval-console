# Production Readiness ও Deployment Guide

এই guide বর্তমান console-এর operational contract এবং সীমাবদ্ধতা বর্ণনা করে। এটি কোনো cloud vendor বা undocumented `erp-mcp-bridge` API অনুমান করে না।

## বর্তমান readiness

- Production build-এর জন্য Node.js 22 ব্যবহার করুন (`.nvmrc` অনুসরণ করুন)।
- `next` ও `eslint-config-next` **16.4.5**, Zod **4.6.6**, এবং lockfile-এর transitive `fast-uri` **3.1.9** security patch level-এ আছে। `npm audit --omit=dev` production dependency audit।
- **Real business deployment এখনো ready নয়:** `erp-mcp-bridge` adapter/contract unavailable; action, decision, audit এবং run data bridge-এর সঙ্গে কাজ করে না।
- Mock mode-এ action/decision/audit/run state memory-তে থাকে, process restart-এ হারায়, এবং multi-instance-এ share হয় না। Decision ও audit write atomic নয়। Mock readiness কখনো real backend readiness বোঝায় না।

## Install, build, start

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm audit --omit=dev
```

Production build-এ `NEXT_PUBLIC_API_MOCKING` enabled করবেন না:

```bash
npm run build
npm run start
```

Build-এ mock flag শুধুমাত্র CI/E2E simulation-এর জন্য ব্যবহার করা হয়; production E2E চালানোর উদাহরণ:

```powershell
$env:NEXT_PUBLIC_API_MOCKING = "enabled"
npm run build
$env:E2E_SERVER = "start"
npx playwright test
```

Production E2E web server-এ test-only credentials এবং mock acknowledgement Playwright configuration সরবরাহ করে। এগুলো real deployment environment-এ কপি করবেন না।

## Environment variables

`.env.example` হলো template; কোনো real secret সেখানে রাখবেন না। Secret কেবল server-side runtime secret store-এ দিন।

| Variable | Requirement | Purpose |
|---|---|---|
| `APP_URL` | Development-এ default `http://localhost:3000`; production-এ HTTPS origin বাধ্যতামূলক | Auth.js callback origin, secure-cookie নির্বাচন, trusted Origin ও metadata base। Credentials/path/query/hash গ্রহণযোগ্য নয়। |
| `AUTH_SECRET` | Runtime-এ বাধ্যতামূলক, কমপক্ষে 32 characters | Auth.js JWT/session encryption। `NEXT_PUBLIC_*`-এ কখনো দেবেন না। |
| `AUTH_OIDC_ISSUER` | Real production authentication-এর জন্য তিনটি OIDC variable একসঙ্গে বাধ্যতামূলক | OpenID Connect issuer URL। |
| `AUTH_OIDC_CLIENT_ID` | OIDC চালু করলে বাধ্যতামূলক | OIDC client identifier। |
| `AUTH_OIDC_CLIENT_SECRET` | OIDC চালু করলে বাধ্যতামূলক, server-side only | OIDC confidential client secret। |
| `AUTH_DEV_PASSWORD` | Development/test mock login-এর জন্য optional; production-এ নয় | Mock mode-এ fixture users-এর shared password। |
| `NEXT_PUBLIC_API_MOCKING` | Development/test-only build/runtime flag; real production-এ unset | Browser adapter-এ mock support এবং server mock selector। `NEXT_PUBLIC_` হওয়ায় এটি secret নয়, কিন্তু production-এ accidentally enable করবেন না। |
| `ALLOW_MOCK_BACKEND_IN_PRODUCTION` | Default unset; production E2E simulation ছাড়া নয় | `NODE_ENV=production`-এ mock backend চালুর অতিরিক্ত server-side acknowledgement। এটি configured backend বা durable data তৈরি করে না। |

`AUTH_OIDC_*`-এর আংশিক configuration readiness-কে fail করে। Production-এ real sign-in-এর জন্য issuer, client ID এবং secret—সবই দিতে হবে। Login page-এর `app_role` ও `app_tenants` claim mapping একটি project assumption; প্রকৃত IdP contract যাচাই না করে deployment করবেন না।

`AUTH_SECRET` অনুপস্থিত/ছোট হলে session resolution fail-closed হয়। `/api/health/ready` configuration status জানায়, কিন্তু secret value বা নির্দিষ্ট অনুপস্থিত variable প্রকাশ করে না। Build-time-এ production secret প্রয়োজন না করে readiness/runtime boundary-তে validation রাখা হয়েছে।

## HTTPS, cookies ও browser policy

- TLS termination trusted ingress-এ করুন এবং application-এ canonical HTTPS `APP_URL` দিন।
- Auth.js session cookie HttpOnly, SameSite=Lax এবং HTTPS origin-এ Secure। `APP_URL` ভুল হলে callback/origin validation ও cookie policy ভুল হবে।
- `next.config.ts` `nosniff`, `Referrer-Policy`, `Permissions-Policy`, frame denial এবং CSP পাঠায়। CSP-তে Next.js bootstrap compatibility-র জন্য inline script/style allowance আছে; resource origins, object, framing, base URI ও form action তবুও সীমিত। এটি nonce-only strict CSP-এর সমতুল্য XSS mitigation নয়। CSP পরিবর্তনের আগে browser/E2E regression করুন।
- HSTS (`max-age=31536000`) কেবল production HTTPS `APP_URL`-এ সক্রিয়; `includeSubDomains`/preload নেই, যাতে অযাচাইকৃত subdomain-এ policy চাপিয়ে না দেওয়া হয়।
- Decision এবং mock-control POST Origin allowlist বিদ্যমান; তা অক্ষুণ্ণ। State-changing API-এর Origin validation সরিয়ে দেবেন না।

## Rate limit ও request size

- Approve/reject-এ authenticated user identity-ভিত্তিক process-local fixed window: প্রতি user-এ 30 request/60 seconds; সীমা ছাড়ালে `429 rate_limited` ও `Retry-After` ফেরত দেয়।
- Counter একটি Node.js process-এর memory-তে থাকে; restart-এ reset হয়, replicas-এর মধ্যে share হয় না এবং distributed abuse protection নয়। Production-এর একাধিক instance-এ edge/API gateway control যোগ না করা পর্যন্ত এটিকে একমাত্র rate limiter ধরে নেবেন না।
- Production login OIDC provider-নির্ভর; authentication brute-force protection এবং account lockout IdP-তে configure করতে হবে। Mock credentials provider শুধু simulation/test boundary, production identity system নয়।
- Decision ও mock-control body 8 KiB সীমার মধ্যে stream করে পড়ে; oversized `Content-Length` আগেই reject হয়, আর header ভুল হলেও stream byte limit কার্যকর থাকে।

## Health ও readiness

দুটি unauthenticated, low-detail endpoint রয়েছে; উভয় response-এ safe `x-request-id` এবং `Cache-Control: no-store` থাকে:

- `GET /api/health/live` — process/HTTP liveness (`200`)। এটি authentication, configuration বা backend readiness প্রমাণ করে না।
- `GET /api/health/ready` — configuration ও বর্তমানে নির্বাচিত backend mode যাচাই করে। Mock configured হলে `mode: "mock"` স্পষ্টভাবে ফেরায়; verified bridge নেই বলে non-mock mode `503 not_ready` ফেরায়। Production mock acknowledgement থাকলেও `mock` response simulation-ই বোঝায়, real integration নয়।

Load balancer-এর liveness check-এ live ব্যবহার করুন। Real workload পাঠানোর আগে readiness success এবং প্রকৃত backend adapter availability—দুটিই নিশ্চিত করুন। এই মুহূর্তে real bridge readiness সফল হবে না।

## Logging ও audit boundary

- Server logger এক লাইনের JSON লিখে: timestamp, level, environment, scope, event এবং allow-listed request/operation metadata। Error message, stack, body, password, cookie, token, API key, evidence excerpt বা business payload log করা হয় না।
- `x-request-id` syntactically valid হলে গ্রহণ করা হয়; অন্যথায় server-generated ID। API response/error-এ ID দেওয়া হয়, যাতে একই ID log search-এ মেলানো যায়। Client ID authentication/authorization-এর বিকল্প নয়।
- stdout/stderr সংগ্রহ এবং retention deployment platform-এর দায়িত্ব; repository কোনো external monitoring vendor যোগ করেনি।
- **Business audit event** হলো decision-এর domain history; **operational log** হলো diagnostics; **security log** হলো denial/limit signal। Mock business audit memory-only, non-durable ও decision write-এর সঙ্গে atomic নয়। Application log কখনো durable audit trail-এর বিকল্প নয়।

## CI

`.github/workflows/ci.yml` PR এবং `main` push-এ `npm ci`, lint, typecheck, unit tests, production dependency audit, mock-enabled production build এবং production-server Playwright suite চালায়। Workflow permission `contents: read`; deploy step বা secret নেই। E2E failure হলে সীমিত retention-এ Playwright output artifact আপলোড হয়।

`npm audit --omit=dev` production runtime dependencies-কে gate করে। Full audit-এ ESLint dependency graph-এর moderate findings থাকতে পারে; suggested fix যদি `eslint-config-next`-কে Next 15-এ downgrade করে, সেটি ব্যবহার করবেন না। Test runner `vitest@4.1.11`-এর dev-only advisory-ও আলাদাভাবে পর্যালোচনা বাকি।

## Deployment verification

1. `npm ci` lockfile দিয়ে clean install করুন।
2. `npm run lint`, `npm run typecheck`, `npm test`, `npm audit --omit=dev` চালান।
3. `npm run build` দিয়ে mock-disabled build করুন।
4. Runtime environment-এ `APP_URL`, `AUTH_SECRET`, সম্পূর্ণ `AUTH_OIDC_*` এবং trusted HTTPS ingress যাচাই করুন।
5. `/api/health/live` `200` এবং `/api/health/ready`-এর status/mode যাচাই করুন; `mock` বা `bridge-unavailable`-কে real integration ধরে নেবেন না।
6. Browser-এ login/callback, Secure cookie, security headers, queue, decision, audit, run timeline ও SSE পুনরায় যাচাই করুন।
7. Structured log-এ `x-request-id` দিয়ে correlation করে নিশ্চিত করুন কোনো secret/evidence/payload নেই।

## Rollback ও অবশিষ্ট ঝুঁকি

- Rollback হলে patched Next.js 16.4.5-এর নিচের release-এ ফিরবেন না; rollback artifact-ও production audit পাস করা release হতে হবে।
- Application restart/rollback-এ in-memory mock decisions, runs ও audit entries হারায়। Durable datastore/atomic decision+audit behavior real backend contract-এর কাজ; এই module তা সমাধান করে না।
- `erp-mcp-bridge` authentication, tenant authorization, idempotency, atomic record-version transition, audit persistence ও SSE replay semantics অযাচাইকৃত। এই UI/BFF checks backend-side authorization-এর বিকল্প নয়।
- Process-local rate limiting horizontal scale-এ কার্যকর shared limit নয়।
- CSP compatibility allowance inline-script injection-এর বিরুদ্ধে strict nonce-only policy দেয় না।
- Runtime logging stdout/stderr-এ; centralized retention/alerting deployment platform-এ configure করতে হবে।

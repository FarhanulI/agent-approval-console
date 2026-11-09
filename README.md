# Agent Approval Console

A human-supervision console for reviewing and monitoring AI agent actions. See [the product architecture](./docs/product-architecture.md) for the domain, integration boundaries, and implementation sequence.

## Project foundation

```bash
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Copy `.env.example` to `.env.local` and configure `AUTH_SECRET`; to run the mock demo, also set `NEXT_PUBLIC_API_MOCKING=enabled` and `AUTH_DEV_PASSWORD`.

## Checks

```bash
npm run lint
npm run typecheck
npm test
npm audit --omit=dev
npm run build
```

Production configuration, readiness semantics, security boundaries, CI, and known deployment blockers are documented in [the production readiness guide](./docs/deployment/production-readiness.md).

## Stack

Next.js App Router, strict TypeScript, Tailwind CSS, ESLint, and Zod-validated environment configuration. Feature code belongs in `src/features`, shared UI in `src/components`, and routes/layout composition in `src/app`.

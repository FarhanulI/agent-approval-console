# Agent Approval Console

A human-supervision console for reviewing and monitoring AI agent actions. See [the product architecture](./docs/product-architecture.md) for the domain, integration boundaries, and implementation sequence.

## Project foundation

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The `APP_URL` environment variable is optional and defaults to `http://localhost:3000`. To configure it, copy `.env.example` to `.env.local`.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```

## Stack

Next.js App Router, strict TypeScript, Tailwind CSS, ESLint, and Zod-validated environment configuration. Feature code belongs in `src/features`, shared UI in `src/components`, and routes/layout composition in `src/app`.

# Module 3: Application Shell & Design System

## Purpose

Provide the navigation shell, layout primitives, shared UI components and design tokens that all console feature modules build on. This module is visual and navigational only. It does not implement Pending Actions Queue, Action Detail, Live Run Timeline or Audit Log workflows.

## Scope

**In scope**
- Sidebar navigation (desktop) and drawer navigation (mobile).
- Console layout with landmarks and a consistent content area.
- `PageHeader` with title, description, breadcrumbs and actions slot.
- Design tokens (colour, typography, transition, shadow) on the existing Tailwind v4 setup.
- Shared primitives: `Button`, `IconButton`, `Badge`, `Card`, `Input`, `Select`, `Breadcrumb`, `Skeleton`, `EmptyState`, `ErrorState`, `LoadingState`, `Dialog`.
- Unit/component tests and a shell-level Playwright E2E test.

**Out of scope**
- Business workflows, data fetching, authentication/authorization, user menu, notifications, environment indicator, Settings page, desktop sidebar collapse, theme switching.

## Constraints

- Do not change domain types, Zod schemas, API DTOs, service interfaces, endpoints, fixtures or MSW handler contracts (Module 2).
- Server Components by default; `'use client'` only where interaction needs it (`NavLinks`, `MobileNav`, `Dialog`).
- No API calls in layout or navigation components. No global state library. No new dependencies.
- Strict TypeScript; no `any`, `@ts-ignore` or blanket lint disables.
- Placeholder pages must be clearly labelled and must not show fabricated data or imply that any action was approved or executed.

## Structure

| Path | Responsibility |
| --- | --- |
| `src/app/(console)/layout.tsx` | Shell composition: `Sidebar`, `MobileNav`, `<main id="main">` |
| `src/components/layout/navigation.ts` | Nav item config and `getNavigationState` |
| `src/components/layout/nav-links.tsx` | Client nav list using `usePathname` (plus static fallback) |
| `src/components/layout/nav-icons.tsx` | Inline SVG icons (no icon library) |
| `src/components/layout/sidebar.tsx` | Desktop sidebar |
| `src/components/layout/mobile-nav.tsx` | Mobile top bar and `<dialog>` drawer |
| `src/components/layout/product-mark.tsx` | Product identity |
| `src/components/layout/page-header.tsx` | Page title area |
| `src/components/ui/*` | Reusable primitives, exported via `index.ts` |
| `src/app/globals.css` | Design tokens |

## Navigation requirements

- Items: Approvals (`/approvals`), Live runs (`/runs`), Audit log (`/audit`). Every link must resolve to a real page; `/runs` is a placeholder index.
- Links use `next/link`. Each has an icon (decorative, `aria-hidden`) and a visible text label.
- Active state is computed from whole path segments:
  - exact match → `aria-current="page"`;
  - nested route (e.g. `/approvals/<id>`) → `aria-current="location"`;
  - shared string prefix without a segment boundary (e.g. `/approvals-archive`) → not active.
- Active state must not rely on colour alone (`aria-current` is exposed; the active item also has a distinct background).
- `NavLinks` is wrapped in `Suspense` because `cacheComponents` is enabled and dynamic-param routes make `usePathname` suspend.

## Responsive behaviour

- `md` and up: fixed-width sidebar (15rem) with sticky positioning; mobile bar hidden.
- Below `md`: top bar with menu `IconButton` (`aria-expanded`, `aria-controls`) opening a native modal `<dialog>` drawer.
  - Closes via Escape, close button, backdrop click and link click.
  - Focus is trapped while open and returns to the trigger on close.
- Content uses a max width of `7xl` with responsive padding; no fixed widths that cause horizontal page scroll.
- Wide tables are the responsibility of feature modules (wrap in a horizontally scrollable container).

## Accessibility requirements (WCAG 2.2 AA)

- Landmarks: `header`, `nav` (labelled "Primary" and "Breadcrumb"), `aside`, exactly one `main` per page.
- Skip link targets `#main`; `main` has `tabIndex={-1}`.
- One `h1` per page via `PageHeader`; logical heading order below it.
- Icon-only controls require an accessible name (`IconButton` makes `label` mandatory).
- Visible `:focus-visible` outline; reduced-motion media query disables animation.
- Status is never conveyed by colour alone: badges carry text; state components carry titles/descriptions.
- `LoadingState` uses `role="status"`; `ErrorState` uses `role="alert"`.

## Design tokens

- Colours are CSS custom properties exposed to Tailwind through `@theme inline`: canvas, surface, line, fg tiers, accent, and semantic success/warning/danger/info (solid and soft variants). Existing light theme and `prefers-color-scheme` dark values are preserved.
- Typography roles: `text-title` (page title), `text-heading` (section/card heading), `text-meta` (metadata and timestamps); body and table text use `text-sm`.
- Motion: `--default-transition-duration` 150ms with a single easing curve.
- Shadow: `--shadow-overlay` for overlays only.
- Spacing and radii use the Tailwind scale: `rounded-md` for controls, `rounded-lg` for panels.
- Components must use tokens/utilities, not ad hoc hex values.

## Component contracts

- `Button`: variants `primary | secondary | ghost | danger`, sizes `sm | md | lg`, `loading` (disables and sets `aria-busy`), defaults to `type="button"`, accepts `ref`.
- `IconButton`: `Button` wrapper, required `label` → `aria-label`, square sizing.
- `Input` / `Select`: `invalid` prop sets `aria-invalid`; accept `ref` (for React Hook Form).
- `Badge`: `tone` of `neutral | info | success | warning | danger | accent`.
- `Breadcrumb`: `items: { label, href? }[]`; last item is current page and unlinked.
- `PageHeader`: `title`, optional `description`, `breadcrumbs`, `actions`.
- `EmptyState`, `ErrorState`, `LoadingState`: presentational; content and callbacks come from props. They must not fetch data or implement retry logic.

## Testing

- Unit/component (Vitest, `renderToStaticMarkup`, no new framework): `getNavigationState` rules, nav links and accessible names, `aria-current` on exact and nested routes, `PageHeader` composition, `Breadcrumb`, `Button` variants/disabled/loading, `IconButton` label, `Badge` text, `LoadingState` role.
- E2E (Playwright, `npm run test:e2e`, dev server on port 3100):
  - Desktop 1280px: sidebar links, active route, nested-route active state, navigation, single `main`, single `h1`, mobile trigger hidden.
  - Mobile 375px: drawer opens, Escape closes and restores focus, link click navigates and closes, no horizontal overflow.
- Vitest excludes `e2e/**`.

## Acceptance criteria

- Console routes render inside one consistent, responsive shell with correct landmarks.
- Navigation matches the real route structure; public URLs are unchanged by route groups.
- Primitives are accessible and reusable; tokens drive all colours and typography roles.
- Domain types, schemas, API contracts and service boundaries are unchanged.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and `npm run test:e2e` pass.

## Known limitations

- No automated accessibility tooling (e.g. axe) is configured; contrast was not re-measured.
- Component tests do not exercise interaction (no jsdom); interaction is covered by Playwright.
- Tablet (768px) is not tested separately; it receives the desktop layout at the `md` breakpoint.
- Placeholder pages (`/runs`, and the existing approvals/audit/detail routes) will be replaced by feature modules.

## Next module

Module 4: Pending Actions Queue, built on the service interface and MSW handlers from Module 2 and the primitives from this module.

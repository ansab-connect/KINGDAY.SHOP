# Decision log

## 2026-11-13 — Rebuild from scratch, archive the legacy app

The working folder held only `.git`. The previous Vite + Express + Prisma (Neon) app
was still in git history, deleted from the working tree but not committed.
It is preserved, not lost:

- branch `legacy/v1-vite-express` and tag `legacy-v1` → commit `cb31b2f`

The new platform is built on `main`. Recover any legacy file with
`git show legacy-v1:<path>`.

## 2026-11-13 — Cloudflare adapter: OpenNext (`@opennextjs/cloudflare`)

Cloudflare's Next.js guide (Nov 2026) now promotes **vinext**, a Vite reimplementation
of the Next.js API that is still in beta. OpenNext still supports all Next.js 16 minors
on the Node.js runtime, including App Router, Route Handlers, SSR/SSG/ISR, `'use cache'`
and image optimisation through Cloudflare Images. We chose OpenNext because it runs the
real Next.js build, which matters for a production store.

- Requires `next >=16.4.5` (pinned 16.4.6) and the Node.js runtime. Do not use `runtime = "edge"`.
- OpenNext does not guarantee full Windows support. Use `next dev` locally. Production
  builds and deploys should run on Linux (GitHub Actions or WSL).
- Node-runtime Proxy (`proxy.ts`) support must be verified on Workers before Phase 4 relies on it.
  The fallback is to authorise in layouts and server actions, which we do anyway.

## 2026-11-13 — Cache Components enabled

This is the Next.js 16.4 default. Pages prerender a static shell, and anything that reads the
request (cookies, session) must sit inside `<Suspense>`. Admin and account pages follow this pattern.

## 2026-11-13 — No chart library

Dashboard charts are small hand-written SVG components. This avoids a dependency
(Recharts is ~100 KB) for a few simple charts. We will revisit this if analytics needs grow.

## 2026-11-13 — Storefront on preview catalogue, instant navigation

- The storefront reads from `src/features/catalog/queries.ts`. For now that module serves a
  fictional preview catalogue. In Phase 5 its function bodies switch to Supabase, and the
  page code stays as it is. A banner on every storefront page states that the data is sample
  data while `NEXT_PUBLIC_USE_PREVIEW_DATA` is not `false`.
- Product structured data omits `aggregateRating` in preview mode, so sample ratings are never
  published to search engines.
- Dynamic routes (`/products/[slug]`, `/categories/[slug]`, `/policies/[slug]`) use a
  synchronous page that passes the `params` promise into an async child wrapped in `<Suspense>`.
  This is the documented Next.js 16 pattern for instant navigation with Cache Components.
- Filters use plain GET forms (they work without JavaScript), with a small client helper that
  auto-submits when a control changes.
- Cart, checkout, account, wishlist and policy pages are honest placeholders until their phases.
  Policy text must be written and approved by KING DAY.

## 2026-11-13 — Phase 4: Supabase schema, RLS and auth

- **Migrations** live in `supabase/migrations` (9 files). `supabase/seed.sql` holds reference data only.
  `npm run test:db` applies every migration to an in-memory Postgres 17 (PGlite) with small
  Supabase stand-ins (`supabase/tests/supabase-stubs.sql`), then runs 41 checks against the
  security rules and business rules. No Docker is needed.
- **Business rules are enforced in the database, not only in the app:**
  - unique SKU per variant, and price ≤ MRP
  - stock that can't go negative: `adjust_stock()` locks the row, and an append-only ledger records every change
  - price snapshots on order items
  - fixed order totals, which must add up correctly
  - allowed order-status transitions, logged to history
  - payment status settable only by the service role (staff may record COD collection)
  - reviews forced to "pending" until moderated
  - coupons never readable by customers
- **Cost prices** live in `variant_costs`, a separate staff-only table, because RLS works on rows, not columns.
- **Session refresh:** `src/proxy.ts`, as Supabase recommends for Next 16, limited by a matcher to
  routes that use the session. OpenNext 1.20.15+ bundles Node-runtime proxies. Open issue #1373
  (large proxy bundles) must be checked against the Workers size limit in Phase 12. If it's
  too big, the proxy can be removed: authorisation never depends on it.
- **Authorisation happens in each page, not only the layout.** A production check showed that a
  check in the admin layout alone still let page content be rendered and sent, because Next.js
  renders layouts and pages independently. Every admin page is wrapped in `<StaffOnly>`, server
  actions use `assertStaff()`, and RLS enforces the same rules a third time.
- **No Supabase keys:** the admin is open with a banner only under `next dev`. Any production build
  without keys shows "Admin unavailable" and sends no data.
- **Auth links** use `/auth/confirm` with token-hash email templates, so a link opened on another
  device still works. PKCE `code` links are also accepted.

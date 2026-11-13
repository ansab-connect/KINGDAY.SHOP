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

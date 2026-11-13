# KING DAY — kingday.shop

**Every child deserves a royal ride.**

A custom e-commerce and business platform for KING DAY, a store for premium kids'
lifestyle and mobility products: electric jeeps and cars, bikes, scooters, tricycles,
cycles, toys and baby accessories.

- Customer website: `/`
- Admin panel: `/admin`

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/DECISIONS.md](docs/DECISIONS.md) and [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).

## Requirements

- Node.js ≥ 20.9 (developed on 24.x), npm ≥ 10

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in values as each phase needs them
npm run dev                  # http://localhost:3000
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production Next.js build |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript checks |
| `npm run preview` | Build with OpenNext and run locally in the Workers runtime (`.dev.vars`) |
| `npm run deploy` | Build and deploy to Cloudflare Workers (requires approval, not yet configured) |
| `npm run cf-typegen` | Generate `cloudflare-env.d.ts` binding types |
| `npm test` | Unit tests (validation schemas, catalogue mapping) |
| `npm run test:db` | Apply all migrations to a local Postgres and run the RLS/business-rule checks |

## Environment & secrets

- Copy `.env.example` → `.env.local` for development, and `.dev.vars.example` → `.dev.vars` for Workers preview.
- Never commit `.env*` or `.dev.vars`. Both are git-ignored.
- In production, set secrets with `npx wrangler secret put NAME`.

## Roadmap

1. Foundation ✅ · 2. Admin panel UI ✅ · 3. Storefront UI ✅ · 4. Supabase (schema, RLS, auth, storage) ✅ ·
5. Products · 6. Inventory · 7. Customers · 8. Cart/Checkout/Razorpay/COD · 9. Orders ·
10. Analytics · 11. Security & testing · 12. Deployment

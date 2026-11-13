# KING DAY — Architecture

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Components, Server Actions, Route Handlers, Cache Components) |
| Language | TypeScript (strict) |
| UI | Tailwind CSS v4, shadcn/ui (Radix base), Lucide icons |
| Database / Auth / Storage | Supabase (PostgreSQL + RLS, Auth, Storage), from Phase 4 |
| Payments | Razorpay, from Phase 8 |
| Hosting | Cloudflare Workers via `@opennextjs/cloudflare` |

## Folder structure

```
src/
  app/
    (store)/           customer website (Phase 3), its own layout
    admin/             admin panel, its own layout (sidebar + header)
    api/               route handlers (webhooks, e.g. Razorpay)
    layout.tsx         root layout: fonts, metadata, providers
    globals.css        design tokens (KING DAY palette → shadcn semantic tokens)
  components/
    ui/                shadcn/ui primitives (generated, lightly themed)
    brand/             logo and brand elements
    admin/             admin-only composite components
    store/             storefront-only composite components
  config/              site config, navigation, constants
  features/<module>/   one folder per business module:
                       products, inventory, orders, customers, coupons,
                       analytics; later purchases, pos, wholesale, reports
                       Each holds types, queries (server-only), actions
                       (server actions), and module components.
  lib/                 cross-cutting helpers (formatting, supabase clients, utils)
supabase/
  migrations/          version-controlled SQL migrations (Phase 4)
docs/                  architecture and decision records
```

Modules depend on `lib/` and `components/ui`, never on each other's internals. POS,
wholesale and purchases can then be added as new `features/*` folders and new
`admin/*` routes, without rewriting existing ones.

## Core rules (enforced from Phase 4 onward)

- Money is stored as integer **paise**. Prices are always recomputed on the server.
- Every sellable variant has a unique SKU. Stock lives per variant, and every change writes a `stock_movements` row.
- Order items snapshot the product name, SKU and unit price at purchase time.
- Stock is decremented inside a transaction with row locks, so items cannot be oversold.
- Payment status changes only after server-side Razorpay signature/webhook verification.
- RLS is enabled on every table. Customers can only read their own rows. Admin access is checked server-side against `user_roles`.
- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, …) are server-only and never prefixed `NEXT_PUBLIC_`.

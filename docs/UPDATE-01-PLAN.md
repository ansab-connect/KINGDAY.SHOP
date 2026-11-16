# KING DAY — Update 01: Phase 01 audit and plan

Audit date: 2026-11-17. Baseline: `main` @ e486e05, 25/25 unit tests pass, type check clean.
Stack confirmed: Next.js 16.4 (App Router, `src/proxy.ts`), React 19.3, Supabase (Auth + RLS + Storage),
Tailwind v4 + shadcn/ui, hosted on Vercel (www.kingday.in). 20 migrations, all applied live.

## 1. What already exists (reuse, don't rebuild)

| Area | Already built | Gap vs Update 01 |
|---|---|---|
| Roles | `app_role` enum: super_admin, admin, staff, service_staff, customer. `user_roles`, `role_permissions`, `user_permissions`, `private.can()`, `my_permissions()`, primary super admin protected by trigger. Server gates: `requireStaff`, `requireTeam`, `assertCan`. | Staff "designations" exist as `staff_categories`. No `/super-admin` area; Super Admin uses `/admin` with `superAdminOnly` links. Permission modules missing: cms, backup, spare_parts, billing, password_resets. |
| Super Admin / Admin | Admin panel with grouped sidebar, users, permissions editor, audit log, settings, staff HR. | Admin account create/deactivate UI to confirm; mobile drawer to verify at 320–430px. |
| Staff | `/staff` dashboard, profile, `/staff/jobs` technician app. | Assigned tasks (non-service), work history, **salary & payroll not built**. |
| Customer account | KD-CUS IDs, unique mobile, addresses, notifications, orders, service history. Login with mobile **or** email + password. | Registration has **no OTP** (owner chose this on 2026-11-14 to avoid SMS cost). |
| Forgot password | Standard Supabase email reset link. | Super Admin approval workflow not built. |
| Carts | `cart_items` (products) and `service_cart_items` in DB, two separate pages `/cart` and `/service-cart`. | Merge into one Cart page with PRODUCTS / SERVICES tabs. |
| Product checkout | **No online checkout.** Cart says "Order on WhatsApp". `orders`/`payments` tables exist (Razorpay + COD enums) but nothing writes them. | Needs a decision (see §3). |
| Service (BEST FIT) | Booking (KD-SB), photos/voice/map, assignment, accept, timeline (`service_job_events`), inspections, invoices (KD-SI) with print/PDF/WhatsApp, reminders, push. | Categories/types **hardcoded** in `features/service/constants.ts`. Statuses are field-visit style (on the way, reached…), not inspection-first. Preferred date asked up front. No BEST FIT landing page, no spare parts, no replaced-items UI, no bill approval/advance/balance. |
| Inventory | `inventory`, `stock_movements` (append-only ledger), `adjust_stock`. | Spare parts need their own stock (reuse ledger pattern). |
| Products | Editor (426 lines) + free "Smart fill" (rule-based, no paid AI). | Simplify form; AI + web search; new-product form reset; drafts list. |
| Storefront | Home, shop, categories, product page, offers, wishlist, EN/ML switcher, bottom tab bar (Home/Shop/Service/Cart/Account — already matches spec). | Product UI redesign; mobile hero too tall (`HeroArt` crown); Instagram is a placeholder. |
| CMS | `store_settings` key/values only. Policies are **hardcoded placeholders** (4 of the 9 needed). | Pages, policies, blog, banners, footer, SEO tables + editor. |
| Backup / cleanup | Nothing. | Whole module new. |
| PWA | Manifest, service worker, offline page, Web Push. | Role routing bug (below). |

## 2. Bugs found

1. **Staff PWA opens customer page** — root cause: `manifest.ts` has `start_url: "/"`, so every installed app launches on the customer homepage. Also `src/proxy.ts` matcher omits `/staff`, `/service-cart`, `/book-service`, so the session cookie is not refreshed there and an expired token can bounce staff to login. Fix: `start_url: "/launch"` → server route that reads the verified role and redirects (customer → `/account`, staff → `/staff`, admin → `/admin`, super admin → `/super-admin`); add missing paths to the matcher.
2. Policy pages show "being finalised" placeholder text on the live site.
3. Leftover Cloudflare tooling (`@opennextjs/cloudflare`, `wrangler`, deploy scripts) though hosting is Vercel — harmless, clean up later.
4. Service categories/types duplicated in TS constants and DB check constraints — must move to tables before admins can edit them.

## 3. Conflicts that need the owner's decision

| # | Requirement | Conflict | Recommended |
|---|---|---|---|
| A | OTP at registration | You chose no OTP (SMS costs money). | **Email OTP free** now (needs custom SMTP — e.g. Resend/Brevo free tier). Mobile OTP later via MSG91 (~₹0.2/SMS) when you approve the cost. |
| B | Product checkout creates an order | No payment gateway connected. | Phase 1: checkout saves a real order in the DB (COD / pay-on-confirmation) **and** opens WhatsApp. Razorpay later once you have a Razorpay account. |
| C | AI Product Assistant with web search | You replaced paid AI with free Smart fill. Web search + AI needs a paid API key (Claude API, roughly ₹1–3 per product). | Add Claude API with a monthly cap; Smart fill stays as the free fallback. |
| D | Password reset needs Super Admin approval | Customers wait for a human before they can log in again. | Build as asked, with a setting to switch it to automatic later. Proposed password is stored only as a bcrypt hash, applied on approval, expires in 48 h. |
| E | Full database backup | Supabase free plan has no `pg_dump` from Vercel and only 1 GB storage. | App-level JSON backups (per table, checksummed, AES-encrypted) to a private storage bucket + download; for disaster recovery also turn on Supabase daily backups (Pro, $25/mo) when ready. |
| F | Instagram feed | Meta API needs an Instagram Business account linked to a Facebook Page + Meta app review. | Start with an **Admin-managed gallery** (paste post links, we store thumbnail + link). Switch to the API when the account is ready. |
| G | `/super-admin` route | Super Admin currently shares `/admin`. | Add `/super-admin` for super-admin-only tools (admins, permissions, password resets, backup/restore, system settings); keep the shared `/admin` for business modules. |

**Owner decisions (2026-11-17):** A = keep no OTP · B = save order + WhatsApp (Razorpay later) ·
C = free only, improve Smart fill, no web search · F = Admin-managed gallery. D, E, G = recommended option.

## 4. Phase plan (each phase: build → tests/build → commit → push only with your OK)

| Phase | Work | New migration(s) |
|---|---|---|
| 02 Roles & permissions | New permission modules (cms, backup, spare_parts, billing, password_resets, payroll); `/launch` role router; proxy matcher fix (PWA bug). | 0021 |
| 03 Super Admin | `/super-admin` area: admin accounts, permissions, system settings. | — |
| 04 Admin | Permission-driven nav, mobile drawer check at 320–430px. | — |
| 05 Staff | Tasks, work history, salary structures, payroll runs, payslips (own-only RLS). | 0022 |
| 06 Customer & carts | Tabbed Cart (Products/Services); product checkout → order (per decision B); separate order/service histories. | 0023 |
| 07 Login & passwords | OTP registration (per A); reset requests + Super Admin approval page; session revoke. | 0024 |
| 08 BEST FIT booking | Landing page with DB-driven options; inspection-first flow, date optional. | 0025 |
| 09 Service backend | Categories/sub-categories, service items, service types tables (seeded from current constants); new statuses mapped onto existing records. | 0026 |
| 10 Spare parts | Master list, stock ledger, staff Replaced Items picker, custom items + approval. | 0027 |
| 11 Service billing | Extend `service_invoices`: spare parts, additional, tax, advance, balance, approval, history. | 0028 |
| 12 Backup | Data overview (real counts), full + section backups, restore with preview/conflict check/safety backup. | 0029 |
| 13 Cleanup | Retention settings, cleanup preview, archive, scheduled job, health report. | 0030 |
| 14 AI product add | Simplified form, AI + web search with sources (per C), fresh-form reset, drafts. | — |
| 15 Product display | Cards, listing, filters, product page redesign (URLs unchanged). | maybe reviews |
| 16 CMS | Pages, 9 policies, blog, banners, footer, SEO with sanitised rich text. | 0031 |
| 17 Home & Instagram | Compact mobile hero, category grid from DB, Royal Moments (per F). | — |
| 18 Mobile UI/UX | 320→desktop sweep of every page. | — |
| 19 PWA | Remaining role/session checks, install shortcuts per role. | — |
| 20 Capacitor readiness | Audit report only (SSR, server actions, auth deep links, push). No conversion. | — |
| 21 Security & testing | RLS tests per role, backup/restore, checkout, booking, billing, regression. | — |

All migrations are additive (new tables/columns/enum values, no drops). Existing records, IDs and URLs stay.

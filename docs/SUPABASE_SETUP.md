# Supabase setup (Phase 4)

These steps connect KING DAY to a Supabase project. Everything in the database
(tables, rules, buckets) comes from the files in `supabase/`; do not create tables by hand.

## Current project

- Project: `kingday-shop` · region South Asia (Mumbai) `ap-south-1` · ref `dfvealcuylvqazonqzys`
- Database setup applied 2026-11-13 (all migrations + seed); redirect URLs configured.

## 1. Create the project

1. Create a project at supabase.com (region: Mumbai `ap-south-1` is closest to customers in India).
2. Save the database password in your password manager.

## 2. Add the keys locally

In **Project Settings → API**, copy these values into `.env.local`. That file is git-ignored, so never commit it.

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
SUPABASE_SERVICE_ROLE_KEY=<service_role / secret key>   # server only
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## 3. Apply the migrations

Use either method.

**A. Supabase CLI (recommended)**

```bash
npx supabase@latest login
npx supabase@latest link --project-ref <project-ref>
npx supabase@latest db push
```

Then run `supabase/seed.sql` once, in the SQL editor or with `psql`. It contains reference data only: categories and default settings.

**B. SQL editor.** Paste each file from `supabase/migrations/` in filename order, then `supabase/seed.sql`.

## 4. Auth settings (Dashboard → Authentication)

- **URL configuration**
  - Site URL: `http://localhost:3000` (later `https://kingday.shop`).
  - Redirect URLs: add `http://localhost:3000/auth/confirm` and `https://kingday.shop/auth/confirm`.
- **Email templates.** Supabase only allows editing templates once custom SMTP is set up (planned for launch,
  Phase 12). Until then the default templates are used: their links carry a PKCE `code`, which
  `/auth/confirm` already handles. Limitation: the link must be opened **in the same browser** used to
  sign up or request the reset. After SMTP is configured, switch to the token-hash templates below,
  which work on any device.
  - Confirm signup:
    `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/account`
  - Reset password:
    `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery`
- **Providers → Email.** Keep "Confirm email" turned on.
- **Email delivery.** The built-in sender has low rate limits. Configure SMTP before launch (Phase 12).

## 5. Create the first Super Admin

1. Register normally at `/register` and confirm the email.
2. In the SQL editor (which runs as the project owner), run:

```sql
insert into public.user_roles (user_id, role)
select id, 'super_admin' from auth.users where email = 'owner@example.com'
on conflict do nothing;
```

After that, staff and admin roles are granted from inside the database by a super admin. RLS allows only super admins to change roles.

## 6. Verify

```bash
npm run test:db   # migrations + 41 security checks against a local Postgres (no Docker)
npm run dev       # /admin now requires a staff login
```

## Roles

| Role | Can do |
| --- | --- |
| customer | Their own profile, addresses, orders (read), wishlist, reviews |
| staff | Catalogue, inventory adjustments, order status, shipments, view customers |
| admin | Everything staff can do, plus coupons, settings, suppliers, purchase orders, deletes, cost prices |
| super_admin | Everything admin can do, plus granting and revoking roles |

The browser can never create orders, set payment status, change prices on existing
orders, move stock directly or read coupons. Those operations run on the server with
the service-role key, after re-validation, and are enforced again by database triggers.

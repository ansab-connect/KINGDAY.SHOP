# KING DAY v2 — ERP, Staff, Payroll & Service roadmap

Built on the existing Next.js 16 + Supabase app (no rebuild). Every phase is
tested, committed locally, and pushed only with the owner's approval (a push deploys).

| # | Phase | Status |
|---|-------|--------|
| 1 | Codebase audit | Done. Brand tokens, RLS, `<StaffOnly>` + `assertStaff` already in place. Roles: super_admin, admin, staff, customer. |
| 2 | Design system + storefront | In progress. Done: canvas background `#F7F6FA`, EN/ML switcher (persisted, no flash), header with all links, homepage/product page/footer in both languages, Highlights removed, SKU hidden publicly. Next: shop, categories, cart, account pages in Malayalam; Book Service button (with phase 7). |
| 3 | Admin ERP redesign | Grouped sidebar with all modules, real-data overview incl. service and staff KPIs. |
| 4 | Roles, accounts, permissions | New role `service_staff`; staff categories table (configurable); auto IDs `KD-STF-0001` / `KD-SRV-0001`; per-page permissions (view/create/edit/delete/approve/export) checked in server actions and RLS; primary super admin `kingdaystore@gmail.com` protected by a DB trigger. |
| 5 | Staff profiles + dashboards | `staff_profiles` (private fields RLS-limited to self + admins); `/staff` dashboard per category. |
| 6 | Salary & payroll | `salary_structures`, `payroll_runs`, `payslips`; private `/staff/salary`; printable slip. |
| 7 | Service booking | `/book-service`; booking IDs; photo + voice upload to private storage; map pin (OpenStreetMap, free) + Google Maps link; order-history product suggestions. |
| 8 | Service staff dashboard | Mobile `/staff/jobs`; assign → accept locks ownership (RLS); timeline with every status change; inspection notes, photos, signature. |
| 9 | Service invoicing | `service_invoices` + items, auto totals, print/PDF via browser, WhatsApp share; default charge in settings. |
| 10 | Inventory + notifications | Stock history, low/out-of-stock alerts, in-app notifications table. |
| 11 | Testing, security, deploy | DB policy tests per role, build, owner approval, push. |

Free-only choices (no paid subscriptions): OpenStreetMap instead of the Google Maps API,
browser print-to-PDF, in-app notifications (email once custom SMTP is set up).

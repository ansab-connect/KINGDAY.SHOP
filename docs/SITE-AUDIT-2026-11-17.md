# KING DAY — live site audit (www.kingday.in, 2026-11-17)

Automated check of 35 live pages (everything in the sitemap, plus cart, checkout,
sign-in, account, BEST FIT, admin, staff and error pages), signed out.
Checked for each page: loads or not, speed, page title and Google description,
main heading, images without alt text, leftover placeholder text, and whether
protected pages stay locked.

## Summary

| Area | Result |
|---|---|
| Pages loading | 34 of 35 loaded first time; `/categories/tricycles` timed out once, then loaded in 1.3 s |
| Security (signed out) | Good: admin, super-admin, staff and account pages all redirect to sign-in; no customer, order, salary or revenue data in their HTML |
| Missing product | Good: `/products/does-not-exist` returns a proper 404 |
| Images | Good: no images without alt text |
| Titles / headings | Good: every public page has a title and one main heading |

## Problems found (most important first)

1. **Almost no products in the store.** The live catalogue has **1 product**
   (TTK EVJ Kids Pobo Jeep 4M), and it is **out of stock**. Most categories
   show "0 products", so Shop, Offers and the category pages look empty.
   *Fix: add products, stock and photos in Admin → Products.*
2. **All policy pages are placeholders.** Shipping, Returns & Refunds, Privacy,
   Terms and the new Warranty page say "This policy is being finalised".
   Customers (and payment providers) expect real policies before ordering.
   *Fix: Phase 16 (policy editor), or send me the text and I'll add it.*
3. **Wrong payment text on the homepage.** The "Why choose us" block says
   "Pay online through Razorpay". Online payment isn't connected; checkout is
   cash on delivery. *Fix: one-line change in `src/config/storefront.ts`.*
4. **"Coming soon" on the Categories page.** Something on `/categories` still says
   "coming soon". *Fix: find and remove it.*
5. **Slow listing pages.** Shop 2.7 s, Bikes 2.4 s, Offers 2.1 s, Book Service 1.8 s
   on first load (the home page is 0.8 s). Probably the catalogue cache refilling
   after the deploy; re-check tomorrow and speed up if still slow.
6. **Generic Google description on several pages.** Cart, checkout, sign-in,
   register, forgot password, wishlist and account reuse the homepage description.
   These pages are hidden from Google anyway, so this is low priority.
7. **Sitemap is missing pages.** BEST FIT (`/book-service`) and the policy pages
   aren't in `sitemap.xml`, so Google finds them more slowly.
8. **Category cards need photos.** Categories have no images set, so the homepage
   shows icons instead of real photos. *Fix: add photos in Admin → Categories.*

## Not checked automatically (needs signed-in accounts)

These need a real login, so test them by hand (or give me a test account):

- Customer: place a cash-on-delivery order, cart → checkout → order page;
  book a BEST FIT service; forgot-password request.
- Admin / Super Admin: approve a password reset; payroll run; spare parts;
  service bill approval; Royal Moments gallery.
- Technician: job steps from inspection to ready for delivery; Replaced Items.
- Your request from today: a signed-in customer must not be asked to sign in
  again on the service portal (expected fixed by the session refresh now
  covering `/book-service`; needs a signed-in test to confirm).
- Phone layout of every page at 320–430 px (only the homepage, shop, cart and
  BEST FIT were checked on a phone-sized screen this session).

## Suggested order

1. Add products, stock and photos (owner task, biggest impact).
2. Fix the Razorpay text and the "coming soon" text (quick).
3. Policy texts (Phase 16).
4. Signed-in tests above, including the service-portal sign-in check.
5. Speed and sitemap fixes.

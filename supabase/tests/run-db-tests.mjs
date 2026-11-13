// Applies every migration + seed to an in-memory Postgres (PGlite) with Supabase
// stand-ins, then checks constraints, business rules and RLS from each role's view.
// Run: npm run test:db
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const db = new PGlite();

let passed = 0;
const failures = [];

async function asSuperuser() {
  await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`);
}
async function as(role, sub) {
  await db.exec(`reset role;`);
  const claims = JSON.stringify(sub ? { sub, role } : { role });
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
  await db.exec(`set role ${role};`);
}
const anon = () => as("anon");
const user = (id) => as("authenticated", id);
const service = () => as("service_role");

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${e.message}`);
  } finally {
    await asSuperuser();
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
async function rows(sql, params = []) {
  return (await db.query(sql, params)).rows;
}
async function expectError(sql, params = [], pattern) {
  try {
    await db.query(sql, params);
  } catch (e) {
    if (pattern && !pattern.test(e.message)) throw new Error(`wrong error: ${e.message}`);
    return;
  }
  throw new Error(`expected an error for: ${sql.slice(0, 90)}`);
}

// ------------------------------------------------------------------ setup
console.log("Applying Supabase stand-ins, migrations and seed…");
await db.exec(readFileSync(join(here, "supabase-stubs.sql"), "utf8"));
const migrations = readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();
for (const file of migrations) {
  try {
    await db.exec(readFileSync(join(root, "migrations", file), "utf8"));
    console.log(`  applied ${file}`);
  } catch (e) {
    console.error(`  FAILED ${file}: ${e.message}`);
    process.exit(1);
  }
}
await db.exec(readFileSync(join(root, "seed.sql"), "utf8"));
console.log("  applied seed.sql\n");

// Fixtures (as superuser, i.e. like the SQL editor)
const [superAdmin, staff, alice, bob] = (
  await rows(`insert into auth.users (email, raw_user_meta_data) values
    ('owner@test.local', '{"full_name":"Owner"}'),
    ('staff@test.local', '{"full_name":"Staff"}'),
    ('alice@test.local', '{"full_name":"Alice"}'),
    ('bob@test.local',   '{"full_name":"Bob"}')
    returning id`)
).map((r) => r.id);
await db.query(`insert into public.user_roles (user_id, role) values ($1, 'super_admin')`, [superAdmin]);
await db.query(`insert into public.user_roles (user_id, role) values ($1, 'staff')`, [staff]);

const catId = (await rows(`select id from public.categories where slug = 'electric-jeeps-cars'`))[0].id;

// ------------------------------------------------------------------ tests
console.log("Users & roles");
await test("new auth user gets a profile and the customer role", async () => {
  const r = await rows(`select p.full_name, array_agg(ur.role) roles from public.profiles p
    join public.user_roles ur on ur.user_id = p.id where p.id = $1 group by p.full_name`, [alice]);
  assert(r[0]?.full_name === "Alice", "profile missing");
  assert(String(r[0].roles).includes("customer"), "customer role missing");
});
await test("customer cannot grant themselves admin", async () => {
  await user(alice);
  await expectError(`insert into public.user_roles (user_id, role) values ($1, 'admin')`, [alice], /row-level security/);
});
await test("staff cannot grant roles", async () => {
  await user(staff);
  await expectError(`insert into public.user_roles (user_id, role) values ($1, 'staff')`, [bob], /row-level security/);
});
await test("super admin can grant staff", async () => {
  await user(superAdmin);
  await db.query(`insert into public.user_roles (user_id, role, granted_by) values ($1, 'staff', $2)`, [bob, superAdmin]);
  await asSuperuser();
  await db.query(`delete from public.user_roles where user_id = $1 and role = 'staff'`, [bob]);
});
await test("customers only see their own profile", async () => {
  await user(alice);
  const r = await rows(`select id from public.profiles`);
  assert(r.length === 1 && r[0].id === alice, `saw ${r.length} profiles`);
});
await test("addresses are private to their owner", async () => {
  await user(alice);
  await db.query(`insert into public.addresses (user_id, full_name, phone, line1, city, state, postal_code, is_default)
    values ($1, 'Alice', '+91 90000 00001', '12 Palace Road', 'Kochi', 'Kerala', '682001', true)`, [alice]);
  await expectError(`insert into public.addresses (user_id, full_name, phone, line1, city, state, postal_code)
    values ($1, 'X', '+91 90000 00002', 'Somewhere', 'Kochi', 'Kerala', '682001')`, [bob], /row-level security/);
  await user(bob);
  assert((await rows(`select * from public.addresses`)).length === 0, "bob can see alice's address");
});
await test("invalid PIN code is rejected", async () => {
  await user(alice);
  await expectError(`insert into public.addresses (user_id, full_name, phone, line1, city, state, postal_code)
    values ($1, 'Alice', '+91 90000 00001', 'Road 1', 'Kochi', 'Kerala', '012345')`, [alice], /check constraint/);
});

console.log("Catalogue");
let productId, variantId;
await test("staff can create a product and variant; inventory row is created", async () => {
  await user(staff);
  productId = (await rows(`insert into public.products (name, slug, category_id, status)
    values ('Test Jeep', 'test-jeep', $1, 'draft') returning id`, [catId]))[0].id;
  variantId = (await rows(`insert into public.product_variants (product_id, sku, name, mrp, price, is_default)
    values ($1, 'KD-TEST-001', 'Red', 2899900, 2349900, true) returning id`, [productId]))[0].id;
  const inv = await rows(`select on_hand from public.inventory where variant_id = $1`, [variantId]);
  assert(inv[0]?.on_hand === 0, "inventory row missing");
});
await test("duplicate SKU is rejected", async () => {
  await user(staff);
  await expectError(`insert into public.product_variants (product_id, sku, mrp, price) values ($1, 'KD-TEST-001', 100, 100)`, [productId], /duplicate key/);
});
await test("selling price above MRP is rejected", async () => {
  await user(staff);
  await expectError(`insert into public.product_variants (product_id, sku, mrp, price) values ($1, 'KD-TEST-002', 100, 200)`, [productId], /price_le_mrp/);
});
await test("draft products are hidden from the public", async () => {
  await anon();
  assert((await rows(`select id from public.products where slug = 'test-jeep'`)).length === 0, "draft visible");
  assert((await rows(`select id from public.categories`)).length === 7, "categories not readable");
  await user(staff);
  await db.query(`update public.products set status = 'active' where id = $1`, [productId]);
  await anon();
  assert((await rows(`select id from public.products where slug = 'test-jeep'`)).length === 1, "active product not visible");
  assert((await rows(`select id from public.product_variants where id = $1`, [variantId])).length === 1, "variant not visible");
});
await test("customers cannot modify the catalogue", async () => {
  await user(alice);
  const r = await rows(`update public.product_variants set price = 100 where id = $1 returning id`, [variantId]);
  assert(r.length === 0, "customer changed a price");
});
await test("cost prices are visible to staff only", async () => {
  await user(superAdmin);
  await db.query(`insert into public.variant_costs (variant_id, cost_price) values ($1, 1500000)`, [variantId]);
  await anon();
  assert((await rows(`select * from public.variant_costs`)).length === 0, "anon sees cost");
  await user(alice);
  assert((await rows(`select * from public.variant_costs`)).length === 0, "customer sees cost");
  await user(staff);
  assert((await rows(`select * from public.variant_costs`)).length === 1, "staff cannot see cost");
});

console.log("Inventory");
await test("staff stock in / out updates balance and writes the ledger", async () => {
  await user(staff);
  await db.query(`select public.adjust_stock($1, 10, 'stock_in', 'Supplier delivery')`, [variantId]);
  const r = await rows(`select public.adjust_stock($1, -3, 'stock_out', 'Damaged') as bal`, [variantId]);
  assert(r[0].bal === 7, `balance ${r[0].bal}`);
  const m = await rows(`select quantity, balance_after, created_by from public.stock_movements where variant_id = $1 order by id`, [variantId]);
  assert(m.length === 2 && m[1].balance_after === 7 && m[1].created_by === staff, "ledger wrong");
});
await test("stock can never go negative", async () => {
  await user(staff);
  await expectError(`select public.adjust_stock($1, -50, 'stock_out', 'oops')`, [variantId], /insufficient stock/);
});
await test("staff cannot record sales directly", async () => {
  await user(staff);
  await expectError(`select public.adjust_stock($1, -1, 'sale')`, [variantId], /order system only/);
});
await test("customers cannot adjust stock", async () => {
  await user(alice);
  await expectError(`select public.adjust_stock($1, 100, 'stock_in')`, [variantId], /not authorized/);
});
await test("anonymous users cannot call adjust_stock at all", async () => {
  await anon();
  await expectError(`select public.adjust_stock($1, 100, 'stock_in')`, [variantId], /permission denied/);
});
await test("the stock ledger is append-only", async () => {
  await asSuperuser();
  await expectError(`update public.stock_movements set quantity = 999`, [], /append-only/);
});
await test("customers cannot write inventory directly", async () => {
  await user(alice);
  const r = await rows(`update public.inventory set on_hand = 999 returning variant_id`);
  assert(r.length === 0, "customer changed inventory");
});

console.log("Orders & payments");
let aliceOrder, codOrder;
await test("service role creates an order with price snapshots", async () => {
  await service();
  aliceOrder = (await rows(`insert into public.orders (user_id, customer_name, customer_phone, shipping_address,
      payment_method, subtotal, grand_total)
    values ($1, 'Alice', '+91 90000 00001', '{"city":"Kochi"}', 'razorpay', 2349900, 2349900) returning id, order_number`, [alice]))[0];
  await db.query(`insert into public.order_items (order_id, product_id, variant_id, product_name, sku, mrp, unit_price, quantity, line_total)
    values ($1, $2, $3, 'Test Jeep', 'KD-TEST-001', 2899900, 2349900, 1, 2349900)`, [aliceOrder.id, productId, variantId]);
  codOrder = (await rows(`insert into public.orders (user_id, customer_name, customer_phone, shipping_address,
      payment_method, subtotal, grand_total, status)
    values ($1, 'Bob', '+91 90000 00002', '{"city":"Pune"}', 'cod', 100000, 100000, 'confirmed') returning id`, [bob]))[0];
  assert(/^KD\d{6}$/.test(aliceOrder.order_number), `order number ${aliceOrder.order_number}`);
});
await test("inconsistent totals are rejected", async () => {
  await service();
  await expectError(`insert into public.orders (customer_name, customer_phone, shipping_address, payment_method, subtotal, grand_total)
    values ('X Y', '+91 90000 00009', '{}', 'cod', 1000, 900)`, [], /total_consistent/);
});
await test("line total must equal price × quantity", async () => {
  await service();
  await expectError(`insert into public.order_items (order_id, product_name, sku, mrp, unit_price, quantity, line_total)
    values ($1, 'X', 'KD-X-1', 100, 100, 2, 150)`, [aliceOrder.id], /line_total/);
});
await test("customers cannot create orders", async () => {
  await user(alice);
  await expectError(`insert into public.orders (user_id, customer_name, customer_phone, shipping_address, payment_method, subtotal, grand_total)
    values ($1, 'Alice', '+91 90000 00001', '{}', 'cod', 1, 1)`, [alice], /row-level security|permission denied/);
});
await test("customers see only their own orders and items", async () => {
  await user(alice);
  assert((await rows(`select id from public.orders`)).length === 1, "alice order visibility wrong");
  assert((await rows(`select id from public.order_items`)).length === 1, "alice items visibility wrong");
  await user(bob);
  const r = await rows(`select id from public.orders`);
  assert(r.length === 1 && r[0].id === codOrder.id, "bob sees other orders");
  await anon();
  await expectError(`select id from public.orders`, [], /permission denied|row-level/).catch(async () => {
    assert((await rows(`select id from public.orders`)).length === 0, "anon sees orders");
  });
});
await test("customers cannot mark their order paid", async () => {
  await user(alice);
  const r = await rows(`update public.orders set payment_status = 'paid' where id = $1 returning id`, [aliceOrder.id]);
  assert(r.length === 0, "customer updated payment status");
  await expectError(`insert into public.payments (order_id, provider, amount, status) values ($1, 'razorpay', 1, 'paid')`, [aliceOrder.id]);
});
await test("staff cannot set Razorpay payment status", async () => {
  await user(staff);
  await expectError(`update public.orders set payment_status = 'paid' where id = $1`, [aliceOrder.id], /payment verification/);
});
await test("staff can record COD collection", async () => {
  await user(staff);
  const r = await rows(`update public.orders set payment_status = 'paid' where id = $1 returning payment_status`, [codOrder.id]);
  assert(r[0]?.payment_status === "paid", "COD not marked paid");
});
await test("staff cannot change order totals", async () => {
  await user(staff);
  await expectError(`update public.orders set grand_total = 1, subtotal = 1 where id = $1`, [aliceOrder.id], /cannot be changed/);
});
await test("order status follows allowed transitions and is logged", async () => {
  await user(staff);
  await db.query(`update public.orders set status = 'confirmed' where id = $1`, [aliceOrder.id]);
  await expectError(`update public.orders set status = 'delivered' where id = $1`, [aliceOrder.id], /invalid order status/);
  const h = await rows(`select from_status, to_status from public.order_status_history where order_id = $1 order by id`, [aliceOrder.id]);
  assert(h.length === 2 && h[1].to_status === "confirmed", `history ${JSON.stringify(h)}`);
});
await test("service role records a verified payment", async () => {
  await service();
  await db.query(`insert into public.payments (order_id, provider, provider_payment_id, amount, status, signature_verified)
    values ($1, 'razorpay', 'pay_test_1', 2349900, 'paid', true)`, [aliceOrder.id]);
  await db.query(`update public.orders set payment_status = 'paid' where id = $1`, [aliceOrder.id]);
  await user(alice);
  assert((await rows(`select status from public.payments`))[0]?.status === "paid", "alice cannot see payment");
});
await test("deleting a product keeps order item snapshots", async () => {
  await asSuperuser();
  const p2 = (await rows(`insert into public.products (name, slug, category_id) values ('Gone', 'gone', $1) returning id`, [catId]))[0].id;
  await service();
  await db.query(`insert into public.order_items (order_id, product_id, product_name, sku, mrp, unit_price, quantity, line_total)
    values ($1, $2, 'Gone', 'KD-GONE-1', 500, 500, 1, 500)`, [codOrder.id, p2]);
  await user(superAdmin);
  await db.query(`delete from public.products where id = $1`, [p2]);
  await asSuperuser();
  const r = await rows(`select product_id, product_name from public.order_items where sku = 'KD-GONE-1'`);
  assert(r[0].product_id === null && r[0].product_name === "Gone", "snapshot lost");
});

console.log("Marketing");
await test("coupons are hidden from customers and anonymous users", async () => {
  await user(superAdmin);
  await db.query(`insert into public.coupons (code, type, value) values ('ROYAL10', 'percentage', 10)`);
  await user(alice);
  assert((await rows(`select * from public.coupons`)).length === 0, "customer sees coupons");
  await anon();
  assert((await rows(`select * from public.coupons`)).length === 0, "anon sees coupons");
});
await test("percentage coupons above 90% are rejected", async () => {
  await user(superAdmin);
  await expectError(`insert into public.coupons (code, type, value) values ('FREE', 'percentage', 100)`, [], /percentage_range/);
});
await test("customer reviews always start as pending and are hidden until approved", async () => {
  await user(alice);
  const r = await rows(`insert into public.reviews (product_id, user_id, rating, title, status)
    values ($1, $2, 5, 'Great', 'approved') returning status`, [productId, alice]);
  assert(r[0].status === "pending", "self-approved");
  await anon();
  assert((await rows(`select * from public.reviews`)).length === 0, "pending review public");
  await user(staff);
  await db.query(`update public.reviews set status = 'approved' where user_id = $1`, [alice]);
  await anon();
  assert((await rows(`select * from public.reviews`)).length === 1, "approved review hidden");
});
await test("wishlists are private", async () => {
  await user(alice);
  const w = (await rows(`insert into public.wishlists (user_id) values ($1) returning id`, [alice]))[0].id;
  await db.query(`insert into public.wishlist_items (wishlist_id, product_id) values ($1, $2)`, [w, productId]);
  await user(bob);
  assert((await rows(`select * from public.wishlist_items`)).length === 0, "bob sees alice's wishlist");
  await expectError(`insert into public.wishlist_items (wishlist_id, product_id) values ($1, $2)`, [w, productId], /row-level security/);
});

console.log("Settings & purchasing");
await test("only public settings are visible to customers", async () => {
  await anon();
  const keys = (await rows(`select key from public.store_settings`)).map((r) => r.key);
  assert(keys.includes("store.name") && !keys.includes("checkout.cod_max_order_value"), `anon keys ${keys}`);
});
await test("suppliers are admin-only", async () => {
  await user(staff);
  await expectError(`insert into public.suppliers (name) values ('Acme Toys')`, [], /row-level security/);
  await user(superAdmin);
  await db.query(`insert into public.suppliers (name) values ('Acme Toys')`);
});

console.log("Storage");
await test("customers can upload only into their own folder", async () => {
  await user(alice);
  await db.query(`insert into storage.objects (bucket_id, name) values ('customer-uploads', $1)`, [`${alice}/invoice.pdf`]);
  await expectError(`insert into storage.objects (bucket_id, name) values ('customer-uploads', $1)`, [`${bob}/x.pdf`], /row-level security/);
  await user(bob);
  assert((await rows(`select * from storage.objects where bucket_id = 'customer-uploads'`)).length === 0, "bob sees alice's upload");
});
await test("only staff can upload catalogue media", async () => {
  await user(alice);
  await expectError(`insert into storage.objects (bucket_id, name) values ('product-images', 'x.webp')`, [], /row-level security/);
  await user(staff);
  await db.query(`insert into storage.objects (bucket_id, name) values ('product-images', 'products/x.webp')`);
  await anon();
  assert((await rows(`select * from storage.objects where bucket_id = 'product-images'`)).length === 1, "public media unreadable");
});
await test("RLS is enabled on every public table", async () => {
  const r = await rows(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
  assert(r.length === 0, `RLS off on: ${r.map((x) => x.relname).join(", ")}`);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);

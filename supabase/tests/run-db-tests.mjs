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

console.log("Product management (save_product)");
const scooterCat = (await rows(`select id from public.categories where slug = 'scooters'`))[0].id;
const payload = (over = {}) => ({
  name: "Comet Scooter",
  slug: "comet-scooter",
  category_id: scooterCat,
  status: "draft",
  highlights: ["Foldable", "  ", "Light-up wheels"],
  variants: [
    { sku: "kd-com-red", name: "Red", options: { colour: "Red" }, mrp: 1299900, price: 1099900, opening_stock: 8 },
    { sku: "KD-COM-BLU", name: "Blue", options: { colour: "Blue" }, mrp: 1299900, price: 1049900, is_default: true },
  ],
  attributes: [{ name: "Max load", value: "50 kg" }, { name: "", value: "ignored" }],
  ...over,
});
let comet;
await test("staff create a product with variants, opening stock and specs in one call", async () => {
  await user(staff);
  comet = (await rows(`select public.save_product($1::jsonb) as id`, [JSON.stringify(payload())]))[0].id;
  const v = await rows(`select v.sku, v.is_default, i.on_hand from public.product_variants v
    join public.inventory i on i.variant_id = v.id where v.product_id = $1 order by v.position`, [comet]);
  assert(v.length === 2 && v[0].sku === "KD-COM-RED" && v[0].on_hand === 8, `variants ${JSON.stringify(v)}`);
  assert(v[1].is_default && !v[0].is_default, "default variant wrong");
  const ledger = await rows(`select type, quantity from public.stock_movements m join public.product_variants v on v.id = m.variant_id where v.product_id = $1`, [comet]);
  assert(ledger.length === 1 && ledger[0].type === "opening", "opening stock not in ledger");
  const p = await rows(`select highlights, created_by from public.products where id = $1`, [comet]);
  assert(p[0].highlights.length === 2 && p[0].created_by === staff, "highlights/created_by wrong");
  assert((await rows(`select * from public.product_attributes where product_id = $1`, [comet])).length === 1, "attributes wrong");
});
await test("updating a product edits variants and deactivates removed ones", async () => {
  await user(staff);
  const current = await rows(`select id, sku from public.product_variants where product_id = $1 order by position`, [comet]);
  const red = current.find((x) => x.sku === "KD-COM-RED");
  await db.query(`select public.save_product($1::jsonb)`, [JSON.stringify(payload({
    id: comet,
    status: "active",
    variants: [
      { id: red.id, sku: "KD-COM-RED", name: "Racing Red", mrp: 1299900, price: 999900 },
      { sku: "KD-COM-GRN", name: "Green", mrp: 1299900, price: 1099900, opening_stock: 0 },
    ],
    attributes: [{ name: "Deck", value: "Anti-slip" }],
  }))]);
  const v = await rows(`select sku, name, price, is_active, is_default from public.product_variants where product_id = $1 order by sku`, [comet]);
  const by = Object.fromEntries(v.map((x) => [x.sku, x]));
  assert(by["KD-COM-RED"].price === 999900 && by["KD-COM-RED"].name === "Racing Red", "red not updated");
  assert(by["KD-COM-RED"].is_default, "first kept variant should become default");
  assert(by["KD-COM-BLU"].is_active === false, "removed variant should be deactivated");
  assert(by["KD-COM-GRN"]?.is_active, "new variant missing");
  const p = await rows(`select status, published_at from public.products where id = $1`, [comet]);
  assert(p[0].status === "active" && p[0].published_at, "not published");
  const a = await rows(`select name from public.product_attributes where product_id = $1`, [comet]);
  assert(a.length === 1 && a[0].name === "Deck", "attributes not replaced");
});
await test("save_product rejects price above MRP and rolls back everything", async () => {
  await user(staff);
  await expectError(`select public.save_product($1::jsonb)`, [JSON.stringify(payload({
    slug: "bad-scooter",
    variants: [{ sku: "KD-BAD-1", mrp: 100000, price: 200000 }],
  }))], /price_le_mrp/);
  assert((await rows(`select id from public.products where slug = 'bad-scooter'`)).length === 0, "partial product left behind");
});
await test("save_product rejects duplicate slugs and SKUs", async () => {
  await user(staff);
  await expectError(`select public.save_product($1::jsonb)`, [JSON.stringify(payload())], /duplicate key/);
  await expectError(`select public.save_product($1::jsonb)`, [JSON.stringify(payload({
    slug: "another-scooter", variants: [{ sku: "KD-COM-RED", mrp: 100, price: 100 }],
  }))], /duplicate key/);
});
await test("save_product refuses a variant from another product", async () => {
  await user(staff);
  await expectError(`select public.save_product($1::jsonb)`, [JSON.stringify(payload({
    id: comet, variants: [{ id: variantId, sku: "KD-TEST-001", mrp: 2899900, price: 2349900 }],
  }))], /does not belong/);
});
const sizeColour = (over = {}) => ({
  name: "Volt Rider",
  slug: "volt-rider",
  category_id: scooterCat,
  status: "active",
  option1_name: "Size",
  option2_name: "Colour",
  variants: [
    { sku: "KD-VR-S-BLU", option1: "Small", option2: "Volt Blue", mrp: 500000, price: 450000, opening_stock: 3, specs: [{ name: "Wheel", value: "6 inch" }] },
    { sku: "KD-VR-S-GRN", option1: "Small", option2: "Dynamic Green", mrp: 500000, price: 450000, opening_stock: 0 },
    { sku: "KD-VR-L-BLU", option1: "Large", option2: "Volt Blue", mrp: 700000, price: 650000, opening_stock: 5, is_default: true },
  ],
  ...over,
});
let voltRider;
await test("multi-level variants: each size → colour combination has its own SKU, price, stock and specs", async () => {
  await user(staff);
  voltRider = (await rows(`select public.save_product($1::jsonb) as id`, [JSON.stringify(sizeColour())]))[0].id;
  const p = (await rows(`select option1_name, option2_name from public.products where id = $1`, [voltRider]))[0];
  assert(p.option1_name === "Size" && p.option2_name === "Colour", "option names not saved");
  const v = await rows(`select v.sku, v.name, v.option1, v.option2, v.options, v.specs, v.price, v.is_default, i.on_hand
    from public.product_variants v join public.inventory i on i.variant_id = v.id where v.product_id = $1 order by v.position`, [voltRider]);
  assert(v.length === 3, "3 combinations expected");
  assert(v[0].name === "Small · Volt Blue" && v[0].options.colour === "Volt Blue" && v[0].options.size === "Small", `names/options ${JSON.stringify(v[0])}`);
  assert(v[0].on_hand === 3 && v[2].on_hand === 5 && v[1].on_hand === 0, "stock not per combination");
  assert(v[0].specs.length === 1 && v[0].specs[0].name === "Wheel" && v[1].specs.length === 0, "specs not per combination");
  assert(v[2].is_default && v[2].price === 650000, "default/price wrong");
  // Large has only Volt Blue: sizes can offer different colours.
  assert(v.filter((x) => x.option1 === "Large").length === 1, "large should have one colour");
});
await test("multi-level variants: duplicates and missing values are refused", async () => {
  await user(staff);
  await expectError(`select public.save_product($1::jsonb)`, [JSON.stringify(sizeColour({
    slug: "volt-dup",
    variants: [
      { sku: "KD-VD-1", option1: "Small", option2: "Red", mrp: 100, price: 100 },
      { sku: "KD-VD-2", option1: "small", option2: "red", mrp: 100, price: 100 },
    ],
  }))], /combination|duplicate key/);
  // A main value may have no sub-variant values (sub types depend on the main value).
  await rows(`select public.save_product($1::jsonb)`, [JSON.stringify(sizeColour({
    slug: "volt-missing", variants: [{ sku: "KD-VM-1", option1: "Small", mrp: 100, price: 100 }],
  }))]);
  await expectError(`select public.save_product($1::jsonb)`, [JSON.stringify(sizeColour({
    slug: "volt-noparent", option1_name: "", variants: [{ sku: "KD-VN-1", mrp: 100, price: 100 }],
  }))], /main variant type/);
});
await test("multi-level variants: removing and re-adding a combination works; new type names are remembered", async () => {
  await user(staff);
  const cur = await rows(`select id, sku from public.product_variants where product_id = $1 order by position`, [voltRider]);
  const id = (sku) => cur.find((x) => x.sku === sku).id;
  // Drop Small · Dynamic Green, re-create it under a new SKU, add a new type name.
  await db.query(`select public.save_product($1::jsonb)`, [JSON.stringify(sizeColour({
    id: voltRider,
    option1_name: "Wheel size",
    variants: [
      { id: id("KD-VR-S-BLU"), sku: "KD-VR-S-BLU", option1: "Small", option2: "Volt Blue", mrp: 500000, price: 450000 },
      { sku: "KD-VR-S-GRN2", option1: "Small", option2: "Dynamic Green", mrp: 500000, price: 440000 },
      { id: id("KD-VR-L-BLU"), sku: "KD-VR-L-BLU", option1: "Large", option2: "Volt Blue", mrp: 700000, price: 650000, is_default: true },
    ],
  }))]);
  const v = await rows(`select sku, is_active from public.product_variants where product_id = $1 order by sku`, [voltRider]);
  const by = Object.fromEntries(v.map((x) => [x.sku, x.is_active]));
  assert(by["KD-VR-S-GRN"] === false && by["KD-VR-S-GRN2"] === true, `re-create failed ${JSON.stringify(by)}`);
  assert((await rows(`select 1 from public.variant_option_types where lower(name) = 'wheel size'`)).length === 1, "new option type not remembered");
  await anon();
  assert((await rows(`select name from public.variant_option_types`)).length >= 6, "option types not publicly readable");
});
await test("multi-level variants: images belong to one combination", async () => {
  await user(staff);
  const [v] = await rows(`select id from public.product_variants where product_id = $1 and sku = 'KD-VR-S-BLU'`, [voltRider]);
  await db.query(`insert into public.product_images (product_id, variant_id, storage_path, alt) values ($1, $2, 'products/x/blue-1.webp', 'Blue'), ($1, null, 'products/x/shared.webp', 'Shared')`, [voltRider, v.id]);
  const imgs = await rows(`select variant_id from public.product_images where product_id = $1 order by storage_path`, [voltRider]);
  assert(imgs.length === 2 && imgs[0].variant_id === v.id && imgs[1].variant_id === null, "variant image link wrong");
});
await test("variant types of any depth: wheel size → colour → speed, each combination separate", async () => {
  await user(staff);
  const combo = (size, colour, speed, sku, price, extra = {}) => ({ sku, values: { "Wheel Size": size, Colour: colour, "Speed Type": speed }, mrp: 1500000, price, ...extra });
  const id = (await rows(`select public.save_product($1::jsonb) as id`, [JSON.stringify({
    name: "Kids Mountain Bicycle", slug: "kids-mountain-bicycle", category_id: scooterCat, status: "active",
    variant_types: ["Wheel Size", "Colour", "Speed Type"],
    variants: [
      combo("24″", "Volt Blue", "Single Speed", "KD-24-VB-SS", 999900, { opening_stock: 15 }),
      combo("24″", "Volt Blue", "Normal Speed", "KD-24-VB-NS", 1099900),
      combo("26″", "Red", "Single Speed", "KD-26-RD-SS", 1199900),
    ],
  })]))[0].id;
  const p = (await rows(`select variant_types, option1_name, option2_name from public.products where id = $1`, [id]))[0];
  assert(p.variant_types.length === 3 && p.option1_name === "Wheel Size" && p.option2_name === "Colour", `types ${JSON.stringify(p)}`);
  const v = await rows(`select sku, name, options, option1, option2 from public.product_variants where product_id = $1 order by position`, [id]);
  assert(v[0].name === "24″ · Volt Blue · Single Speed" && v[0].options.speed_type === "Single Speed" && v[0].options.wheel_size === "24″", `combo ${JSON.stringify(v[0])}`);
  assert(v[1].option1 === "24″" && v[1].option2 === "Volt Blue", "compat columns not filled");
  // Same size + colour but different speed is a different combination; an exact repeat is refused.
  await expectError(`select public.save_product($1::jsonb)`, [JSON.stringify({
    name: "Dup Bike", slug: "dup-bike", category_id: scooterCat, variant_types: ["Wheel Size", "Colour", "Speed Type"],
    variants: [combo("24″", "Red", "Single", "KD-DUP-1", 100), combo("24″", "red", "single", "KD-DUP-2", 100)],
  })], /combination|duplicate key/);
  // Sub-variant types depend on the main value: 24″ uses Colour + Speed, 29″ uses Colour + Brake.
  const mixed = (await rows(`select public.save_product($1::jsonb) as id`, [JSON.stringify({
    name: "Mixed Bike", slug: "mixed-bike", category_id: scooterCat, variant_types: ["Wheel Size", "Colour", "Speed Type", "Brake Type"],
    variants: [
      { sku: "KD-MX-24-1", values: { "Wheel Size": "24″", Colour: "Red", "Speed Type": "Single" }, mrp: 100, price: 100 },
      { sku: "KD-MX-29-1", values: { "Wheel Size": "29″", Colour: "Red", "Brake Type": "Disc" }, mrp: 100, price: 100 },
    ],
  })]))[0].id;
  const mx = await rows(`select name, options from public.product_variants where product_id = $1 order by position`, [mixed]);
  assert(mx[0].name === "24″ · Red · Single" && mx[1].options.brake_type === "Disc" && !("speed_type" in mx[1].options), `mixed ${JSON.stringify(mx)}`);
  await expectError(`select public.save_product($1::jsonb)`, [JSON.stringify({
    name: "Uneven Bike", slug: "uneven-bike", category_id: scooterCat, variant_types: ["Wheel Size", "Colour", "Speed Type"],
    variants: [
      { sku: "KD-UN-1", values: { "Wheel Size": "24″", Colour: "Red", "Speed Type": "Single" }, mrp: 100, price: 100 },
      { sku: "KD-UN-2", values: { "Wheel Size": "24″", Colour: "Blue" }, mrp: 100, price: 100 },
    ],
  })], /same sub-variant types/);
  await expectError(`select public.save_product($1::jsonb)`, [JSON.stringify({
    name: "No Main", slug: "no-main", category_id: scooterCat, variant_types: ["Wheel Size", "Colour"],
    variants: [{ sku: "KD-NM-1", values: { Colour: "Red" }, mrp: 100, price: 100 }],
  })], /needs a Wheel Size/);
  await expectError(`select public.save_product($1::jsonb)`, [JSON.stringify({
    name: "Same Types", slug: "same-types", category_id: scooterCat, variant_types: ["Colour", "colour"],
    variants: [{ sku: "KD-SAME-1", values: { Colour: "Red" }, mrp: 100, price: 100 }],
  })], /must be different/);
});
await test("customers and anonymous users cannot save products", async () => {
  await user(alice);
  await expectError(`select public.save_product($1::jsonb)`, [JSON.stringify(payload({ slug: "x-y" }))], /not authorized/);
  await anon();
  await expectError(`select public.save_product($1::jsonb)`, [JSON.stringify(payload({ slug: "x-z" }))], /permission denied/);
});
await test("staff can reorder product images", async () => {
  await user(staff);
  const ids = (await rows(`insert into public.product_images (product_id, storage_path, position) values
    ($1, 'products/a.webp', 0), ($1, 'products/b.webp', 1) returning id`, [comet])).map((r) => r.id);
  await db.query(`select public.reorder_product_images($1, $2::uuid[])`, [comet, [ids[1], ids[0]]]);
  const r = await rows(`select storage_path from public.product_images where product_id = $1 order by position`, [comet]);
  assert(r[0].storage_path === "products/b.webp", "reorder failed");
});
await test("staff cannot delete products (admin only)", async () => {
  await user(staff);
  const r = await rows(`delete from public.products where id = $1 returning id`, [comet]);
  assert(r.length === 0, "staff deleted a product");
});

console.log("Audit log & user directory");
await test("role changes and order updates are written to the audit log (super admin only)", async () => {
  await user(superAdmin);
  await db.query(`insert into public.user_roles (user_id, role) values ($1, 'staff')`, [bob]);
  await db.query(`delete from public.user_roles where user_id = $1 and role = 'staff'`, [bob]);
  const r = await rows(`select action, entity from public.audit_logs where entity = 'user_roles' order by id`);
  assert(r.length >= 2 && r.some((x) => x.action === "insert") && r.some((x) => x.action === "delete"), `audit ${JSON.stringify(r)}`);
  assert((await rows(`select * from public.audit_logs where entity = 'orders'`)).length >= 1, "order changes not audited");
  await user(staff);
  assert((await rows(`select * from public.audit_logs`)).length === 0, "staff can read audit log");
  await expectError(`insert into public.audit_logs (action, entity) values ('x', 'y')`, [], /permission denied|row-level/);
});
await test("only admins can list users (with emails)", async () => {
  await user(superAdmin);
  const r = await rows(`select email, roles from public.admin_list_users(null, 50)`);
  assert(r.length === 4 && r.some((x) => String(x.roles).includes("super_admin")), `list ${r.length}`);
  await user(staff);
  await expectError(`select * from public.admin_list_users(null, 50)`, [], /not authorized/);
  await anon();
  await expectError(`select * from public.admin_list_users(null, 50)`, [], /permission denied/);
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

console.log("Staff accounts & permissions");
const [svc, admin2, primary] = (
  await rows(`insert into auth.users (email, raw_user_meta_data) values
    ('tech@test.local', '{"full_name":"Tech"}'),
    ('admin2@test.local', '{"full_name":"Admin Two"}'),
    ('KingDayStore@gmail.com', '{"full_name":"KING DAY"}')
    returning id`)
).map((r) => r.id);
await db.query(`insert into public.user_roles (user_id, role) values ($1, 'service_staff'), ($2, 'admin')`, [svc, admin2]);
const svcCat = (await rows(`select id from public.staff_categories where name = 'Service Technician'`))[0].id;
const salesCat = (await rows(`select id from public.staff_categories where name = 'Sales Staff'`))[0].id;
const anyProduct = (await rows(`select id from public.products limit 1`))[0].id;
const touchProduct = async () => (await db.query(`update public.products set name = name where id = $1 returning id`, [anyProduct])).rows.length;

await test("staff IDs are generated per kind and never change", async () => {
  await user(superAdmin);
  await db.query(`insert into public.staff_profiles (user_id, category_id) values ($1, $2), ($3, $4)`, [staff, salesCat, svc, svcCat]);
  const r = await rows(`select user_id, staff_code from public.staff_profiles`);
  const code = (id) => r.find((x) => x.user_id === id).staff_code;
  assert(code(staff) === "KD-STF-0001" && code(svc) === "KD-SRV-0001", JSON.stringify(r));
  await db.query(`update public.staff_profiles set staff_code = 'KD-STF-9999' where user_id = $1`, [staff]);
  assert((await rows(`select staff_code from public.staff_profiles where user_id = $1`, [staff]))[0].staff_code === "KD-STF-0001", "code changed");
});
await test("staff get role-default permissions", async () => {
  await user(staff);
  const p = Object.fromEntries((await rows(`select module, actions from public.my_permissions()`)).map((x) => [x.module, x.actions]));
  assert(p.products?.includes("edit") && !p.products.includes("delete") && !p.users && !p.payroll, JSON.stringify(p));
});
await test("only super admin manages staff profiles and permissions", async () => {
  await user(staff);
  const n = (await db.query(`update public.staff_profiles set custom_permissions = true where user_id = $1 returning 1`, [staff])).rows.length;
  assert(n === 0, "staff edited own profile flags");
  await expectError(`insert into public.user_permissions (user_id, module, actions) values ($1, 'payroll', '{view}')`, [staff], /row-level security/);
  await user(admin2);
  await expectError(`insert into public.user_permissions (user_id, module, actions) values ($1, 'payroll', '{view}')`, [staff], /row-level security/);
});
await test("custom permissions replace role defaults (enforced by RLS)", async () => {
  await user(superAdmin);
  await db.query(`update public.staff_profiles set custom_permissions = true where user_id = $1`, [staff]);
  await db.query(`insert into public.user_permissions (user_id, module, actions) values ($1, 'products', '{view}'), ($1, 'orders', '{view}')`, [staff]);
  await user(staff);
  assert((await touchProduct()) === 0, "view-only staff updated a product");
  await expectError(`select public.set_reorder_level((select variant_id from public.inventory limit 1), 3)`, [], /not authorized/);
  await user(superAdmin);
  await db.query(`update public.staff_profiles set custom_permissions = false where user_id = $1`, [staff]);
  await db.query(`delete from public.user_permissions where user_id = $1`, [staff]);
  await user(staff);
  assert((await touchProduct()) === 1, "defaults not restored");
});
await test("deactivated staff lose access immediately", async () => {
  await user(superAdmin);
  await db.query(`update public.staff_profiles set status = 'inactive' where user_id = $1`, [staff]);
  await user(staff);
  assert((await touchProduct()) === 0, "inactive staff edited product");
  assert((await rows(`select * from public.my_permissions()`)).length === 0, "inactive staff kept permissions");
  await user(superAdmin);
  await db.query(`update public.staff_profiles set status = 'active' where user_id = $1`, [staff]);
});
await test("service staff have no admin-panel access", async () => {
  await user(svc);
  assert((await touchProduct()) === 0, "service staff edited product");
  const p = (await rows(`select module from public.my_permissions()`)).map((x) => x.module);
  // Technicians get the service module plus read-only spare parts (to pick replaced items).
  assert(p.sort().join(",") === "service,spare_parts", `perms ${p}`);
});
await test("Update 01 modules: admin can't restore or approve resets by default", async () => {
  await user(admin2);
  const p = Object.fromEntries((await rows(`select module, actions from public.my_permissions()`)).map((x) => [x.module, x.actions]));
  assert(p.cms?.includes("edit") && p.billing?.includes("approve"), "admin missing cms/billing");
  assert(p.backup?.join(",") === "export,view", `admin backup ${p.backup}`);
  assert(!p.password_resets, "admin got password_resets by default");
  await user(superAdmin);
  const s = (await rows(`select module from public.my_permissions()`)).map((x) => x.module);
  assert(["cms", "backup", "spare_parts", "billing", "password_resets"].every((m) => s.includes(m)), "super admin missing new modules");
});
await test("system.* settings: only a Super Admin can change them", async () => {
  await user(admin2);
  const r = await db.query(`update public.store_settings set value = '"automatic"' where key = 'system.password_reset_mode' returning key`);
  assert(r.rows.length === 0, "admin changed a system setting");
  await expectError(`insert into public.store_settings (key, value) values ('system.test_key', '1')`, [], /row-level security/);
  const ok = await db.query(`update public.store_settings set value = value where key = 'store.name' returning key`);
  assert(ok.rows.length === 1, "admin lost normal settings access");
  await user(superAdmin);
  const s = await db.query(`update public.store_settings set value = '"automatic"' where key = 'system.password_reset_mode' returning key`);
  assert(s.rows.length === 1, "super admin couldn't change a system setting");
});
await test("staff directory is limited to users-view permission", async () => {
  await user(superAdmin);
  const r = await rows(`select * from public.admin_list_accounts(null, 50)`);
  assert(r.some((x) => x.staff_code === "KD-SRV-0001"), "directory missing staff code");
  await user(staff);
  await expectError(`select * from public.admin_list_accounts(null, 50)`, [], /not authorized/);
});
await test("primary Super Admin is granted on confirmation and protected", async () => {
  assert((await rows(`select 1 from public.user_roles where user_id = $1 and role = 'super_admin'`, [primary])).length === 0, "granted before confirmation");
  await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [primary]);
  assert((await rows(`select 1 from public.user_roles where user_id = $1 and role = 'super_admin'`, [primary])).length === 1, "not granted");
  await user(superAdmin);
  await expectError(`delete from public.user_roles where user_id = $1 and role = 'super_admin'`, [primary], /primary Super Admin/);
  await db.query(`insert into public.staff_profiles (user_id) values ($1)`, [primary]);
  await expectError(`update public.staff_profiles set status = 'inactive' where user_id = $1`, [primary], /primary Super Admin/);
  await asSuperuser();
  await expectError(`delete from auth.users where id = $1`, [primary], /primary Super Admin/);
});

console.log("Staff HR profiles");
await test("staff edit only their own personal details", async () => {
  await user(staff);
  await db.query(`insert into public.staff_personal (user_id, address, emergency_phone) values ($1, 'Kozhikode', '+91 90000 00000')`, [staff]);
  await expectError(`insert into public.staff_personal (user_id, address) values ($1, 'x')`, [svc], /row-level security/);
  await user(svc);
  await db.query(`insert into public.staff_personal (user_id, blood_group) values ($1, 'O+')`, [svc]);
  assert((await rows(`select * from public.staff_personal`)).length === 1, "service staff saw another employee's details");
  await user(alice);
  await expectError(`insert into public.staff_personal (user_id) values ($1)`, [alice], /row-level security/);
  await user(admin2);
  assert((await rows(`select * from public.staff_personal`)).length === 2, "admin can't read HR details");
});
await test("documents are HR-managed and private", async () => {
  await user(staff);
  await expectError(`insert into public.staff_documents (user_id, title, path) values ($1, 'ID', $2)`, [staff, `${staff}/docs/id-card-1.pdf`], /row-level security/);
  await user(admin2);
  await db.query(`insert into public.staff_documents (user_id, title, path) values ($1, 'ID card', $2)`, [staff, `${staff}/docs/id-card-1.pdf`]);
  await user(staff);
  assert((await rows(`select * from public.staff_documents`)).length === 1, "staff can't see own document");
  await user(svc);
  assert((await rows(`select * from public.staff_documents`)).length === 0, "service staff saw another's document");
});
await test("staff files: own photo only; documents by HR", async () => {
  await user(staff);
  await db.query(`insert into storage.objects (bucket_id, name) values ('staff-files', $1)`, [`${staff}/photo-abc123.webp`]);
  await expectError(`insert into storage.objects (bucket_id, name) values ('staff-files', $1)`, [`${staff}/docs/x-123456.pdf`], /row-level security/);
  await expectError(`insert into storage.objects (bucket_id, name) values ('staff-files', $1)`, [`${svc}/photo-abc123.webp`], /row-level security/);
  await user(svc);
  assert((await rows(`select * from storage.objects where bucket_id = 'staff-files'`)).length === 0, "service staff read another's photo");
  await user(admin2);
  await db.query(`insert into storage.objects (bucket_id, name) values ('staff-files', $1)`, [`${staff}/docs/x-123456.pdf`]);
});
await test("employment details change only through HR permission", async () => {
  await user(staff);
  await expectError(`select public.update_staff_employment($1, 'Sales', 'Executive', 'full_time', '2026-01-01')`, [staff], /not authorized/);
  await user(admin2);
  await db.query(`select public.update_staff_employment($1, 'Sales', 'Executive', 'contract', '2026-01-01')`, [staff]);
  const r = (await rows(`select department, employment_type, status from public.staff_profiles where user_id = $1`, [staff]))[0];
  assert(r.department === "Sales" && r.employment_type === "contract" && r.status === "active", JSON.stringify(r));
});

console.log("Service bookings");
const booking = (over = {}) =>
  JSON.stringify({
    customer_name: "Alice",
    mobile: "+91 98765 43210",
    category: "jeep",
    product_name: "Thunder 12V Jeep",
    complaint: "Not charging",
    address: "Puthiyapalam, Kozhikode",
    preferred_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    ...over,
  });
await test("signed-in customers book a service and get a booking ID", async () => {
  await anon();
  await expectError(`select public.create_service_booking($1::jsonb)`, [booking()], /permission denied/);
  await user(alice);
  const code = (await rows(`select public.create_service_booking($1::jsonb) as c`, [booking()]))[0].c;
  assert(/^KD-SB-\d{6}$/.test(code), code);
  await expectError(`insert into public.service_bookings (customer_name, mobile, category, purchase_source, product_name, address, preferred_date, complaint) values ('x','9999999','jeep','external','xx','xxxxxx', current_date, 'y')`, [], /permission denied/);
});
await test("bookings reject other people's files and orders", async () => {
  await user(alice);
  await expectError(`select public.create_service_booking($1::jsonb)`, [booking({ photo_paths: [`${bob}/abc123.webp`] })], /invalid file/);
  await db.query(`select public.create_service_booking($1::jsonb)`, [booking({ photo_paths: [`${alice}/abc123.webp`], voice_path: `${alice}/voice-123456.webm` })]);
  await expectError(`select public.create_service_booking($1::jsonb)`, [booking({ order_id: "00000000-0000-0000-0000-000000000000" })], /order not found/);
  await expectError(`select public.create_service_booking($1::jsonb)`, [booking({ preferred_date: "2020-01-01" })], /preferred date/);
});
await test("bookings are private: own customer, service team, assigned technician", async () => {
  await user(bob);
  assert((await rows(`select * from public.service_bookings`)).length === 0, "bob sees alice's booking");
  await user(alice);
  assert((await rows(`select * from public.service_bookings`)).length === 2, "alice can't see own bookings");
  await user(admin2);
  assert((await rows(`select * from public.service_bookings`)).length === 2, "admin can't see bookings");
  await user(svc);
  assert((await rows(`select * from public.service_bookings`)).length === 0, "unassigned technician sees bookings");
  await asSuperuser();
  await db.query(`update public.service_bookings set assigned_to = $1, status = 'assigned' where booking_code = (select min(booking_code) from public.service_bookings)`, [svc]);
  await user(svc);
  assert((await rows(`select * from public.service_bookings`)).length === 1, "technician can't see own job");
});
await test("customers cancel only before acceptance", async () => {
  await user(alice);
  const [b] = await rows(`select id from public.service_bookings where status = 'new' limit 1`);
  await db.query(`select public.cancel_my_service_booking($1)`, [b.id]);
  await expectError(`select public.cancel_my_service_booking($1)`, [b.id], /can no longer be cancelled/);
});

console.log("Service jobs");
const [svc2] = (await rows(`insert into auth.users (email) values ('tech2@test.local') returning id`)).map((r) => r.id);
await db.query(`insert into public.user_roles (user_id, role) values ($1, 'service_staff')`, [svc2]);
await user(alice);
const jobCode = (await rows(`select public.create_service_booking($1::jsonb) as c`, [booking({ product_name: "Job flow jeep" })]))[0].c;
await asSuperuser();
const jobId = (await rows(`select id from public.service_bookings where booking_code = $1`, [jobCode]))[0].id;

await test("only service managers assign, and only to active service staff", async () => {
  await user(staff);
  await expectError(`select public.assign_service_booking($1, $2)`, [jobId, svc], /not authorized/);
  await user(admin2);
  await expectError(`select public.assign_service_booking($1, $2)`, [jobId, staff], /active service staff/);
  await db.query(`select public.assign_service_booking($1, $2, 'Please visit')`, [jobId, svc]);
  const [b] = await rows(`select status, assigned_to from public.service_bookings where id = $1`, [jobId]);
  assert(b.status === "assigned" && b.assigned_to === svc, JSON.stringify(b));
});
await test("only the assigned technician sees and accepts the job", async () => {
  await user(svc2);
  assert((await rows(`select * from public.service_bookings where id = $1`, [jobId])).length === 0, "other technician sees the job");
  await expectError(`select public.respond_service_job($1, true)`, [jobId], /already answered/);
  await user(svc);
  await db.query(`select public.respond_service_job($1, true)`, [jobId]);
  assert((await rows(`select status from public.service_bookings where id = $1`, [jobId]))[0].status === "accepted", "not accepted");
});
await test("technician steps follow the order and are logged with staff ID", async () => {
  await user(svc);
  await expectError(`select public.advance_service_job($1, 'started')`, [jobId], /not available/);
  await db.query(`select public.advance_service_job($1, 'on_the_way', 'Leaving now')`, [jobId]);
  await db.query(`select public.advance_service_job($1, 'reached')`, [jobId]);
  await db.query(`select public.advance_service_job($1, 'started')`, [jobId]);
  await expectError(`update public.service_bookings set status = 'completed' where id = $1`, [jobId], /permission denied/);
  const ev = await rows(`select status, note, actor_code from public.service_job_events where booking_id = $1 order by id`, [jobId]);
  assert(ev.map((e) => e.status).join(",") === "new,assigned,accepted,on_the_way,reached,started", ev.map((e) => e.status).join(","));
  assert(ev.find((e) => e.status === "on_the_way").note === "Leaving now" && ev.find((e) => e.status === "accepted").actor_code === "KD-SRV-0001", JSON.stringify(ev));
  await user(alice);
  assert((await rows(`select * from public.service_job_events where booking_id = $1`, [jobId])).length === 6, "customer can't follow the timeline");
});
await test("inspection report: assigned technician only, own files only", async () => {
  await user(svc2);
  await expectError(`select public.save_service_inspection($1, $2::jsonb)`, [jobId, JSON.stringify({ problem_found: "x" })], /not authorized/);
  await user(svc);
  await expectError(`select public.save_service_inspection($1, $2::jsonb)`, [jobId, JSON.stringify({ before_photos: [`${alice}/abcdef.webp`] })], /invalid file/);
  await db.query(`select public.save_service_inspection($1, $2::jsonb)`, [
    jobId,
    JSON.stringify({ problem_found: "Loose wire", work_performed: "Rewired", before_photos: [`${svc}/before1.webp`], confirmed_by: "Alice", signature_path: `${svc}/sign-1234567.png` }),
  ]);
  await db.query(`select public.advance_service_job($1, 'completed', 'Done')`, [jobId]);
  const [i] = await rows(`select problem_found, confirmed_at from public.service_inspections where booking_id = $1`, [jobId]);
  assert(i.problem_found === "Loose wire" && i.confirmed_at, JSON.stringify(i));
});
await test("after acceptance only a manager can move the job; completed jobs are locked", async () => {
  await user(admin2);
  await expectError(`select public.assign_service_booking($1, $2)`, [jobId, svc2], /no longer be reassigned/);
  await expectError(`select public.cancel_service_booking($1, 'x')`, [jobId], /no longer be cancelled/);
  const t = (await rows(`select * from public.list_service_technicians()`)).find((x) => x.user_id === svc);
  assert(Number(t.completed_total) === 1, JSON.stringify(t));
  await user(svc);
  await expectError(`select * from public.list_service_technicians()`, [], /not authorized/);
});

console.log("Service invoices");
const invoice = (over = {}) =>
  JSON.stringify({
    service_description: "Battery connector repair",
    basic_charge: 30000,
    labour_charge: 20000,
    discount: 5000,
    tax_percent: 18,
    items: [{ description: "Connector", quantity: 2, unit_price: 7500 }],
    payment_method: "upi",
    payment_status: "unpaid",
    ...over,
  });
await test("assigned technician invoices a completed job; totals are computed by the database", async () => {
  await user(svc2);
  await expectError(`select public.save_service_invoice($1, $2::jsonb)`, [jobId, invoice()], /not authorized/);
  await user(svc);
  const num = (await rows(`select public.save_service_invoice($1, $2::jsonb) as n`, [jobId, invoice({ grand_total: 1 })]))[0].n;
  assert(/^KD-SI-\d{6}$/.test(num), num);
  const [i] = await rows(`select subtotal, tax_amount, grand_total from public.service_invoices where booking_id = $1`, [jobId]);
  // 300 + 200 + 2 x 75 = 650; -50 = 600; +18% = 108 -> 708
  assert(i.subtotal === 65000 && i.tax_amount === 10800 && i.grand_total === 70800, JSON.stringify(i));
  assert((await rows(`select status from public.service_bookings where id = $1`, [jobId]))[0].status === "invoiced", "booking not invoiced");
  await expectError(`insert into public.service_invoices (booking_id, customer_name, customer_mobile, customer_address, product) values ($1,'x','9999999','xxxxx','x')`, [jobId], /permission denied/);
});
await test("invoices need a completed job, a valid discount, and lock once paid", async () => {
  await user(alice);
  const code = (await rows(`select public.create_service_booking($1::jsonb) as c`, [booking({ product_name: "Not done yet" })]))[0].c;
  await asSuperuser();
  const openId = (await rows(`select id from public.service_bookings where booking_code = $1`, [code]))[0].id;
  await user(admin2);
  await expectError(`select public.save_service_invoice($1, $2::jsonb)`, [openId, invoice()], /complete the service/);
  await user(svc);
  await expectError(`select public.save_service_invoice($1, $2::jsonb)`, [jobId, invoice({ discount: 9999999 })], /discount/);
  await db.query(`select public.save_service_invoice($1, $2::jsonb)`, [jobId, invoice({ payment_status: "paid", payment_method: "cash" })]);
  await expectError(`select public.save_service_invoice($1, $2::jsonb)`, [jobId, invoice()], /only be changed by the office/);
  await user(admin2);
  await db.query(`select public.save_service_invoice($1, $2::jsonb)`, [jobId, invoice({ payment_status: "paid", payment_method: "cash", discount: 0, approve: true })]);
});
await test("customers see their own APPROVED service invoice; others don't", async () => {
  await user(alice);
  const r = await rows(`select i.invoice_number, (select count(*) from public.service_invoice_items x where x.invoice_id = i.id) n from public.service_invoices i`);
  assert(r.length === 1 && Number(r[0].n) === 1, JSON.stringify(r));
  await user(bob);
  assert((await rows(`select * from public.service_invoices`)).length === 0, "bob sees alice's invoice");
  await user(svc2);
  assert((await rows(`select * from public.service_invoices`)).length === 0, "other technician sees invoice");
});

console.log("Customer accounts");
await test("every account has a permanent Customer ID", async () => {
  const r = await rows(`select id, customer_code from public.profiles order by customer_code`);
  assert(r.length >= 4 && r.every((x) => /^KD-CUS-\d{6}$/.test(x.customer_code)) && new Set(r.map((x) => x.customer_code)).size === r.length, JSON.stringify(r));
  await user(alice);
  const before = (await rows(`select customer_code from public.profiles where id = $1`, [alice]))[0].customer_code;
  await db.query(`update public.profiles set customer_code = 'KD-CUS-999999', full_name = 'Alice New' where id = $1`, [alice]);
  const after = (await rows(`select customer_code, full_name from public.profiles where id = $1`, [alice]))[0];
  assert(after.customer_code === before && after.full_name === "Alice New", JSON.stringify(after));
});
await test("one account per mobile number (any format)", async () => {
  await user(alice);
  await db.query(`update public.profiles set phone = '98765 43210' where id = $1`, [alice]);
  assert((await rows(`select mobile_e164 from public.profiles where id = $1`, [alice]))[0].mobile_e164 === "+919876543210", "not normalised");
  await user(bob);
  await expectError(`update public.profiles set phone = '+91 9876543210' where id = $1`, [bob], /profiles_mobile_unique|duplicate/);
});
await test("product cart is private to its owner", async () => {
  const variant = (await rows(`select id from public.product_variants limit 1`))[0].id;
  await user(alice);
  await db.query(`insert into public.cart_items (user_id, variant_id, quantity) values ($1, $2, 2)`, [alice, variant]);
  await expectError(`insert into public.cart_items (user_id, variant_id, quantity) values ($1, $2, 1)`, [bob, variant], /row-level security/);
  await user(bob);
  assert((await rows(`select * from public.cart_items`)).length === 0, "bob sees alice's cart");
});
await test("service cart books every item under the same customer", async () => {
  await user(alice);
  const item = (n) => [alice, "scooter", "battery", "external", `Cart item ${n}`, "Battery drains fast", "Kozhikode town", new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), "morning"];
  for (const n of [1, 2]) {
    await db.query(`insert into public.service_cart_items (user_id, category, service_type, purchase_source, product_name, complaint, address, preferred_date, preferred_time) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, item(n));
  }
  await user(bob);
  assert((await rows(`select * from public.service_cart_items`)).length === 0, "bob sees alice's service cart");
  await expectError(`select public.checkout_service_cart()`, [], /add your name and mobile|empty/);
  await user(alice);
  const codes = (await rows(`select public.checkout_service_cart() as c`))[0].c;
  assert(codes.length === 2, JSON.stringify(codes));
  const b = await rows(`select customer_id, service_type, preferred_time, mobile from public.service_bookings where booking_code = any($1)`, [codes]);
  assert(b.every((x) => x.customer_id === alice && x.service_type === "battery" && x.preferred_time === "morning" && x.mobile === "98765 43210"), JSON.stringify(b));
  assert((await rows(`select * from public.service_cart_items`)).length === 0, "cart not emptied");
});
await test("notifications reach the customer and the assigned technician only", async () => {
  await user(alice);
  const mine = await rows(`select title from public.notifications`);
  assert(mine.some((n) => /received/.test(n.title)) && mine.some((n) => /invoice ready/.test(n.title)), mine.map((n) => n.title).join(" | "));
  await user(svc);
  assert((await rows(`select title from public.notifications`)).some((n) => /^New job/.test(n.title)), "technician not notified");
  await user(bob);
  assert((await rows(`select * from public.notifications`)).length === 0, "bob sees others' notifications");
  await user(alice);
  await db.query(`update public.notifications set read_at = now() where user_id = $1`, [alice]);
  await expectError(`update public.notifications set title = 'x' where user_id = $1`, [alice], /permission denied/);
  await expectError(`insert into public.notifications (user_id, title) values ($1, 'spam')`, [bob], /permission denied/);
});

console.log("Web push");
await test("push subscriptions are private to their owner", async () => {
  await user(alice);
  await db.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/alice-1', repeat('a', 40), repeat('b', 16))`, [alice]);
  await expectError(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1, 'https://push.example/x', repeat('a', 40), repeat('b', 16))`, [bob], /row-level security/);
  await user(bob);
  assert((await rows(`select * from public.push_subscriptions`)).length === 0, "bob sees alice's device");
});
await test("each notification is claimed for sending exactly once (server key only)", async () => {
  await user(alice);
  await expectError(`select * from public.claim_push_notifications(10)`, [], /permission denied/);
  await asSuperuser();
  await db.query(`select private.notify($1, 'Test push', 'Body', '/account')`, [alice]);
  await service();
  const first = await rows(`select * from public.claim_push_notifications(50)`);
  const again = await rows(`select * from public.claim_push_notifications(50)`);
  assert(first.some((n) => n.title === "Test push") && again.length === 0, `${first.length}/${again.length}`);
});
await test("shipping updates notify the order's customer", async () => {
  await asSuperuser();
  const [o] = await rows(`select id, user_id from public.orders where user_id is not null limit 1`);
  assert(o, "fixture order missing");
  await db.query(`insert into public.shipments (order_id, status, carrier, tracking_number) values ($1, 'shipped', 'DTDC', 'X123')`, [o.id]);
  assert((await rows(`select 1 from public.notifications where user_id = $1 and body like 'Tracking: DTDC X123%'`, [o.user_id])).length === 1, "no shipping notification");
});
await test("promotions reach opted-in customers only, sent by admins", async () => {
  await asSuperuser();
  await db.query(`update public.profiles set marketing_opt_in = (id = $1)`, [bob]);
  await user(staff);
  await expectError(`select public.send_promotion('Big sale', 'Up to 30% off', '/offers')`, [], /not authorized/);
  await user(admin2);
  await expectError(`select public.send_promotion('Sale', 'x', 'https://evil.example')`, [], /invalid link/);
  const n = (await rows(`select public.send_promotion('Big sale', 'Up to 30% off', '/offers') as n`))[0].n;
  assert(n === 1, `sent to ${n}`);
  await user(alice);
  assert((await rows(`select 1 from public.notifications where title = 'Big sale'`)).length === 0, "non-opted-in customer got promo");
});
await test("tomorrow's service reminders are queued once", async () => {
  await asSuperuser();
  await db.query(`update public.service_bookings set preferred_date = ((now() at time zone 'Asia/Kolkata')::date + 1), reminded_at = null where status in ('new','assigned','accepted')`);
  await service();
  const n1 = (await rows(`select public.queue_service_reminders() as n`))[0].n;
  const n2 = (await rows(`select public.queue_service_reminders() as n`))[0].n;
  assert(n1 > 0 && n2 === 0, `${n1}/${n2}`);
  await user(alice);
  await expectError(`select public.queue_service_reminders()`, [], /permission denied/);
});

console.log("Booking reaches the office");
await test("a new booking alerts everyone who can assign jobs (not other staff or technicians)", async () => {
  await asSuperuser();
  await db.query(`update public.service_bookings set status = 'cancelled' where customer_id = $1 and status in ('new','assigned')`, [bob]);
  await user(bob);
  const code = (await rows(`select public.create_service_booking($1::jsonb) as c`, [booking({ customer_name: "Bob", product_name: "Office alert test" })]))[0].c;
  await asSuperuser();
  const got = async (id) => (await rows(`select 1 from public.notifications where user_id = $1 and title = $2`, [id, `Assign technician: ${code}`])).length;
  assert((await got(superAdmin)) === 1 && (await got(admin2)) === 1, "managers not alerted");
  assert((await got(staff)) === 0 && (await got(svc)) === 0 && (await got(bob)) === 0, "wrong people alerted");
  const [bk] = await rows(`select id from public.service_bookings where booking_code = $1`, [code]);
  await user(admin2);
  await db.query(`select public.assign_service_booking($1, $2)`, [bk.id, svc]);
  await user(svc);
  assert((await rows(`select booking_code from public.service_bookings where id = $1`, [bk.id])).length === 1, "technician can't see assigned job");
  // Declined jobs go back to the office.
  await db.query(`select public.respond_service_job($1, false, 'Busy')`, [bk.id]);
  await asSuperuser();
  assert((await got(admin2)) === 2, "decline didn't alert the office");
});

console.log("Staff tasks & payroll (Update 01 phase 05)");
await db.query(`update public.staff_profiles set status = 'active', custom_permissions = false where user_id in ($1, $2)`, [staff, svc]);
let taskId;
await test("tasks: managers assign, assignee sees only own and can only change status", async () => {
  await user(admin2);
  [{ id: taskId }] = await rows(`insert into public.staff_tasks (title, assigned_to, due_date) values ('Count jeep stock', $1, current_date) returning id`, [svc]);
  await asSuperuser();
  assert((await rows(`select 1 from public.notifications where user_id = $1 and title = 'New task: Count jeep stock'`, [svc])).length === 1, "assignee not notified");
  await user(staff);
  assert((await rows(`select id from public.staff_tasks where id = $1`, [taskId])).length === 0, "other staff saw the task");
  await user(svc);
  assert((await rows(`select id from public.staff_tasks where id = $1`, [taskId])).length === 1, "assignee can't see task");
  assert((await db.query(`update public.staff_tasks set title = 'hacked' where id = $1 returning id`, [taskId])).rows.length === 0, "assignee edited title");
  await db.query(`select public.update_my_task($1, 'done', 'Counted 12')`, [taskId]);
  const [t] = await rows(`select status, staff_note, completed_at from public.staff_tasks where id = $1`, [taskId]);
  assert(t.status === "done" && t.staff_note === "Counted 12" && t.completed_at, "status not updated");
  await user(staff);
  await expectError(`select public.update_my_task($1, 'todo')`, [taskId], /not found/i);
});

let runId;
await test("payroll: salary is private, payslips appear only after finalising", async () => {
  await user(admin2);
  await db.query(`insert into public.salary_structures (user_id, basic_paise, allowances_paise, deductions_paise, effective_from) values ($1, 1500000, 200000, 50000, '2026-01-01'), ($2, 2000000, 0, 0, '2026-01-01')`, [svc, staff]);
  await user(svc);
  const own = await rows(`select user_id from public.salary_structures`);
  assert(own.length === 1 && own[0].user_id === svc, `technician sees ${own.length} salaries`);
  await expectError(`insert into public.salary_structures (user_id, basic_paise) values ($1, 1)`, [bob], /row-level security/);
  await expectError(`select public.generate_payroll('2026-11-15')`, [], /not authorized/i);
  await user(admin2);
  runId = (await rows(`select public.generate_payroll('2026-11-15') as id`))[0].id;
  const slips = await rows(`select user_id, net_paise from public.payslips where run_id = $1`, [runId]);
  assert(slips.length === 2, `expected 2 payslips, got ${slips.length}`);
  assert(Number(slips.find((s) => s.user_id === svc).net_paise) === 1650000, "wrong net pay");
  await user(svc);
  assert((await rows(`select id from public.payslips`)).length === 0, "draft payslip visible to staff");
  await user(admin2);
  await db.query(`update public.payslips set bonus_paise = 100000 where run_id = $1 and user_id = $2`, [runId, svc]);
  await db.query(`select public.finalize_payroll($1)`, [runId]);
  await expectError(`update public.payslips set bonus_paise = 0 where run_id = $1`, [runId], /finalised/);
  await db.query(`update public.payslips set paid_on = current_date, payment_method = 'upi' where run_id = $1 and user_id = $2`, [runId, svc]);
  await user(svc);
  const mine = await rows(`select user_id, net_paise from public.payslips`);
  assert(mine.length === 1 && mine[0].user_id === svc && Number(mine[0].net_paise) === 1750000, "technician payslip wrong or sees others");
  assert((await rows(`select id from public.payroll_runs`)).length === 1, "technician can't see own finalised run");
  await user(staff);
  assert((await rows(`select id from public.payslips where user_id = $1`, [svc])).length === 0, "staff saw another payslip");
  await asSuperuser();
  assert((await rows(`select 1 from public.notifications where user_id = $1 and title like 'Payslip ready%'`, [svc])).length === 1, "no payslip notification");
  assert((await rows(`select 1 from public.audit_logs where entity = 'payslips'`)).length >= 1, "payslip change not audited");
});

console.log("Product checkout (Update 01 phase 06)");
const [ckVar] = await rows(
  `select v.id, v.price from public.product_variants v join public.products p on p.id = v.product_id
    where v.is_active and p.status = 'active' order by v.sku limit 1`,
);
await db.query(`update public.inventory set on_hand = 10, reserved = 0 where variant_id = $1`, [ckVar.id]);
await db.query(`update public.store_settings set value = '0' where key = 'shipping.flat_rate'`);
const [{ id: bobAddr }] = await rows(
  `insert into public.addresses (user_id, full_name, phone, line1, city, state, postal_code) values ($1, 'Bob', '+91 98470 00000', 'Puthiyapalam Road', 'Kozhikode', 'Kerala', '673002') returning id`,
  [bob],
);
const [{ id: aliceAddr }] = await rows(
  `insert into public.addresses (user_id, full_name, phone, line1, city, state, postal_code) values ($1, 'Alice', '+91 98470 11111', 'Beach Road', 'Kozhikode', 'Kerala', '673001') returning id`,
  [alice],
);
const order = (items, address, note) => JSON.stringify({ items, address_id: address, note });
let ckOrder;
await test("checkout: order priced from the database, stock reserved, cart cleared, team alerted", async () => {
  await asSuperuser();
  await db.query(`insert into public.cart_items (user_id, variant_id, quantity) values ($1, $2, 2) on conflict do nothing`, [bob, ckVar.id]);
  await user(bob);
  // A tampered price in the request is ignored; duplicate lines are merged.
  const [o] = await rows(`select * from public.place_order($1::jsonb)`, [order([{ variant_id: ckVar.id, quantity: 1, price: 1 }, { variant_id: ckVar.id, quantity: 1 }], bobAddr, "Ring the bell")]);
  ckOrder = o.order_id;
  assert(o.grand_total === ckVar.price * 2, `total ${o.grand_total} != ${ckVar.price * 2}`);
  const [row] = await rows(`select payment_method, status, customer_name, shipping_address ->> 'city' as city from public.orders where id = $1`, [ckOrder]);
  assert(row.payment_method === "cod" && row.status === "new" && row.city === "Kozhikode", "order fields wrong");
  assert((await rows(`select 1 from public.order_items where order_id = $1 and quantity = 2`, [ckOrder])).length === 1, "items not merged");
  await asSuperuser();
  const [inv] = await rows(`select on_hand, reserved from public.inventory where variant_id = $1`, [ckVar.id]);
  assert(inv.on_hand === 10 && inv.reserved === 2, `inventory ${inv.on_hand}/${inv.reserved}`);
  assert((await rows(`select 1 from public.cart_items where user_id = $1`, [bob])).length === 0, "cart not cleared");
  assert((await rows(`select 1 from public.payments where order_id = $1 and provider = 'cod'`, [ckOrder])).length === 1, "no payment row");
  assert((await rows(`select 1 from public.notifications where user_id = $1 and title like 'New order%'`, [admin2])).length === 1, "admin not alerted");
});
await test("checkout: can't oversell, use someone else's address, or write order items directly", async () => {
  await user(bob);
  await expectError(`select * from public.place_order($1::jsonb)`, [order([{ variant_id: ckVar.id, quantity: 9 }], bobAddr)], /Only 8 left/);
  await expectError(`select * from public.place_order($1::jsonb)`, [order([{ variant_id: ckVar.id, quantity: 1 }], aliceAddr)], /delivery address/);
  await expectError(`select * from public.place_order($1::jsonb)`, [order([], bobAddr)], /empty/);
  await expectError(`insert into public.order_items (order_id, product_name, sku, mrp, unit_price, quantity, line_total) values ($1, 'x', 'X-1', 1, 1, 1, 1)`, [ckOrder], /server only|row-level security/);
  await anon();
  await expectError(`select * from public.place_order($1::jsonb)`, [order([{ variant_id: ckVar.id, quantity: 1 }], bobAddr)], /sign in|permission denied/);
});
await test("checkout: cancelling releases stock, shipping records the sale", async () => {
  await user(admin2);
  await db.query(`update public.orders set status = 'cancelled' where id = $1`, [ckOrder]);
  await asSuperuser();
  assert((await rows(`select reserved from public.inventory where variant_id = $1`, [ckVar.id]))[0].reserved === 0, "reservation not released");
  await user(alice);
  const [o] = await rows(`select * from public.place_order($1::jsonb)`, [order([{ variant_id: ckVar.id, quantity: 3 }], aliceAddr)]);
  await user(admin2);
  for (const s of ["confirmed", "packed", "shipped"]) await db.query(`update public.orders set status = $2 where id = $1`, [o.order_id, s]);
  await asSuperuser();
  const [inv] = await rows(`select on_hand, reserved from public.inventory where variant_id = $1`, [ckVar.id]);
  assert(inv.on_hand === 7 && inv.reserved === 0, `after ship ${inv.on_hand}/${inv.reserved}`);
  assert((await rows(`select 1 from public.stock_movements where reference_id = $1 and type = 'sale' and quantity = -3`, [o.order_id])).length === 1, "no sale movement");
  await user(bob);
  assert((await rows(`select id from public.orders where id = $1`, [o.order_id])).length === 0, "bob sees alice's order");
});

console.log("Razorpay online payments (0028)");
const rzpOrder = (items, address, key) => JSON.stringify({ items, address_id: address, payment_method: "razorpay", checkout_key: key });
const KEY1 = "11111111-2222-4333-8444-555555555555";
let rzp;
await test("razorpay: online order is pending, reserves stock, no early alerts; same checkout key never duplicates", async () => {
  await asSuperuser();
  await db.query(`update public.inventory set on_hand = 10, reserved = 0 where variant_id = $1`, [ckVar.id]);
  await db.query(`delete from public.notifications`);
  await user(bob);
  const [o] = await rows(`select * from public.place_order($1::jsonb)`, [rzpOrder([{ variant_id: ckVar.id, quantity: 2 }], bobAddr, KEY1)]);
  rzp = o;
  assert(o.is_new && o.payment_method === "razorpay" && o.order_status === "pending", `wrong order ${JSON.stringify(o)}`);
  const [again] = await rows(`select * from public.place_order($1::jsonb)`, [rzpOrder([{ variant_id: ckVar.id, quantity: 2 }], bobAddr, KEY1)]);
  assert(!again.is_new && again.order_id === o.order_id, "duplicate order created");
  await asSuperuser();
  assert((await rows(`select reserved from public.inventory where variant_id = $1`, [ckVar.id]))[0].reserved === 2, "stock not reserved once");
  assert((await rows(`select 1 from public.payments where order_id = $1`, [o.order_id])).length === 0, "payment row before attempt");
  assert((await rows(`select 1 from public.notifications where title like 'New%'`)).length === 0, "team alerted before payment");
});
await test("razorpay: only the server can attach attempts or record payments", async () => {
  await user(bob);
  await expectError(`select public.attach_razorpay_order($1, 'order_TEST123456', $2)`, [rzp.order_id, rzp.grand_total], /not authorized|permission denied/);
  await expectError(`select public.record_razorpay_payment($1::jsonb)`, [JSON.stringify({ provider_order_id: "order_TEST123456", provider_payment_id: "pay_TEST123456", status: "captured", amount: rzp.grand_total })], /not authorized|permission denied/);
  await db.query(`update public.orders set payment_status = 'paid' where id = $1`, [rzp.order_id]); // RLS: no rows
  await asSuperuser();
  assert((await rows(`select payment_status from public.orders where id = $1`, [rzp.order_id]))[0].payment_status === "pending", "customer marked own order paid");
  await service();
  await expectError(`select public.attach_razorpay_order($1, 'order_TEST123456', $2)`, [rzp.order_id, rzp.grand_total + 1], /amount mismatch/);
});
await test("razorpay: failure then success; payment applied once; duplicates flagged", async () => {
  await service();
  await rows(`select public.attach_razorpay_order($1, 'order_FAIL000001', $2)`, [rzp.order_id, rzp.grand_total]);
  const pay = (order, id, status, amount = rzp.grand_total) =>
    rows(`select public.record_razorpay_payment($1::jsonb) as r`, [JSON.stringify({ provider_order_id: order, provider_payment_id: id, status, amount, method: "upi", error: "Declined" })]);
  assert((await pay("order_FAIL000001", "pay_FAIL000001", "failed"))[0].r === "failed", "failure not recorded");
  await asSuperuser();
  assert((await rows(`select payment_status, status from public.orders where id = $1`, [rzp.order_id]))[0].payment_status === "failed", "order not marked failed");
  await service();
  await rows(`select public.attach_razorpay_order($1, 'order_PAID000001', $2)`, [rzp.order_id, rzp.grand_total]);
  assert((await pay("order_PAID000001", "pay_PAID000001", "captured", 1))[0].r === "amount_mismatch", "wrong amount accepted");
  assert((await pay("order_PAID000001", "pay_PAID000001", "captured"))[0].r === "paid", "capture not applied");
  assert((await pay("order_PAID000001", "pay_PAID000001", "captured"))[0].r === "already_paid", "webhook replay applied twice");
  assert((await pay("order_PAID000001", "pay_OTHER00001", "captured"))[0].r === "duplicate", "second charge not flagged");
  assert((await pay("order_NOPE000001", "pay_NOPE000001", "captured"))[0].r === "unknown_order", "unknown order accepted");
  await asSuperuser();
  const [o] = await rows(`select status, payment_status from public.orders where id = $1`, [rzp.order_id]);
  assert(o.status === "confirmed" && o.payment_status === "paid", `order ${o.status}/${o.payment_status}`);
  assert((await rows(`select 1 from public.notifications where title like 'New paid order%' and user_id = $1`, [admin2])).length === 1, "team not alerted once");
  assert((await rows(`select 1 from public.notifications where title like 'Duplicate payment%'`)).length >= 1, "duplicate not flagged");
  await service();
  await expectError(`select public.attach_razorpay_order($1, 'order_LATE000001', $2)`, [rzp.order_id, rzp.grand_total], /no longer be paid/);
});
await test("razorpay: unpaid online orders expire after 30 minutes and release stock", async () => {
  await user(alice);
  const [o] = await rows(`select * from public.place_order($1::jsonb)`, [rzpOrder([{ variant_id: ckVar.id, quantity: 1 }], aliceAddr, "99999999-2222-4333-8444-555555555555")]);
  await asSuperuser();
  await db.query(`update public.orders set placed_at = now() - interval '31 minutes' where id = $1`, [o.order_id]);
  await user(alice);
  await expectError(`select public.expire_unpaid_orders()`, [], /not authorized|permission denied/);
  await service();
  assert((await rows(`select public.expire_unpaid_orders() as n`))[0].n === 1, "not expired");
  await asSuperuser();
  assert((await rows(`select status from public.orders where id = $1`, [o.order_id]))[0].status === "cancelled", "not cancelled");
  assert((await rows(`select reserved from public.inventory where variant_id = $1`, [ckVar.id]))[0].reserved === 2, "reservation not released");
  await user(bob);
  await expectError(`select * from public.payment_webhook_events`, [], /permission denied|row-level/);
});

console.log("Admin order editing (0029)");
let editOrder;
await test("order edit: admin changes customer and address; customers can't", async () => {
  await asSuperuser();
  await db.query(`update public.inventory set on_hand = 10, reserved = 0 where variant_id = $1`, [ckVar.id]);
  await user(alice);
  const [o] = await rows(`select * from public.place_order($1::jsonb)`, [JSON.stringify({ items: [{ variant_id: ckVar.id, quantity: 1 }], address_id: aliceAddr })]);
  editOrder = o.order_id;
  const details = (name) => JSON.stringify({
    order_id: editOrder, customer_name: name, customer_phone: "+91 98470 22222", customer_email: "alice.new@example.com",
    customer_note: "Gate code 12", address: { line1: "New Street 5", city: "Kochi", state: "Kerala", postal_code: "682001" },
  });
  await expectError(`select public.admin_update_order_details($1::jsonb)`, [details("Alice X")], /permission/);
  await user(admin2);
  await rows(`select public.admin_update_order_details($1::jsonb)`, [details("Alice Updated")]);
  await asSuperuser();
  const [row] = await rows(`select customer_name, customer_phone, customer_email, shipping_address ->> 'city' as city, shipping_address ->> 'line1' as line1 from public.orders where id = $1`, [editOrder]);
  assert(row.customer_name === "Alice Updated" && row.city === "Kochi" && row.line1 === "New Street 5" && row.customer_email === "alice.new@example.com", `details ${JSON.stringify(row)}`);
  assert((await rows(`select 1 from public.audit_logs where entity = 'orders' and entity_id = $1 and details ->> 'edit' = 'customer details'`, [editOrder])).length === 1, "details edit not audited");
  await user(admin2);
  await expectError(`select public.admin_update_order_details($1::jsonb)`, [JSON.stringify({ order_id: editOrder, customer_name: "A", customer_phone: "1", address: { line1: "x", city: "K", state: "K", postal_code: "12" } })], /PIN|house|check/i);
});
await test("order edit: items, prices, delivery and discount recompute totals and stock", async () => {
  await user(admin2);
  const [{ t }] = await rows(`select public.admin_update_order_items($1::jsonb) as t`, [JSON.stringify({
    order_id: editOrder, items: [{ variant_id: ckVar.id, quantity: 3, unit_price: 150000 }], shipping_total: 20000, discount_total: 50000, reason: "Customer wants 3, special price",
  })]);
  assert(t === 150000 * 3 - 50000 + 20000, `total ${t}`);
  await asSuperuser();
  const [o] = await rows(`select subtotal, discount_total, shipping_total, grand_total from public.orders where id = $1`, [editOrder]);
  assert(o.subtotal === 450000 && o.grand_total === t, `order ${JSON.stringify(o)}`);
  assert((await rows(`select reserved from public.inventory where variant_id = $1`, [ckVar.id]))[0].reserved === 3, "reservation not moved to 3");
  assert((await rows(`select amount from public.payments where order_id = $1 and provider = 'cod'`, [editOrder]))[0].amount === t, "COD amount not updated");
  assert((await rows(`select 1 from public.order_status_history where order_id = $1 and note like 'Items edited%'`, [editOrder])).length === 1, "no history note");
  await user(admin2);
  await expectError(`select public.admin_update_order_items($1::jsonb)`, [JSON.stringify({ order_id: editOrder, items: [{ variant_id: ckVar.id, quantity: 20 }], reason: "too many" })], /in stock/);
  await expectError(`select public.admin_update_order_items($1::jsonb)`, [JSON.stringify({ order_id: editOrder, items: [{ variant_id: ckVar.id, quantity: 1 }], discount_total: 99999999, reason: "x" })], /discount/);
  await expectError(`select public.admin_update_order_items($1::jsonb)`, [JSON.stringify({ order_id: editOrder, items: [], reason: "x" })], /at least one item/);
  await expectError(`select public.admin_update_order_items($1::jsonb)`, [JSON.stringify({ order_id: editOrder, items: [{ variant_id: ckVar.id, quantity: 1 }] })], /reason/);
  // Staff still can't change totals by writing the table directly.
  await expectError(`update public.orders set grand_total = 1, subtotal = 1, discount_total = 0, shipping_total = 0 where id = $1`, [editOrder], /cannot be changed/);
  await user(alice);
  await expectError(`select public.admin_update_order_items($1::jsonb)`, [JSON.stringify({ order_id: editOrder, items: [{ variant_id: ckVar.id, quantity: 1, unit_price: 100 }], reason: "cheap" })], /permission/);
});
await test("order edit: paid or shipped orders keep their items", async () => {
  await user(admin2);
  await expectError(`select public.admin_update_order_items($1::jsonb)`, [JSON.stringify({ order_id: rzp.order_id, items: [{ variant_id: ckVar.id, quantity: 1 }], reason: "x" })], /already paid/);
  for (const s of ["confirmed", "packed", "shipped"]) await db.query(`update public.orders set status = $2 where id = $1`, [editOrder, s]);
  await expectError(`select public.admin_update_order_items($1::jsonb)`, [JSON.stringify({ order_id: editOrder, items: [{ variant_id: ckVar.id, quantity: 1 }], reason: "x" })], /before the order ships/);
  await expectError(`select public.admin_update_order_details($1::jsonb)`, [JSON.stringify({ order_id: editOrder, customer_name: "Alice", customer_phone: "+91 98470 22222", address: { line1: "New Street 5", city: "Kochi", state: "Kerala", postal_code: "682001" } })], /before they ship/);
});

console.log("Password resets (Update 01 phase 07)");
const HASH = "$2b$12$" + "a".repeat(53);
let prId;
await test("password reset: only the server can file a request; reviewers never see the hash", async () => {
  await user(bob);
  await expectError(`select public.create_password_reset_request($1, 'mobile', '+919847000000', $2)`, [bob, HASH], /not authorized/i);
  await service();
  const code = (await rows(`select public.create_password_reset_request($1, 'mobile', '+919847000000', $2) as c`, [bob, HASH]))[0].c;
  assert(/^KD-PR-\d{6}$/.test(code), `code ${code}`);
  await asSuperuser();
  prId = (await rows(`select id from public.password_reset_requests where request_code = $1`, [code]))[0].id;
  assert((await rows(`select 1 from public.notifications where user_id = $1 and title = $2`, [superAdmin, `Password reset request ${code}`])).length === 1, "super admin not alerted");
  await user(superAdmin);
  const [r] = await rows(`select * from public.password_reset_requests where id = $1`, [prId]);
  assert(r && r.status === "pending" && !("password_hash" in r), "reviewer sees request wrongly");
  await expectError(`select * from private.password_reset_secrets`, [], /permission denied/);
  await user(admin2);
  assert((await rows(`select id from public.password_reset_requests`)).length === 0, "admin without permission sees requests");
  await expectError(`select public.review_password_reset($1, true)`, [prId], /not authorized/i);
  await user(bob);
  assert((await rows(`select id from public.password_reset_requests`)).length === 0, "customer sees requests");
});
await test("password reset: approve → server applies hash → completed; reject keeps old password", async () => {
  await user(superAdmin);
  assert((await rows(`select public.review_password_reset($1, true, 'Called the customer') as s`, [prId]))[0].s === "approved", "not approved");
  await user(superAdmin);
  await expectError(`select * from public.take_password_reset_hash($1)`, [prId], /not authorized/i);
  await service();
  const [h] = await rows(`select * from public.take_password_reset_hash($1)`, [prId]);
  assert(h && h.user_id === bob && h.password_hash === HASH, "hash not handed to server");
  await db.query(`select public.complete_password_reset($1, true)`, [prId]);
  await asSuperuser();
  const [done] = await rows(`select status, completed_at from public.password_reset_requests where id = $1`, [prId]);
  assert(done.status === "completed" && done.completed_at, "not completed");
  assert((await rows(`select 1 from private.password_reset_secrets where request_id = $1`, [prId])).length === 0, "hash kept after completion");
  assert((await rows(`select 1 from public.audit_logs where entity = 'password_reset_requests' and entity_id = $1`, [prId])).length >= 2, "not audited");
  // Reject path
  await service();
  await rows(`select public.create_password_reset_request($1, 'email', 'alice@test.local', $2)`, [alice, HASH]);
  await asSuperuser();
  const [{ id: aliceReq }] = await rows(`select id from public.password_reset_requests where user_id = $1 and status = 'pending'`, [alice]);
  await user(superAdmin);
  await rows(`select public.review_password_reset($1, false, 'Could not verify')`, [aliceReq]);
  await service();
  assert((await rows(`select * from public.take_password_reset_hash($1)`, [aliceReq])).length === 0, "rejected hash still available");
});
await test("password reset: expiry, rate limit and no self-approval", async () => {
  await service();
  await rows(`select public.create_password_reset_request($1, 'email', 'owner@test.local', $2)`, [superAdmin, HASH]);
  await asSuperuser();
  const [{ id: own }] = await rows(`select id from public.password_reset_requests where user_id = $1 and status = 'pending'`, [superAdmin]);
  await user(superAdmin);
  await expectError(`select public.review_password_reset($1, true)`, [own], /own request/);
  await asSuperuser();
  await db.query(`update public.password_reset_requests set expires_at = now() - interval '1 minute' where id = $1`, [own]);
  await service();
  await rows(`select public.expire_password_resets()`);
  await asSuperuser();
  assert((await rows(`select status from public.password_reset_requests where id = $1`, [own]))[0].status === "expired", "not expired");
  await service();
  await rows(`select public.create_password_reset_request($1, 'mobile', '+919847000000', $2)`, [bob, HASH]);
  await rows(`select public.create_password_reset_request($1, 'mobile', '+919847000000', $2)`, [bob, HASH]);
  await expectError(`select public.create_password_reset_request($1, 'mobile', '+919847000000', $2)`, [bob, HASH], /rate_limited/);
});

console.log("BEST FIT catalog & inspection-first (Update 01 phases 08-09)");
await test("catalog: public reads active entries; only service managers edit", async () => {
  await anon();
  const opts = (await rows(`select slug from public.service_options order by sort_order`)).map((r) => r.slug);
  assert(opts.join(",") === "service,fitting,other", `options ${opts}`);
  await user(bob);
  await expectError(`insert into public.service_types (slug, name) values ('hack', 'Hack')`, [], /row-level security/);
  await user(admin2);
  await db.query(`insert into public.service_categories (slug, name) values ('baby-walker', 'Baby Walker')`);
  await db.query(`update public.service_categories set is_active = false where slug = 'baby-walker'`);
  await anon();
  assert((await rows(`select 1 from public.service_categories where slug = 'baby-walker'`)).length === 0, "inactive category is public");
});
let ifBooking;
await test("inspection-first: no date needed, inactive choices refused, fitting kind kept", async () => {
  await asSuperuser();
  await db.query(`update public.service_bookings set status = 'cancelled' where customer_id = $1 and status not in ('completed','invoiced','cancelled')`, [alice]);
  await user(alice);
  const code = (await rows(`select public.create_service_booking($1::jsonb) as c`, [booking({ preferred_date: "", booking_kind: "fitting", service_type: "installation" })]))[0].c;
  await asSuperuser();
  const [b] = await rows(`select id, preferred_date, booking_kind, status from public.service_bookings where booking_code = $1`, [code]);
  ifBooking = b.id;
  assert(b.preferred_date === null && b.booking_kind === "fitting" && b.status === "new", JSON.stringify(b));
  await user(alice);
  await expectError(`select public.create_service_booking($1::jsonb)`, [booking({ category: "baby-walker" })], /category/);
  await expectError(`select public.create_service_booking($1::jsonb)`, [booking({ booking_kind: "other" })], /not available/);
});
await test("inspection-first: timeline steps in order, by the technician or a manager", async () => {
  await user(admin2);
  await db.query(`select public.assign_service_booking($1, $2)`, [ifBooking, svc]);
  await user(svc);
  await db.query(`select public.respond_service_job($1, true)`, [ifBooking]);
  await expectError(`select public.advance_service_job($1, 'completed')`, [ifBooking], /not available/);
  await db.query(`select public.advance_service_job($1, 'inspection_started', 'Checking battery')`, [ifBooking]);
  await db.query(`select public.advance_service_job($1, 'inspection_completed')`, [ifBooking]);
  await user(admin2);
  await db.query(`select public.advance_service_job($1, 'started')`, [ifBooking]);
  await user(svc);
  await db.query(`select public.advance_service_job($1, 'completed')`, [ifBooking]);
  await db.query(`select public.advance_service_job($1, 'ready_for_delivery')`, [ifBooking]);
  await asSuperuser();
  const steps = (await rows(`select status, note from public.service_job_events where booking_id = $1 order by id`, [ifBooking])).map((e) => e.status);
  assert(steps.join(",").endsWith("inspection_started,inspection_completed,started,completed,ready_for_delivery"), steps.join(","));
  assert((await rows(`select 1 from public.service_job_events where booking_id = $1 and note = 'Checking battery'`, [ifBooking])).length === 1, "note not stored");
  await user(alice);
  assert((await rows(`select 1 from public.service_job_events where booking_id = $1`, [ifBooking])).length >= 5, "customer can't see own timeline");
  await user(bob);
  assert((await rows(`select 1 from public.service_job_events where booking_id = $1`, [ifBooking])).length === 0, "bob sees alice's timeline");
});

console.log("Spare parts, replaced items & service billing (Update 01 phases 10-11)");
let spJob, battery;
await test("spare parts: technicians search without purchase prices; stock changes only via the ledger", async () => {
  await asSuperuser();
  battery = (await rows(`select id from public.spare_parts where sku = 'SP-BAT-12V'`))[0].id;
  await user(admin2);
  await db.query(`update public.spare_parts set selling_price_paise = 150000 where id = $1`, [battery]);
  await db.query(`update public.spare_part_costs set purchase_price_paise = 90000 where part_id = $1`, [battery]);
  await db.query(`select public.adjust_spare_part_stock($1, 'stock_in', 5, 'First delivery')`, [battery]);
  await expectError(`update public.spare_parts set stock = 99 where id = $1`, [battery], /stock movement/);
  await user(svc);
  const found = await rows(`select * from public.search_spare_parts('battery')`);
  assert(found.some((p) => p.id === battery && p.stock === 5 && p.selling_price_paise === 150000), JSON.stringify(found));
  assert((await rows(`select * from public.spare_part_costs`)).length === 0, "technician sees purchase prices");
  await expectError(`select public.adjust_spare_part_stock($1, 'stock_in', 5)`, [battery], /not authorized/i);
});
await test("replaced items: parts take stock, custom items wait for approval and can join the master list", async () => {
  await asSuperuser();
  await db.query(`update public.service_bookings set status = 'cancelled' where customer_id = $1 and status not in ('completed','ready_for_delivery','invoiced','cancelled')`, [alice]);
  await user(alice);
  const code = (await rows(`select public.create_service_booking($1::jsonb) as c`, [booking({ preferred_date: "", product_name: "Parts test jeep" })]))[0].c;
  await asSuperuser();
  spJob = (await rows(`select id from public.service_bookings where booking_code = $1`, [code]))[0].id;
  await user(admin2);
  await db.query(`select public.assign_service_booking($1, $2)`, [spJob, svc]);
  await user(svc);
  await db.query(`select public.respond_service_job($1, true)`, [spJob]);
  await db.query(`select public.advance_service_job($1, 'inspection_started')`, [spJob]);
  await db.query(`select public.set_replaced_part($1, $2, 2)`, [spJob, battery]);
  await db.query(`select public.set_replaced_part($1, $2, 1)`, [spJob, battery]);
  await expectError(`select public.set_replaced_part($1, $2, 50)`, [spJob, battery], /Not enough stock/);
  await asSuperuser();
  assert((await rows(`select stock from public.spare_parts where id = $1`, [battery]))[0].stock === 4, "stock not 4");
  const moves = (await rows(`select type, quantity from public.spare_part_movements where booking_id = $1 order by id`, [spJob])).map((m) => `${m.type}${m.quantity}`);
  assert(moves.join(",") === "used-2,returned1", moves.join(","));
  await user(svc2);
  await expectError(`select public.set_replaced_part($1, $2, 1)`, [spJob, battery], /not authorized/i);
  await user(svc);
  await db.query(`select public.add_custom_replaced_item($1, 'Horn switch', 1, 25000, true)`, [spJob]);
  await expectError(`select public.add_custom_replaced_item($1, 'horn switch ', 1, 25000)`, [spJob], /already on the bill/);
  await asSuperuser();
  const [custom] = await rows(`select id, approval_status, master_request from public.service_replaced_items where booking_id = $1 and custom_name is not null`, [spJob]);
  assert(custom.approval_status === "pending" && custom.master_request === "requested", JSON.stringify(custom));
  assert((await rows(`select 1 from public.spare_parts where name = 'Horn switch'`)).length === 0, "custom item joined master list by itself");
  await user(svc);
  await expectError(`select public.review_custom_replaced_item($1, true)`, [custom.id], /not authorized/i);
  await user(admin2);
  await db.query(`select public.review_custom_replaced_item($1, true, 30000, true, 'SP-HORN-SW', 'OK')`, [custom.id]);
  await asSuperuser();
  assert((await rows(`select 1 from public.spare_parts where sku = 'SP-HORN-SW' and name = 'Horn switch'`)).length === 1, "not added to master list");
});
await test("billing: technician drafts, customer sees it only after approval, partial payment and balance", async () => {
  await user(svc);
  for (const s of ["inspection_completed", "started", "completed"]) await db.query(`select public.advance_service_job($1, $2)`, [spJob, s]);
  await db.query(`select public.save_service_invoice($1, $2::jsonb)`, [spJob, JSON.stringify({ basic_charge: 50000, labour_charge: 0, discount: 0, tax_percent: 0, items: [{ description: "Cleaning", quantity: 1, unit_price: 10000 }], amount_paid: 0 })]);
  await asSuperuser();
  const [d] = await rows(`select approval_status, spare_parts_total, additional_total, grand_total from public.service_invoices where booking_id = $1`, [spJob]);
  assert(d.approval_status === "draft" && d.spare_parts_total === 150000 + 30000 && d.additional_total === 10000 && d.grand_total === 50000 + 10000 + 180000, JSON.stringify(d));
  await user(alice);
  assert((await rows(`select 1 from public.service_invoices where booking_id = $1`, [spJob])).length === 0, "customer sees a draft bill");
  await user(admin2);
  await db.query(`select public.save_service_invoice($1, $2::jsonb)`, [spJob, JSON.stringify({ basic_charge: 50000, labour_charge: 0, discount: 0, tax_percent: 0, items: [{ description: "Cleaning", quantity: 1, unit_price: 10000 }], amount_paid: 100000, payment_method: "upi", approve: true })]);
  await user(alice);
  const [c] = await rows(`select approval_status, payment_status, balance from public.service_invoices where booking_id = $1`, [spJob]);
  assert(c && c.approval_status === "approved" && c.payment_status === "partial" && c.balance === 140000, JSON.stringify(c));
  await user(svc);
  await expectError(`select public.save_service_invoice($1, $2::jsonb)`, [spJob, JSON.stringify({ basic_charge: 1, items: [] })], /approved bills/);
  await user(admin2);
  const stats = (await rows(`select public.service_dashboard_stats() as s`))[0].s;
  assert(stats.spare_parts_revenue >= 180000 && stats.pending_payments >= 140000 && typeof stats.inspection_pending === "number", JSON.stringify(stats));
  await user(bob);
  await expectError(`select public.service_dashboard_stats()`, [], /not authorized/i);
});

console.log("Prepaid / COD discounts (0032)");
await test("discounts: prepaid % off and free delivery online, COD % separate, totals stored", async () => {
  await asSuperuser();
  const [v] = await rows(
    `select v.id, v.price, v.product_id from public.product_variants v join public.products p on p.id = v.product_id
      where v.is_active and p.status = 'active' order by v.sku desc limit 1`,
  );
  await db.query(`update public.products set prepaid_discount_pct = 3, cod_discount_pct = 1.5 where id = $1`, [v.product_id]);
  await db.query(`update public.inventory set on_hand = 20, reserved = 0 where variant_id = $1`, [v.id]);
  await db.query(`update public.store_settings set value = '9900' where key = 'shipping.flat_rate'`);
  await db.query(`update public.store_settings set value = 'null' where key = 'shipping.free_shipping_threshold'`);
  const items = [{ variant_id: v.id, quantity: 3 }];
  await anon();
  const [on] = await rows(`select * from public.price_order($1::jsonb)`, [JSON.stringify({ items, payment_method: "razorpay" })]);
  const [cod] = await rows(`select * from public.price_order($1::jsonb)`, [JSON.stringify({ items, payment_method: "cod" })]);
  const sub = v.price * 3;
  assert(on.subtotal === sub && on.discount_total === Math.round(sub * 0.03) && on.shipping_total === 0, JSON.stringify(on));
  assert(on.grand_total === sub - on.discount_total, "online total");
  assert(cod.discount_total === Math.round(sub * 0.015) && cod.shipping_total === 9900 && cod.grand_total === sub - cod.discount_total + 9900, JSON.stringify(cod));
  await user(alice);
  const [o] = await rows(`select * from public.place_order($1::jsonb)`, [JSON.stringify({ items, address_id: aliceAddr, payment_method: "razorpay", checkout_key: "00000000-0000-4000-8000-000000000321" })]);
  assert(o.grand_total === on.grand_total, `order ${o.grand_total} != quote ${on.grand_total}`);
  await asSuperuser();
  const [row] = await rows(`select subtotal, discount_total, shipping_total, grand_total from public.orders where id = $1`, [o.order_id]);
  assert(row.discount_total === on.discount_total && row.shipping_total === 0 && row.grand_total === on.grand_total, JSON.stringify(row));
  await db.query(`update public.store_settings set value = '0' where key = 'shipping.flat_rate'`);
});


console.log("Manual bills (0034)");
await test("bills: sale bill reduces stock, totals and number set, cancel puts stock back", async () => {
  await asSuperuser();
  const [v] = await rows(`select v.id, v.price from public.product_variants v where v.is_active order by v.sku limit 1`);
  await db.query(`update public.inventory set on_hand = 5, reserved = 0 where variant_id = $1`, [v.id]);
  await user(admin2);
  const p = { kind: "sale", customer_id: alice, customer_name: "Alice", customer_phone: "9876543210", discount: 1000, payments: [],
    items: [{ variant_id: v.id, description: "", quantity: 2, unit_price: 50000 }, { description: "Gift wrap", quantity: 1, unit_price: 2000 }] };
  const [{ b }] = await rows(`select public.create_bill($1::jsonb) as b`, [JSON.stringify({ ...p, payments: [{ method: "cash", amount: 1000 }, { method: "upi", amount: 100000, reference: "UTR123" }] })]);
  assert(/^KD-SL-\d{6}$/.test(b.number), b.number);
  const [bill] = await rows(`select * from public.bills where id = $1`, [b.id]);
  assert(bill.subtotal === 102000 && bill.grand_total === 101000 && bill.payment_status === "paid" && bill.payment_method === "mixed", JSON.stringify(bill));
  assert(bill.customer_id === alice && /^KD-CUS-/.test(bill.customer_code), `customer ${bill.customer_code}`);
  const pays = await rows(`select method, amount from public.bill_payments where bill_id = $1 order by position`, [b.id]);
  assert(pays.length === 2 && pays[1].method === "upi" && pays[1].amount === 100000, JSON.stringify(pays));
  await asSuperuser();
  const [inv] = await rows(`select on_hand from public.inventory where variant_id = $1`, [v.id]);
  assert(inv.on_hand === 3, `stock ${inv.on_hand}`);
  await user(admin2);
  await expectError(`select public.create_bill($1::jsonb)`, [JSON.stringify({ ...p, items: [{ variant_id: v.id, description: "", quantity: 9, unit_price: 1 }] })], /not enough stock/);
  await expectError(`select public.create_bill($1::jsonb)`, [JSON.stringify({ ...p, discount: 999999 })], /discount/);
  await expectError(`select public.create_bill($1::jsonb)`, [JSON.stringify({ ...p, payments: [{ method: "bitcoin", amount: 500 }] })], /how the customer paid/);
  await expectError(`select public.create_bill($1::jsonb)`, [JSON.stringify({ ...p, payments: [{ method: "cash", amount: 200000 }] })], /more than the total/);
  await db.query(`select public.cancel_bill($1, 'Customer returned')`, [b.id]);
  await asSuperuser();
  const [after] = await rows(`select on_hand from public.inventory where variant_id = $1`, [v.id]);
  const [c] = await rows(`select status from public.bills where id = $1`, [b.id]);
  assert(after.on_hand === 5 && c.status === "cancelled", `${after.on_hand} ${c.status}`);
});
await test("bills: service bill has its own numbers, no products; customers can't bill or read", async () => {
  await user(admin2);
  const [{ b }] = await rows(`select public.create_bill($1::jsonb) as b`, [JSON.stringify({ kind: "service", customer_name: "Ravi", vehicle: "Kids jeep 12V", discount: 0, payments: [{ method: "cash", amount: 10000 }],
    items: [{ description: "Battery check", quantity: 1, unit_price: 30000 }] })]);
  assert(/^KD-SV-\d{6}$/.test(b.number), b.number);
  const [x] = await rows(`select payment_status, grand_total from public.bills where id = $1`, [b.id]);
  assert(x.payment_status === "partial" && x.grand_total === 30000, JSON.stringify(x));
  await user(alice);
  await expectError(`select public.create_bill($1::jsonb)`, [JSON.stringify({ kind: "service", customer_name: "x", items: [{ description: "a", quantity: 1, unit_price: 1 }] })], /not authorized/);
  const seen = await rows(`select customer_id from public.bills`);
  assert(seen.every((x) => x.customer_id === alice), "customer can read other people's bills");
  await anon();
  await expectError(`select public.create_bill('{}'::jsonb)`, [], /permission denied/);
});
await test("bills: next customer ID is the one a new customer gets; staff only", async () => {
  await user(admin2);
  const [{ c }] = await rows(`select public.next_customer_code() as c`);
  await asSuperuser();
  const [u] = await rows(`insert into auth.users (email, raw_user_meta_data) values ('walkin@test.local', '{"full_name":"Walk In"}') returning id`);
  const [pr] = await rows(`select customer_code from public.profiles where id = $1`, [u.id]);
  assert(pr.customer_code === c, `${pr.customer_code} != ${c}`);
  await user(alice);
  await expectError(`select public.next_customer_code()`, [], /not authorized/);
});
await test("bills: a bill with only a phone links to that customer's account, who can read it", async () => {
  await asSuperuser();
  await db.query(`update public.profiles set phone = '+91 98470 11111' where id = $1`, [bob]);
  await user(admin2);
  const [{ b }] = await rows(`select public.create_bill($1::jsonb) as b`, [JSON.stringify({ kind: "service", customer_name: "Bob", customer_phone: "9847011111", discount: 0, payments: [],
    items: [{ description: "Check-up", quantity: 1, unit_price: 5000 }] })]);
  await user(bob);
  const mine = await rows(`select customer_code, (select count(*) from public.bill_items i where i.bill_id = b.id)::int as n from public.bills b where id = $1`, [b.id]);
  assert(mine.length === 1 && /^KD-CUS-/.test(mine[0].customer_code) && mine[0].n === 1, JSON.stringify(mine));
  await user(alice);
  assert((await rows(`select id from public.bills where id = $1`, [b.id])).length === 0, "other customer sees it");
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);

-- KING DAY — reference data (safe for every environment).
-- Contains no products, customers, orders or prices.

insert into public.categories (name, slug, description, sort_order) values
  ('Electric Jeeps & Cars', 'electric-jeeps-cars', 'Ride-on jeeps and cars with parental remotes, soft-start motors and real-feel details.', 10),
  ('Bikes', 'bikes', 'Balance bikes, kids'' electric bikes and safety gear for confident first rides.', 20),
  ('Scooters', 'scooters', 'Kick and electric scooters with light frames, wide decks and smooth wheels.', 30),
  ('Tricycles', 'tricycles', 'Push tricycles with parent handles that grow with your toddler.', 40),
  ('Cycles', 'cycles', 'Kids'' bicycles from 12" to 20" with training wheels and gears.', 50),
  ('Toys', 'toys', 'Building sets, remote racers and plush companions for play at home.', 60),
  ('Baby Accessories', 'baby-accessories', 'Walkers, car seats and everyday essentials for little royals.', 70)
on conflict (slug) do nothing;

insert into public.store_settings (key, value, is_public) values
  ('store.name', '"KING DAY"', true),
  ('store.tagline', '"Every child deserves a royal ride."', true),
  ('store.currency', '"INR"', true),
  ('checkout.cod_enabled', 'true', true),
  ('checkout.cod_max_order_value', '5000000', false),
  ('shipping.free_shipping_threshold', 'null', true),
  ('shipping.flat_rate', '0', true),
  ('tax.prices_include_gst', 'true', true)
on conflict (key) do nothing;

-- KING DAY — 0009 Storage buckets and policies.
-- Public buckets serve catalogue media by public URL; only staff can write.
-- customer-uploads is private: each user may only touch files under "<their uid>/...".
-- SVG is deliberately not allowed (it can carry scripts).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('product-images',  'product-images',  true,  5242880,  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('product-videos',  'product-videos',  true,  52428800, array['video/mp4', 'video/webm']),
  ('category-images', 'category-images', true,  5242880,  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('brand-logos',     'brand-logos',     true,  2097152,  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('customer-uploads','customer-uploads',false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Catalogue media: anyone can read, staff can write.
create policy "catalogue media: public read" on storage.objects for select to anon, authenticated
  using (bucket_id in ('product-images', 'product-videos', 'category-images', 'brand-logos'));

create policy "catalogue media: staff insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('product-images', 'product-videos', 'category-images', 'brand-logos') and (select private.is_staff()));

create policy "catalogue media: staff update" on storage.objects for update to authenticated
  using (bucket_id in ('product-images', 'product-videos', 'category-images', 'brand-logos') and (select private.is_staff()))
  with check (bucket_id in ('product-images', 'product-videos', 'category-images', 'brand-logos') and (select private.is_staff()));

create policy "catalogue media: staff delete" on storage.objects for delete to authenticated
  using (bucket_id in ('product-images', 'product-videos', 'category-images', 'brand-logos') and (select private.is_staff()));

-- Customer uploads: private, per-user folder.
create policy "customer uploads: read own or staff" on storage.objects for select to authenticated
  using (
    bucket_id = 'customer-uploads'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_staff()))
  );

create policy "customer uploads: insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'customer-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "customer uploads: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'customer-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);

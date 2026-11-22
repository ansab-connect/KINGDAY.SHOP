-- KING DAY — 0033 Instagram reel / YouTube link per product, shown in the product gallery.
--
-- products.video_link  normalised https link (instagram.com/reel|p/... or youtube.com/watch|shorts/...)
--
-- Down (manual): alter table public.products drop column video_link;

alter table public.products
  add column video_link text
    check (video_link is null or video_link ~ '^https://www\.(instagram\.com/(reel|p)/[A-Za-z0-9_-]{5,40}/|youtube\.com/(watch\?v=|shorts/)[A-Za-z0-9_-]{11})$');

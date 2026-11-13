import { publicEnv } from "@/lib/env";

export type PublicBucket = "product-images" | "product-videos" | "category-images" | "brand-logos";

/** Public URL for an object in a public Supabase Storage bucket. */
export function publicStorageUrl(bucket: PublicBucket, path: string | null | undefined): string | null {
  if (!path || !publicEnv.supabaseUrl) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${publicEnv.supabaseUrl}/storage/v1/object/public/${bucket}/${encoded}`;
}

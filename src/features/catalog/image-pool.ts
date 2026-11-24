/**
 * Temporary image gallery ("pool") for one product.
 *
 * No new tables: the pool is simply every image file in the product's existing storage
 * folder (product-images/products/<productId>/). A file is "assigned" while at least one
 * product_images row points at it (a variant's gallery or the shared gallery); the same
 * file can back rows of several variants. Files with no row are unused and are the only
 * ones "Remove Unused Temporary Images" deletes.
 */

export const POOL_MAX_FILES = 200;
export const GALLERY_MAX = 12;

const FILE_RE = /^[a-z0-9-]{8,64}\.(webp|jpg|jpeg|png|avif)$/;

export const poolFolder = (productId: string) => `products/${productId}`;

/** Storage object names in the folder → full paths of image files (folders/placeholders skipped). */
export function poolPaths(productId: string, names: string[]): string[] {
  return names.filter((n) => FILE_RE.test(n)).map((n) => `${poolFolder(productId)}/${n}`);
}

/** Files in the pool that no gallery uses. Anything referenced anywhere is never returned. */
export function unusedPoolPaths(paths: string[], used: Iterable<string>): string[] {
  const keep = new Set(used);
  return paths.filter((p) => !keep.has(p));
}

/**
 * Turn a variant's chosen images (in order) into the changes for its gallery rows:
 * rows to drop (their files stay in the pool), files to add, and the final order.
 */
export function planGallery(current: { id: string; storage_path: string }[], chosen: string[]) {
  const wanted = [...new Set(chosen)].slice(0, GALLERY_MAX);
  const byPath = new Map<string, string>();
  const remove: string[] = [];
  for (const row of current) {
    if (wanted.includes(row.storage_path) && !byPath.has(row.storage_path)) byPath.set(row.storage_path, row.id);
    else remove.push(row.id);
  }
  const add = wanted.filter((p) => !byPath.has(p));
  return { remove, add, wanted, existingIdFor: (path: string) => byPath.get(path) ?? null };
}

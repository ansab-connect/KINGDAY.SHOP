/**
 * Categories nest to any depth: Cycles › Electric Cycles › Women. These helpers work on
 * any list of { id, parentId } (admin uses uuids, the store uses slugs) and never loop,
 * even if the data has a cycle or a missing parent.
 */
export type TreeItem = { id: string; parentId: string | null };

/** ids from the top-level category down to `id` (inclusive). */
export function pathIds<T extends TreeItem>(items: T[], id: string): string[] {
  const byId = new Map(items.map((c) => [c.id, c]));
  const out: string[] = [];
  const seen = new Set<string>();
  let cur: string | null = id;
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    out.unshift(cur);
    cur = byId.get(cur)?.parentId ?? null;
  }
  return out;
}

/** All categories below `id` (children, grandchildren, …), not including `id`. */
export function descendantIds<T extends TreeItem>(items: T[], id: string): Set<string> {
  const kids = new Map<string, string[]>();
  for (const c of items) if (c.parentId) kids.set(c.parentId, [...(kids.get(c.parentId) ?? []), c.id]);
  const out = new Set<string>();
  const stack = [...(kids.get(id) ?? [])];
  while (stack.length) {
    const x = stack.pop()!;
    if (out.has(x) || x === id) continue;
    out.add(x);
    stack.push(...(kids.get(x) ?? []));
  }
  return out;
}

/**
 * Tree order (each parent followed by its children, keeping the given sibling order),
 * with depth (0 = top level). Items whose parent is missing are treated as top level.
 */
export function treeOrder<T extends TreeItem>(items: T[]): (T & { depth: number })[] {
  const ids = new Set(items.map((c) => c.id));
  const kids = new Map<string | null, T[]>();
  for (const c of items) {
    const p = c.parentId && ids.has(c.parentId) && c.parentId !== c.id ? c.parentId : null;
    kids.set(p, [...(kids.get(p) ?? []), c]);
  }
  const out: (T & { depth: number })[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const c of kids.get(parent) ?? []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ ...c, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  // Anything left is in a loop: show it at the top level rather than hide it.
  for (const c of items) if (!seen.has(c.id)) out.push({ ...c, depth: 0 });
  return out;
}

/** "Cycles › Electric Cycles › Women" */
export function pathLabel<T extends TreeItem & { name: string }>(items: T[], id: string, sep = " › "): string {
  const byId = new Map(items.map((c) => [c.id, c]));
  return pathIds(items, id)
    .map((x) => byId.get(x)?.name ?? "")
    .filter(Boolean)
    .join(sep);
}

/** Keeps the first item seen for each id; later duplicates are dropped. */
export function dedupById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const kept: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    kept.push(item);
  }
  return kept;
}

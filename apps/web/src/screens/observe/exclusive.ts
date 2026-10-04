/** Choose or clear one item of a multi-choice list where some items cannot go together (the exclusive groups of the knowledge base). */
export function toggleExclusive(selected: readonly string[], id: string, on: boolean, groups: readonly (readonly string[])[]): { next: string[]; replaced: readonly string[] | null } {
  if (!on) return { next: selected.filter((x) => x !== id), replaced: null };
  const clash = groups.find((g) => g.includes(id) && selected.some((x) => x !== id && g.includes(x)));
  const next = clash ? selected.filter((x) => !clash.includes(x)) : [...selected];
  next.push(id);
  return { next, replaced: clash ?? null };
}

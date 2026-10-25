/** Sections hotels can pick from (they can still type their own). Listed in serving order. */
export const MENU_SECTIONS = [
  "Starters",
  "Soups",
  "Chaat & Snacks",
  "Main Course",
  "South Indian",
  "Chinese",
  "Breads",
  "Rice & Biryani",
  "Thali",
  "Combos",
  "Desserts",
  "Beverages",
];

// Lower rank = shown earlier. Matches common section names, not just the suggested ones.
const RANKS: [RegExp, number][] = [
  [/starter|appeti[sz]er|tikka|tandoor|kebab/i, 0],
  [/soup|shorba/i, 1],
  [/chaat|snack|street|sandwich|pav|bhaji|misal/i, 2],
  [/main|curry|sabzi|gravy|dal|paneer/i, 3],
  [/south|dosa|idli|uttapam|breakfast/i, 4],
  [/chinese|indo|noodle|manchurian|pasta|pizza|continental/i, 5],
  [/bread|roti|naan|paratha|kulcha/i, 6],
  [/rice|biryani|pulao|khichdi/i, 7],
  [/thali|meal/i, 8],
  [/combo/i, 9],
  [/dessert|sweet|mithai|ice ?cream/i, 11],
  [/beverage|drink|juice|coffee|tea|shake|lassi|soda/i, 12],
];

export function courseRank(section: string) {
  return RANKS.find(([rx]) => rx.test(section))?.[1] ?? 10; // unknown sections go before desserts
}

/** Groups dishes into sections in serving order (Starters -> Main Course -> ... -> Beverages). */
export function groupBySection<T extends { category: string }>(items: T[]): [string, T[]][] {
  const g = new Map<string, T[]>();
  for (const m of items) {
    const key = m.category?.trim() || "Others";
    g.set(key, [...(g.get(key) ?? []), m]);
  }
  return [...g.entries()].sort((a, b) => courseRank(a[0]) - courseRank(b[0]) || a[0].localeCompare(b[0]));
}

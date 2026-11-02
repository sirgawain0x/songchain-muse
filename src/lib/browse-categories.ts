import type { Ruleset } from "./domain";

export const browseCategories = ["All", "Human", "AI"] as const;
export type BrowseCategory = (typeof browseCategories)[number];

// Browsing groups event rules; it does not upgrade a recording's origin evidence.
// Open includes fully AI-generated entries as well as unverified material.
export function categoryForRuleset(
  ruleset?: Ruleset,
): Exclude<BrowseCategory, "All"> | null {
  if (!ruleset) return null;
  return ruleset === "Pure Human" ? "Human" : "AI";
}

export function matchesCategory(category: BrowseCategory, ruleset?: Ruleset) {
  return category === "All" || categoryForRuleset(ruleset) === category;
}

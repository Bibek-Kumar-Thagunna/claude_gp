import { useI18n, type Language } from "@gopasal/native-ui";
import type { ShopCategory } from "@gopasal/native-data";

/**
 * A category's name, in the language the customer is reading.
 *
 * Categories are the one piece of server data that arrives already translated:
 * `GET /categories` returns `en` and `np` for every row, because the taxonomy
 * is ours rather than a seller's free text. Everything else on these screens —
 * a shop's name, a product a seller typed — is theirs and is shown exactly as
 * they wrote it.
 *
 * That distinction was being lost at the render site: the grid and the shelf
 * headings both reached for `.en` regardless, so a customer reading the app in
 * Nepali saw "Grocery" next to "मासु र माछा" — the second only because the app
 * happened to carry a short form of its own for that one. This puts the choice
 * in one place.
 *
 * `np` is allowed to be empty: a category added through the admin app before
 * anybody has translated it should read as English rather than as a blank tile.
 */
export function categoryName(
  category: Pick<ShopCategory, "en" | "np">,
  language: Language,
): string {
  if (language === "np") return category.np?.trim() || category.en;
  return category.en;
}

/** The same, for the common case of a component that only needs the name. */
export function useCategoryName(): (category: Pick<ShopCategory, "en" | "np">) => string {
  const { language } = useI18n();
  return (category) => categoryName(category, language);
}

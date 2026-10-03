/**
 * How a shop category is drawn.
 *
 * The API describes a category with a `hue` name and a **Lucide** icon name,
 * both chosen for the web consoles. Neither is usable as-is on a phone: Lucide
 * is not one of the icon fonts React Native ships, and a hue name is not a
 * colour. This module is the one place that translation happens, so the three
 * apps cannot end up drawing "Pharmacy" three different ways.
 *
 * Emoji were the first attempt and were wrong. They are a different visual
 * language per platform — Apple's and Google's sets do not match each other,
 * they carry their own drop shadows and gradients, and eight of them in a grid
 * look like a sticker sheet rather than a product. `MaterialCommunityIcons`
 * ships with Expo, covers every category in the taxonomy, and gives one weight
 * and one silhouette across both platforms.
 */
import type { MaterialCommunityIcons } from "@expo/vector-icons";
import { palette } from "./theme";

type MCIName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * A category's four tones.
 *
 * Four rather than two because the artwork is duotone and needs a body colour
 * that is visible against its own tile: `bg` is the wash the tile is painted
 * with, `art` the body of the drawing, `mid` a detail tone, and `fg` the darkest
 * mark — also the colour of any label or chip that has to pass contrast on
 * `bg`. Every ramp is one hue, so a tile never looks like two colours arguing.
 */
export type CategoryTint = { bg: string; art: string; mid: string; fg: string };

const TINTS: Record<string, CategoryTint> = {
  amber: { bg: "#FFF1D6", art: "#F2B441", mid: "#DE8A19", fg: "#8F5609" },
  green: { bg: "#E3F6EA", art: "#6BC793", mid: "#31A06B", fg: "#0B7E58" },
  red: { bg: "#FDE7E7", art: "#F08B86", mid: "#DE5B54", fg: "#BE322E" },
  rose: { bg: "#FDE6EC", art: "#F08BA8", mid: "#DB5378", fg: "#AE1C45" },
  orange: { bg: "#FFEBDC", art: "#F4A76B", mid: "#DF7A35", fg: "#A6480C" },
  blue: { bg: "#E4EEFE", art: "#8FB4F5", mid: "#5486E8", fg: "#1D4ED8" },
  violet: { bg: "#EFE8FD", art: "#B295F0", mid: "#8A5FE0", fg: "#6429C7" },
  teal: { bg: "#DEF4F2", art: "#6BC4BE", mid: "#2E9B94", fg: "#0B6E6A" },
  crimson: {
    bg: palette.crimson[50],
    art: "#F08098",
    mid: "#E3516F",
    fg: palette.crimson[600],
  },
};

/** The four tones for an API `hue`, falling back to the brand ramp. */
export function categoryTint(hue?: string | null): CategoryTint {
  return TINTS[hue ?? ""] ?? TINTS.crimson!;
}

/**
 * Lucide name → Material Community name.
 *
 * Keyed on the icon rather than the category slug, because the slug is an
 * editorial decision a merchandiser can change and the icon is a drawing. A
 * category the taxonomy gains later arrives with a Lucide name that is very
 * likely already in this table.
 */
const BY_LUCIDE: Record<string, MCIName> = {
  ShoppingBasket: "basket-outline",
  ShoppingCart: "cart-outline",
  Carrot: "carrot",
  Apple: "food-apple-outline",
  Pill: "pill",
  Stethoscope: "stethoscope",
  Fish: "fish",
  Beef: "food-drumstick-outline",
  Drumstick: "food-drumstick-outline",
  Croissant: "bread-slice-outline",
  CakeSlice: "cake-variant-outline",
  Milk: "bottle-soda-outline",
  Smartphone: "cellphone",
  Laptop: "laptop",
  Printer: "printer-outline",
  PenTool: "pencil-outline",
  BookOpen: "book-open-outline",
  UtensilsCrossed: "silverware-fork-knife",
  Coffee: "coffee-outline",
  Shirt: "tshirt-crew-outline",
  Sparkles: "spray-bottle",
  Flower: "flower-outline",
  Wrench: "wrench-outline",
  Hammer: "hammer-screwdriver",
  Baby: "baby-carriage",
  Dog: "dog-side",
  Gift: "gift-outline",
  Wine: "bottle-wine-outline",
  Candy: "candy-outline",
  Home: "home-outline",
};

/** Belt-and-braces for a category whose icon name is new to this table. */
const BY_SLUG: Record<string, MCIName> = {
  grocery: "basket-outline",
  vegetables: "carrot",
  fruits: "food-apple-outline",
  pharmacy: "pill",
  "meat-fish": "fish",
  bakery: "bread-slice-outline",
  dairy: "bottle-soda-outline",
  electronics: "cellphone",
  "print-copy": "printer-outline",
  stationery: "pencil-outline",
  restaurant: "silverware-fork-knife",
  sweets: "candy-outline",
  cosmetics: "spray-bottle",
  hardware: "wrench-outline",
  clothing: "tshirt-crew-outline",
  pets: "dog-side",
  liquor: "bottle-wine-outline",
};

/**
 * The glyph for a category. Never throws and never renders a blank square: an
 * unknown category gets a storefront, which is at least true.
 */
export function categoryIcon(icon?: string | null, slug?: string | null): MCIName {
  return BY_LUCIDE[icon ?? ""] ?? BY_SLUG[slug ?? ""] ?? "storefront-outline";
}

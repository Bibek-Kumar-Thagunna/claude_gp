/**
 * What to call a role on screen.
 *
 * GoPasal's ready-made roles — Owner, Manager, Order Handler and the rest — are
 * rows the API seeds in English and every shop shares. They are the same six
 * words in every shop, so they can be translated like any other fixed label:
 * a shopkeeper reading the app in Nepali should see "मालिक", not "Owner".
 *
 * A shop's *own* role is different. Its name is whatever the owner typed, and
 * translating it would be rewriting somebody's own word. The one exception is
 * an own role that is still word-for-word a template — same name, same
 * description, as when a template is copied into the shop and left alone. Its
 * words are GoPasal's, so they are translated like the template's. Change
 * either line and it is the owner's, shown as written.
 *
 * A membership's or invite's role arrives with only a name; for those the name
 * decides, which at worst translates an own role the owner named after a
 * template — the same word, in the reader's language.
 *
 * Display only. Anything sent back to the API uses `role.name` untouched.
 */
type T = (key: string, vars?: Record<string, string | number>, fallback?: string) => string;
type RoleLike = { name: string; description?: string | null; shopId?: string | null };

/** Name → [key slug, the template's own description]. Mirrors the API's DEFAULT_SHOP_ROLES. */
const READY_MADE: Record<string, [string, string]> = {
  Owner: ["owner", "Full control of the shop"],
  Manager: ["manager", "Runs day-to-day operations"],
  "Order Handler": ["orderHandler", "Accepts and prepares orders"],
  "Inventory Editor": ["inventoryEditor", "Manages products and stock"],
  "Support Staff": ["supportStaff", "Handles customer questions and reviews"],
  Delivery: ["delivery", "Delivers orders in the shop area"],
};

function readyMade(role: RoleLike): string | null {
  const known = READY_MADE[role.name];
  if (!known) return null;
  // A shop's own role counts only while it is still the template word for word.
  if (role.shopId && (role.description ?? "").trim() !== known[1]) return null;
  return known[0];
}

export function roleName(role: RoleLike, t: T): string {
  const slug = readyMade(role);
  return slug ? t(`team.systemRole.${slug}`, undefined, role.name) : role.name;
}

export function roleDescription(role: RoleLike, t: T): string | null {
  const text = role.description?.trim() || null;
  const slug = readyMade(role);
  return slug && text ? t(`team.systemRole.${slug}.detail`, undefined, text) : text;
}

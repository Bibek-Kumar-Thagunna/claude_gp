import type { PermissionCatalogGroup } from "@gopasal/native-data/seller-team";
import type { useT } from "@gopasal/native-ui";

/**
 * What each permission lets somebody do, said the way a shopkeeper would say it.
 *
 * The catalogue the API serves is correct and written for an admin console —
 * "Dispatch / out for delivery", "Invite / remove staff". Deciding what a
 * nephew behind the counter may touch is done from those words, so here each
 * known key gets a sentence about the *shop* rather than about the software.
 *
 * Keyed by permission key rather than label so a relabel on the server cannot
 * silently detach a gloss. A key this build has never heard of is still shown,
 * in the catalogue's own label and description — a permission that exists but
 * cannot be displayed is one nobody can audit.
 *
 * The two inert keys (`orders.complete`, `catalog.import`) say so. The API's
 * descriptions explain it at length; a checkbox that grants nothing has to say
 * that in the same breath as its name, or it gets ticked and relied on.
 */
const GLOSS: Record<string, string> = {
  "dashboard.view": "See the shop's overview",
  "orders.view": "See incoming orders",
  "orders.accept": "Accept new orders",
  "orders.reject": "Turn down orders",
  "orders.pack": "Mark orders packed",
  "orders.dispatch": "Hand orders to a rider",
  "orders.complete": "Mark delivered (old setting — does nothing on its own)",
  "orders.cancel": "Cancel orders already accepted",
  "delivery.view": "See where deliveries are",
  "delivery.assign": "Choose which rider takes an order",
  "delivery.update": "Record a delivery as handed over",
  "catalog.view": "See the products",
  "catalog.create": "Add new products",
  "catalog.edit": "Change products and prices",
  "catalog.delete": "Delete products",
  "catalog.import": "Bulk upload (not available yet — does nothing)",
  "inventory.view": "See stock counts",
  "inventory.adjust": "Change stock counts",
  "promotions.view": "See the shop's coupons",
  "promotions.manage": "Create, change and turn off coupons",
  "reviews.view": "Read customer reviews",
  "reviews.reply": "Reply to reviews",
  "messages.view": "Read customer chats",
  "messages.respond": "Reply to customers",
  "analytics.view": "See sales figures",
  "finance.view": "See payouts and money owed",
  "team.view": "See who works here",
  "team.invite": "Invite, suspend and remove staff",
  "rbac.manage": "Create and change roles",
  "settings.view": "See shop settings",
  "settings.manage": "Change shop settings",
};

/** Group names, for the headings of the checklist. */
const GROUP: Record<string, string> = {
  General: "General",
  Orders: "Orders",
  Delivery: "Delivery",
  Catalog: "Products",
  Inventory: "Stock",
  Promotions: "Coupons",
  Reviews: "Reviews",
  Messages: "Chats",
  Analytics: "Sales figures",
  Finance: "Money",
  Team: "Team",
  Settings: "Shop settings",
};

type T = ReturnType<typeof useT>;
type CatalogPermission = PermissionCatalogGroup["permissions"][number];

/** The sentence for one permission, translated when a translation exists. */
export function permissionLabel(permission: CatalogPermission, t: T): string {
  const gloss = GLOSS[permission.key];
  return gloss ? t(`team.perm.${permission.key}`, undefined, gloss) : permission.label;
}

/**
 * The catalogue's description, only for keys without a gloss of ours.
 *
 * For the glossed keys the gloss already carries what the description says,
 * and repeating an admin-console paragraph under a one-line sentence is noise.
 */
export function permissionNote(permission: CatalogPermission): string | null {
  if (GLOSS[permission.key]) return null;
  return permission.description ?? null;
}

export function permissionGroupLabel(group: string, t: T): string {
  const known = GROUP[group];
  return known ? t(`team.permGroup.${group}`, undefined, known) : group;
}

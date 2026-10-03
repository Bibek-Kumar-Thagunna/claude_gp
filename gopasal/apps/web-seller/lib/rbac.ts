/**
 * GoPasal Seller RBAC — this console's mirror of the API's SHOP catalogue.
 *
 * Every key below is copied verbatim from `SHOP_PERMISSIONS` in
 * `apps/api/src/rbac/permissions.catalog.ts`, in the API's own group order. The
 * keys are dot-separated because that is what `@RequirePermissions` checks and
 * what `GET /auth/me` returns in `access.shops[].permissions`. The colon-named
 * keys this file used to declare (`orders:view`, `staff:manage`, …) never
 * matched a real grant; they are listed in `RETIRED_PERMISSIONS` below so the
 * rename is discoverable rather than silent.
 *
 * This module is *vocabulary*, not authority. It answers "which permissions
 * exist, and what do we call them in English and Nepali" — nothing more. The
 * question "may this person do X" is answered only by `useAuth()`, from the
 * resolved list the API sent.
 *
 * There is deliberately no `can(role, perm)` here any more. A local role lookup
 * would re-grant permissions the API has already withdrawn: `RbacService.
 * describe` expands a privileged role to every key *and then subtracts*
 * everything the shop's lifecycle forbids, so a browser-side
 * `role.owner ? true : …` short-circuit would hand a SUSPENDED shop its buttons
 * back and turn a refusal into a surprise mid-task.
 *
 * `Role`, `OWNER_ROLE` and `DEFAULT_ROLES` used to live at the bottom of this
 * file as the Roles screen's fixture material. They are gone: the Roles screen
 * now reads `GET /seller/shops/:shopId/roles` and `…/roles/catalog`, so a shop's
 * real roles and the server's real permission keys are the only things it can
 * render or save. What remains here is the Nepali label and plain-language hint
 * for each key, which the API carries none of.
 */

export type PermissionId =
  // General
  | "dashboard.view"
  // Orders
  | "orders.view"
  | "orders.accept"
  | "orders.reject"
  | "orders.pack"
  | "orders.dispatch"
  | "orders.complete"
  | "orders.cancel"
  // Delivery — self-delivery only, so these are the shop's own people
  | "delivery.view"
  | "delivery.assign"
  | "delivery.update"
  // Catalog
  | "catalog.view"
  | "catalog.create"
  | "catalog.edit"
  | "catalog.delete"
  | "catalog.import"
  // Inventory
  | "inventory.view"
  | "inventory.adjust"
  // Promotions
  | "promotions.view"
  | "promotions.manage"
  // Reviews
  | "reviews.view"
  | "reviews.reply"
  // Private customer conversations
  | "messages.view"
  | "messages.respond"
  // Analytics
  | "analytics.view"
  // Finance
  | "finance.view"
  // Team
  | "team.view"
  | "team.invite"
  | "rbac.manage"
  // Settings
  | "settings.view"
  | "settings.manage";

/**
 * Keys this console used to check that the API has no shop-scope equivalent for.
 *
 * Two kinds are mixed here on purpose, because from a reader's point of view the
 * question is the same one: renames (the permission exists, under another name)
 * and phantoms (`replacement: null` — nothing grants this, because the feature
 * is unbuilt). Listing both means the next person who greps for `finance:view`
 * learns what happened to it instead of re-adding a check that can never pass.
 *
 * Nothing reads this table at runtime; it is documentation with the compiler
 * standing behind the `replacement` column.
 */
export const RETIRED_PERMISSIONS: {
  key: string;
  reason: string;
  replacement: PermissionId | null;
}[] = [
  { key: "orders:view", reason: "Renamed to dot notation by the API.", replacement: "orders.view" },
  { key: "orders:accept", reason: "Renamed to dot notation by the API.", replacement: "orders.accept" },
  { key: "orders:reject", reason: "Renamed to dot notation by the API.", replacement: "orders.reject" },
  { key: "orders:pack", reason: "Renamed to dot notation by the API.", replacement: "orders.pack" },
  {
    key: "orders:refund",
    reason:
      "No refund permission exists in any scope; refunds are unbuilt (finance core). Cancelling an order is the nearest real grant.",
    replacement: "orders.cancel",
  },
  {
    key: "delivery:dispatch",
    reason: "The API models dispatch as an order transition, not a delivery-board action.",
    replacement: "orders.dispatch",
  },
  {
    key: "delivery:complete",
    reason: "The API models completion as an order transition, not a delivery-board action.",
    replacement: "orders.complete",
  },
  { key: "catalog:view", reason: "Renamed to dot notation by the API.", replacement: "catalog.view" },
  { key: "catalog:create", reason: "Renamed to dot notation by the API.", replacement: "catalog.create" },
  { key: "catalog:edit", reason: "Renamed to dot notation by the API.", replacement: "catalog.edit" },
  { key: "catalog:delete", reason: "Renamed to dot notation by the API.", replacement: "catalog.delete" },
  { key: "catalog:import", reason: "Renamed to dot notation by the API.", replacement: "catalog.import" },
  { key: "inventory:view", reason: "Renamed to dot notation by the API.", replacement: "inventory.view" },
  { key: "inventory:adjust", reason: "Renamed to dot notation by the API.", replacement: "inventory.adjust" },
  { key: "promos:view", reason: "The API's group is spelled `promotions`.", replacement: "promotions.view" },
  { key: "promos:manage", reason: "The API's group is spelled `promotions`.", replacement: "promotions.manage" },
  { key: "analytics:view", reason: "Renamed to dot notation by the API.", replacement: "analytics.view" },
  { key: "finance:view", reason: "Renamed to dot notation by the API.", replacement: "finance.view" },
  {
    key: "finance:payout",
    reason: "Payouts are unbuilt; no permission in either scope grants them.",
    replacement: null,
  },
  {
    key: "customers:view",
    reason: "Buyer contact rides on the order payload, so the API never issued a separate grant for it.",
    replacement: "orders.view",
  },
  {
    key: "support:respond",
    reason:
      "Shop-side support is unbuilt (`support.respond` is PLATFORM scope). Replying to reviews is the only seller-facing conversation the API grants.",
    replacement: "reviews.reply",
  },
  { key: "staff:view", reason: "The API's group is spelled `team`.", replacement: "team.view" },
  {
    key: "staff:manage",
    reason: "The API splits nothing out: one grant covers inviting and removing.",
    replacement: "team.invite",
  },
  { key: "roles:manage", reason: "The API namespaces this under `rbac`.", replacement: "rbac.manage" },
  { key: "settings:view", reason: "Renamed to dot notation by the API.", replacement: "settings.view" },
  { key: "settings:manage", reason: "Renamed to dot notation by the API.", replacement: "settings.manage" },
];
export type PermGroup = {
  resource: string;
  label: string;
  labelNp: string;
  description: string;
  permissions: { id: PermissionId; label: string; labelNp: string; hint: string }[];
};

/**
 * The catalogue the role builder renders as toggles.
 *
 * Group names, group order and the English labels are the API's, so that what a
 * shop owner reads here is what an engineer reads in `permissions.catalog.ts`.
 * The Nepali label and the hint are this console's own — the API carries no
 * translations — and the hints are written for a shopkeeper, not a developer.
 */
export const PERMISSION_GROUPS: PermGroup[] = [
  {
    resource: "general",
    label: "General",
    labelNp: "सामान्य",
    description: "The minimum needed to open the console at all.",
    permissions: [
      {
        id: "dashboard.view",
        label: "View dashboard",
        labelNp: "ड्यासबोर्ड हेर्ने",
        hint: "Open the shop overview. Without this there is nothing to land on.",
      },
    ],
  },
  {
    resource: "orders",
    label: "Orders",
    labelNp: "अर्डरहरू",
    description: "See incoming orders and move them through the fulfilment flow.",
    permissions: [
      { id: "orders.view", label: "View orders", labelNp: "अर्डर हेर्ने", hint: "See the order queue and each order's details." },
      { id: "orders.accept", label: "Accept orders", labelNp: "अर्डर स्वीकार", hint: "Confirm that the shop will fulfil an order." },
      { id: "orders.reject", label: "Reject orders", labelNp: "अर्डर अस्वीकार", hint: "Decline with a reason — out of stock, shop closed." },
      { id: "orders.pack", label: "Mark packed", labelNp: "प्याक गरियो", hint: "Move an accepted order to Packed once it is ready." },
      { id: "orders.dispatch", label: "Dispatch / out for delivery", labelNp: "डेलिभरीमा पठाउने", hint: "Hand the order to whoever is taking it out." },
      // Grantable and inert: no route carries `orders.complete`. A handover is
      // recorded by the delivery PATCH, which is `delivery.update`. Saying so is the
      // only honest hint — the previous one described an action this key cannot
      // authorise, so a role built from it would silently not work.
      { id: "orders.complete", label: "Complete / mark delivered", labelNp: "डेलिभर भयो", hint: "Legacy — handover is authorised by “Update delivery status”, so this on its own grants nothing." },
      { id: "orders.cancel", label: "Cancel orders", labelNp: "अर्डर रद्द", hint: "Cancel after acceptance. Use sparingly — the buyer is told." },
    ],
  },
  {
    resource: "delivery",
    label: "Delivery",
    labelNp: "डेलिभरी",
    description: "The shop delivers its own orders — this is the board that runs it.",
    permissions: [
      { id: "delivery.view", label: "View delivery board", labelNp: "डेलिभरी बोर्ड हेर्ने", hint: "See which orders are waiting to go out." },
      { id: "delivery.assign", label: "Assign riders", labelNp: "रनर तोक्ने", hint: "Pick who from the shop takes an order out." },
      { id: "delivery.update", label: "Update delivery status", labelNp: "स्थिति अद्यावधिक", hint: "Keep the buyer informed while an order is on its way." },
    ],
  },
  {
    resource: "catalog",
    label: "Catalog",
    labelNp: "क्याटलग",
    description: "Products, variants, prices and photos.",
    permissions: [
      { id: "catalog.view", label: "View catalog", labelNp: "क्याटलग हेर्ने", hint: "Browse the shop's products and variants." },
      { id: "catalog.create", label: "Add products", labelNp: "उत्पादन थप्ने", hint: "Create new products and variants." },
      { id: "catalog.edit", label: "Edit products", labelNp: "उत्पादन सम्पादन", hint: "Change price, name or description, and add, remove or reorder photos." },
      { id: "catalog.delete", label: "Delete products", labelNp: "उत्पादन हटाउने", hint: "Remove a product from the shop entirely." },
      // There is no import endpoint in the API. The key stays because the backend
      // catalogue still has it and a role may already grant it, but the hint must not
      // promise a spreadsheet upload the platform cannot accept — the catalog screen
      // says the same thing where the import button used to be.
      { id: "catalog.import", label: "Bulk import (CSV)", labelNp: "CSV आयात", hint: "Reserved — GoPasal has no bulk import yet, so this grants nothing today." },
    ],
  },
  {
    resource: "inventory",
    label: "Inventory",
    labelNp: "स्टक",
    // Not "low-stock thresholds". `Product` has `stock` and `trackStock` and no
    // threshold column, and no route accepts one, so a hint promising alerts
    // described a feature GoPasal does not have. What the two keys really cover is
    // reading stock and changing it by a delta.
    description: "Stock on hand for tracked products.",
    permissions: [
      { id: "inventory.view", label: "View inventory", labelNp: "स्टक हेर्ने", hint: "See quantities on hand." },
      { id: "inventory.adjust", label: "Adjust stock", labelNp: "स्टक मिलाउने", hint: "Add to or subtract from the stock of a tracked product." },
    ],
  },
  {
    resource: "promotions",
    label: "Promotions",
    labelNp: "प्रोमोशन",
    // Coupons, and only coupons. `promotions.manage` gates the three coupon routes
    // and nothing else; there is no sponsored or featured placement anywhere in the
    // API, so the words were removed from both this description and the hint.
    description: "Coupons the shop offers its buyers.",
    permissions: [
      { id: "promotions.view", label: "View promotions", labelNp: "प्रोमो हेर्ने", hint: "See the shop's coupons and how much they have been used." },
      { id: "promotions.manage", label: "Manage coupons", labelNp: "प्रोमो व्यवस्थापन", hint: "Create coupons, edit them and switch them off." },
    ],
  },
  {
    resource: "reviews",
    label: "Reviews",
    labelNp: "समीक्षा",
    description: "What buyers said, and the shop's reply.",
    permissions: [
      { id: "reviews.view", label: "View reviews", labelNp: "समीक्षा हेर्ने", hint: "Read ratings and written feedback." },
      { id: "reviews.reply", label: "Reply to reviews", labelNp: "समीक्षा जवाफ", hint: "Answer publicly, in the shop's name." },
    ],
  },
  {
    resource: "analytics",
    label: "Analytics",
    labelNp: "विश्लेषण",
    description: "Sales insight for the shop.",
    permissions: [
      { id: "analytics.view", label: "View analytics", labelNp: "विश्लेषण हेर्ने", hint: "Sales, orders and best-selling products." },
    ],
  },
  {
    resource: "messages",
    label: "Messages",
    labelNp: "सन्देश",
    description: "Private questions and order conversations with customers.",
    permissions: [
      { id: "messages.view", label: "View customer messages", labelNp: "ग्राहक सन्देश हेर्ने", hint: "Read conversations for this shop without exposing private phone numbers." },
      { id: "messages.respond", label: "Reply to customers", labelNp: "ग्राहकलाई जवाफ दिने", hint: "Reply after a customer starts a pre-order chat, or contact a customer who placed an order." },
    ],
  },
  {
    resource: "finance",
    label: "Finance",
    labelNp: "वित्त",
    description: "Escrow, COD commission, refunds and seller settlements.",
    permissions: [
      { id: "finance.view", label: "View finance & settlements", labelNp: "वित्त हेर्ने", hint: "See money held, ready, due and paid for this shop." },
    ],
  },
  {
    resource: "team",
    label: "Team",
    labelNp: "टोली",
    description: "Who works here, and what each of them may do.",
    permissions: [
      { id: "team.view", label: "View team", labelNp: "टोली हेर्ने", hint: "See the people attached to this shop." },
      { id: "team.invite", label: "Invite / remove staff", labelNp: "स्टाफ निमन्त्रणा", hint: "Bring someone in by phone number, or take their access away." },
      { id: "rbac.manage", label: "Manage roles & permissions", labelNp: "भूमिका व्यवस्थापन", hint: "Create roles and decide exactly what each one may do." },
    ],
  },
  {
    resource: "settings",
    label: "Settings",
    labelNp: "सेटिङ",
    description: "Shop profile, opening hours and delivery area.",
    permissions: [
      { id: "settings.view", label: "View settings", labelNp: "सेटिङ हेर्ने", hint: "See the shop profile, hours and delivery area." },
      { id: "settings.manage", label: "Manage shop settings", labelNp: "सेटिङ व्यवस्थापन", hint: "Change the shop profile, hours and delivery area." },
    ],
  },
];

/* ── removed: `ALL_PERMISSIONS`, `permissionLabel` and its lookup map ──────────
 * A flattened list of every key in this file, and an English label lookup over
 * the same table. Both were dead, and both were the wrong source anyway: the role
 * editor offers the keys `GET …/roles/catalog` returns, and labels a key with
 * `team-view.ts#permissionLabelFrom`, which prefers the server's own English
 * label and falls back to this file's table only for a key the catalogue did not
 * carry. A local "every permission" list could only ever be this build's guess at
 * the server's catalogue, and a local label lookup would have overridden the
 * server's wording with it.
 *
 * What stays here is what the API has no column for: the Nepali label and the
 * plain-language hint, in `PERMISSION_GROUPS`.
 */
/* ── removed: the fixture role catalogue ──────────────────────────────────────
 * `Role`, `only()`, `OWNER_ROLE` and `DEFAULT_ROLES` stood here. Roles are now
 * read from and written to the API (`lib/api/roles.ts`), so a local copy could
 * only ever disagree with the server about what a role grants.
 */






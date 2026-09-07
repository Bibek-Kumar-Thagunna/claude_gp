/**
 * GoPasal Admin (platform) RBAC — custom role & permission model.
 *
 * This mirrors the backend PLATFORM permission catalogue
 * (apps/api/src/rbac/permissions.catalog.ts) one-to-one, using the SAME dotted
 * keys the API's `@RequirePermissions(...)` guard checks — so the console can
 * hide exactly what a role can't do, and the two can never drift.
 *
 * Design goals (from product spec):
 *  - Default-DENY: platform staff can do nothing until a permission is granted.
 *  - The Super Admin can create their own roles and assign granular permissions.
 *  - Ships with sensible default roles, but they are fully editable/clonable.
 */

export type PermissionId =
  // General
  | "admin.dashboard.view"
  // Shops
  | "shops.view"
  | "shops.approve"
  | "shops.suspend"
  | "shops.reject"
  // Users
  | "users.view"
  | "users.suspend"
  // Catalog moderation
  | "catalog.moderate"
  // Disputes
  | "disputes.view"
  | "disputes.resolve"
  // Fraud
  | "fraud.view"
  | "fraud.manage"
  // Promotions
  | "coupons.manage"
  // Policy
  | "policy.view"
  | "policy.publish"
  // Analytics & finance
  | "analytics.platform.view"
  | "finance.view"
  // Support
  | "support.view"
  | "support.respond"
  // Compliance
  | "audit.view"
  | "rbac.platform.manage";

export type PermGroup = {
  resource: string;
  label: string;
  labelNp: string;
  description: string;
  permissions: { id: PermissionId; label: string; labelNp: string; hint: string }[];
};

/** The full catalog the role builder renders as toggles, grouped by resource. */
export const PERMISSION_GROUPS: PermGroup[] = [
  {
    resource: "general",
    label: "General",
    labelNp: "सामान्य",
    description: "Baseline access to the admin console.",
    permissions: [
      { id: "admin.dashboard.view", label: "View admin dashboard", labelNp: "ड्यासबोर्ड हेर्ने", hint: "See platform KPIs and the console home." },
    ],
  },
  {
    resource: "shops",
    label: "Shops",
    labelNp: "पसलहरू",
    description: "Review shop applications and control shop status.",
    permissions: [
      { id: "shops.view", label: "View shops", labelNp: "पसल हेर्ने", hint: "Browse every shop and application." },
      { id: "shops.approve", label: "Approve shops", labelNp: "पसल स्वीकृत", hint: "Verify and activate a pending shop." },
      { id: "shops.reject", label: "Reject applications", labelNp: "आवेदन अस्वीकृत", hint: "Decline a shop application." },
      { id: "shops.suspend", label: "Suspend / reactivate", labelNp: "निलम्बन / पुनः सक्रिय", hint: "Take an active shop offline, or restore it." },
    ],
  },
  {
    resource: "users",
    label: "Users",
    labelNp: "प्रयोगकर्ता",
    description: "Customer and shop-staff accounts.",
    permissions: [
      { id: "users.view", label: "View users", labelNp: "प्रयोगकर्ता हेर्ने", hint: "Search and inspect accounts." },
      { id: "users.suspend", label: "Suspend / reactivate users", labelNp: "प्रयोगकर्ता निलम्बन", hint: "Block or restore an account." },
    ],
  },
  {
    resource: "catalog",
    label: "Catalog",
    labelNp: "क्याटलग",
    description: "Platform-wide product moderation.",
    permissions: [
      { id: "catalog.moderate", label: "Moderate catalog", labelNp: "क्याटलग नियन्त्रण", hint: "Hide or restore products across the platform." },
    ],
  },
  {
    resource: "disputes",
    label: "Disputes",
    labelNp: "विवाद",
    description: "Buyer/seller disputes and refunds.",
    permissions: [
      { id: "disputes.view", label: "View disputes", labelNp: "विवाद हेर्ने", hint: "See open and past disputes." },
      { id: "disputes.resolve", label: "Resolve disputes", labelNp: "विवाद समाधान", hint: "Decide outcomes and refunds." },
    ],
  },
  {
    resource: "fraud",
    label: "Fraud",
    labelNp: "जालसाजी",
    description: "Risk flags on users, shops and orders.",
    permissions: [
      { id: "fraud.view", label: "View fraud flags", labelNp: "जालसाजी हेर्ने", hint: "See the risk queue." },
      { id: "fraud.manage", label: "Manage fraud flags", labelNp: "जालसाजी व्यवस्थापन", hint: "Raise flags and change their status." },
    ],
  },
  {
    resource: "promotions",
    label: "Promotions",
    labelNp: "प्रोमोशन",
    description: "Platform-funded coupons and campaigns.",
    permissions: [
      { id: "coupons.manage", label: "Manage platform coupons", labelNp: "प्लेटफर्म कुपन", hint: "Create/disable platform-wide coupons." },
    ],
  },
  {
    resource: "policy",
    label: "Policy",
    labelNp: "नीति",
    description: "Legal documents and their published versions.",
    permissions: [
      { id: "policy.view", label: "View policies", labelNp: "नीति हेर्ने", hint: "Read every policy and version." },
      { id: "policy.publish", label: "Publish policy versions", labelNp: "नीति प्रकाशन", hint: "Draft and publish a new version." },
    ],
  },
  {
    resource: "analytics",
    label: "Analytics & Finance",
    labelNp: "विश्लेषण र वित्त",
    description: "Platform insight and financial visibility.",
    permissions: [
      { id: "analytics.platform.view", label: "View platform analytics", labelNp: "प्लेटफर्म विश्लेषण", hint: "GMV, orders, growth trends." },
      { id: "finance.view", label: "View finance", labelNp: "वित्त हेर्ने", hint: "COD flow, commissions, settlements." },
    ],
  },
  {
    resource: "support",
    label: "Support",
    labelNp: "सहयोग",
    description: "Customer and seller support tickets.",
    permissions: [
      { id: "support.view", label: "View support tickets", labelNp: "टिकट हेर्ने", hint: "Read the support inbox." },
      { id: "support.respond", label: "Respond to tickets", labelNp: "टिकट जवाफ", hint: "Reply and change status/priority." },
    ],
  },
  {
    resource: "compliance",
    label: "Compliance & Governance",
    labelNp: "अनुपालन",
    description: "The audit trail and platform role management.",
    permissions: [
      { id: "audit.view", label: "View audit log", labelNp: "अडिट लग हेर्ने", hint: "Read the tamper-evident action trail." },
      { id: "rbac.platform.manage", label: "Manage platform roles", labelNp: "भूमिका व्यवस्थापन", hint: "Create roles and assign staff." },
    ],
  },
];

export const ALL_PERMISSIONS: PermissionId[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.id),
);

const PERM_LABEL = new Map<PermissionId, string>(
  PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.id, p.label] as const)),
);

export function permissionLabel(id: PermissionId): string {
  return PERM_LABEL.get(id) ?? id;
}

export type Role = {
  id: string;
  name: string;
  description: string;
  /** System roles ship by default and cannot be deleted (but can be cloned). */
  system: boolean;
  /** Super Admin is special: implicitly holds every permission, current & future. */
  superAdmin?: boolean;
  permissions: PermissionId[];
  color: string;
};

const only = (...ids: PermissionId[]) => ids;

/**
 * Super Admin always exists: it is a system role and `deleteRole` refuses to
 * remove it. Exported on its own so callers that need a guaranteed, non-optional
 * `Role` — resolving the signed-in staff member's role, cloning from a base —
 * have one to fall back on without asserting that an array index is populated.
 */
export const SUPER_ADMIN_ROLE: Role = {
  id: "super-admin",
  name: "Super Admin",
  description: "Full platform control, including roles, staff and every future permission.",
  system: true,
  superAdmin: true,
  permissions: [...ALL_PERMISSIONS],
  color: "crimson",
};

/**
 * Default platform roles — mirrors DEFAULT_PLATFORM_ROLES in the backend catalog.
 * Fully editable/clonable except Super Admin.
 */
export const DEFAULT_ROLES: Role[] = [
  SUPER_ADMIN_ROLE,
  {
    id: "operations-admin",
    name: "Operations Admin",
    description: "Runs shops, orders and delivery operations day to day.",
    system: true,
    permissions: only(
      "admin.dashboard.view",
      "shops.view", "shops.approve", "shops.suspend", "shops.reject",
      "users.view",
      "catalog.moderate",
      "analytics.platform.view",
      "support.view", "support.respond",
    ),
    color: "blue",
  },
  {
    id: "support-agent",
    name: "Support Agent",
    description: "Answers tickets and mediates disputes.",
    system: true,
    permissions: only(
      "admin.dashboard.view",
      "support.view", "support.respond",
      "disputes.view",
      "users.view",
    ),
    color: "marigold",
  },
  {
    id: "compliance-reviewer",
    name: "Compliance Reviewer",
    description: "Reviews fraud, disputes and policy; reads the audit trail.",
    system: true,
    permissions: only(
      "admin.dashboard.view",
      "fraud.view", "fraud.manage",
      "disputes.view", "disputes.resolve",
      "policy.view", "policy.publish",
      "audit.view",
    ),
    color: "green",
  },
  {
    id: "finance-viewer",
    name: "Finance Viewer",
    description: "Read-only financial and analytics visibility.",
    system: true,
    permissions: only("admin.dashboard.view", "finance.view", "analytics.platform.view"),
    color: "ink",
  },
];

/**
 * Central authorization check. Super Admin short-circuits to allow-all so that
 * new permissions added in future are automatically covered.
 * Default-deny: unknown role or missing permission → false.
 */
export function can(role: Role | undefined | null, perm: PermissionId): boolean {
  if (!role) return false;
  if (role.superAdmin) return true;
  return role.permissions.includes(perm);
}

export function canAny(role: Role | undefined | null, perms: PermissionId[]): boolean {
  return perms.some((p) => can(role, p));
}

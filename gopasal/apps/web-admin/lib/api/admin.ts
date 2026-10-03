import { authedBlob, authedRequest } from "./client";

export type AdminOverview = {
  gmv: number;
  shops: { total: number; pending: number; active: number; suspended: number; byStatus: Record<string, number> };
  orders: { total: number; last7Days: number; byStatus: Record<string, number> };
  users: { active: number; newLast7Days: number };
  riders: number;
};
export type TrendPoint = { day: string; orders: number; gmv: number };
export type AdminShop = {
  id: string; name: string; slug: string; area: string | null; status: "PENDING" | "ACTIVE" | "SUSPENDED" | "REJECTED";
  verified: boolean; ratingAvg: number; ratingCount: number; deliveryRadiusKm: number; createdAt: string;
  owner: { name: string | null; phone: string }; _count: { products: number; orders: number };
};
export type AdminShopDetail = AdminShop & {
  description: string | null; phone: string | null; fullAddress: string | null; lat: number | null; lng: number | null;
  hours: string | null; isOpen: boolean; minOrder: number; soloMode: boolean; codEnabled: boolean;
  onlinePaymentEnabled: boolean; coverImage: string | null; logoImage: string | null; statusReason: string | null;
  approvedAt: string | null; updatedAt: string; _count: { products: number; orders: number; memberships: number };
};
export type AdminUser = {
  id: string; name: string | null; phone: string; status: "ACTIVE" | "SUSPENDED" | "DELETED";
  isPlatformStaff: boolean; createdAt: string; _count: { orders: number; ownedShops: number };
};
export type AuditWire = {
  id: string; actorId: string | null; action: string; entityType: string; entityId: string | null;
  surface: string; before: unknown; after: unknown; ip: string | null; createdAt: string;
  actor: { id: string; name: string | null; phone: string } | null;
};
export type AdminTicket = {
  id: string; code: string; subject: string; category: string; status: string; priority: string; updatedAt: string;
  user: { name: string | null; phone: string };
  messages: Array<{ id: string; body: string; isStaff: boolean; createdAt: string; files?: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number }> }>;
};
export type AdminDispute = {
  id: string; orderId: string; raisedById: string; reason: string; detail: string | null;
  status: "OPEN" | "UNDER_REVIEW" | "RESOLVED_CUSTOMER" | "RESOLVED_SHOP" | "REJECTED";
  resolution: string | null; resolvedById: string | null; createdAt: string; updatedAt: string;
  order: { code: string; total: number; shopId?: string; customerId?: string; status?: string; paymentMethod?: "COD" | "ESEWA" | "KHALTI"; paymentStatus?: string; shop?: { name: string }; items?: Array<{ id: string; nameSnapshot: string; unitSnapshot: string | null; price: number; qty: number }>; delivery?: { podNote: string | null; deliveredAt: string | null; hasProofPhoto: boolean } | null };
};
export type FraudFlag = {
  id: string; subjectType: "user" | "shop" | "order"; subjectId: string; reason: string;
  severity: "low" | "medium" | "high"; status: "OPEN" | "REVIEWING" | "CONFIRMED" | "DISMISSED";
  reporterId: string | null; reporter?: { name: string | null } | null; createdAt: string;
  subject?: { id: string; name?: string | null; phone?: string; code?: string; total?: number; status?: string } | null;
};
export type PolicyDocument = {
  id: string; key: "terms" | "privacy" | "refund" | "delivery" | "cookies"; version: string;
  title: string; content: string; isPublished: boolean; effectiveAt: string | null; createdAt: string;
};
export type AdminProduct = {
  id: string; shopId: string; name: string; nameNp: string | null; description: string | null;
  price: number; mrp: number | null; unit: string; images: string[]; tags: string[]; isActive: boolean;
  trackStock: boolean; stock: number; updatedAt: string;
  shop: { id: string; name: string; status: string }; category: { en: string; np: string } | null;
  _count: { variants: number; orderItems: number; reviews: number };
};
export type ConfigEnvironment = "DEVELOPMENT" | "STAGING" | "PRODUCTION";
export type PlatformConfigVersion = {
  id: string; environment: ConfigEnvironment; version: number; commissionRateBps: number;
  baseDeliveryFee: number; perKmDeliveryFee: number; codLimit: number; refundWindowHours: number;
  changeNote: string; changedById: string; createdAt: string;
  changedBy: { id: string; name: string | null; phone: string };
};
export type FeatureFlagVersion = {
  id: string; key: string; description: string | null; environment: ConfigEnvironment;
  targetKey: string; shopId: string | null; enabled: boolean; version: number; changeNote: string;
  changedById: string; createdAt: string; shop: { id: string; name: string } | null;
  changedBy: { id: string; name: string | null; phone: string };
};
export type FinanceOverview = {
  escrow: { held: number; orders: number; releasedSellerPayable: number; releasedOrders: number };
  cod: { commissionDue: number; orders: number };
  refunds: { amount: number; count: number };
  settlements: Partial<Record<'OPEN' | 'PAID' | 'FAILED', { count: number; amount: number }>>;
  ledger: Record<string, number>;
  generatedAt: string;
};
export type FinanceSettlement = {
  id: string; code: string; shopId: string; windowStart: string; windowEnd: string;
  onlineSellerPayable: number; codCommissionReceivable: number; refundAdjustments: number;
  netAmount: number; direction: 'PAYOUT_TO_SELLER' | 'COLLECTION_FROM_SELLER';
  status: 'OPEN' | 'PAID' | 'FAILED'; payoutMethod: 'BANK' | 'ESEWA' | 'KHALTI' | null;
  payoutDestinationMasked: string | null; providerReference: string | null; failureReason: string | null;
  completedAt: string | null; createdAt: string; shop: { id: string; name: string; area: string | null };
  lines: Array<{ id: string; sellerPayable: number; codCommission: number; refundAmount: number; orderFinance: { order: { id: string; code: string; paymentMethod: string; total: number; deliveredAt: string | null } } }>;
};
export type FinanceJournal = {
  id: string; eventKey: string; type: string; description: string; createdAt: string;
  shop: { id: string; name: string } | null; order: { id: string; code: string } | null;
  entries: Array<{ id: string; account: string; debit: number; credit: number }>;
};
export type FinanceRefund = {
  id: string; code: string; orderId: string; amount: number; reason: string;
  method: 'ORIGINAL_SOURCE' | 'MANUAL_TRANSFER' | 'STORE_CREDIT';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  providerRef: string | null; failureReason: string | null; attemptCount: number; lastAttemptAt: string | null;
  nextAttemptAt: string | null; completedAt: string | null; createdAt: string;
  order: {
    id: string; code: string; total: number; paymentMethod: 'COD' | 'ESEWA' | 'KHALTI'; paymentStatus: string;
    shop: { id: string; name: string };
    customer: { id: string; name: string | null; phone: string };
  };
};
export type PlatformCoupon = {
  id: string; code: string; type: 'PERCENT' | 'FLAT'; value: number; minOrder: number;
  maxDiscount: number | null; usageLimit: number | null; perUserLimit: number; usedCount: number;
  validFrom: string; validTo: string | null; isActive: boolean; createdAt: string;
};

export type PlatformPermission = {
  key: string;
  label: string;
  group: string;
  scope: "PLATFORM";
  description?: string;
};
export type PermissionGroup = { group: string; permissions: PlatformPermission[] };
export type PlatformRole = {
  id: string;
  name: string;
  description: string | null;
  scope: "PLATFORM";
  isSystem: boolean;
  isPrivileged: boolean;
  permissions: Array<{ permissionKey: string }>;
  _count?: { platformMemberships: number };
};
export type PlatformStaff = {
  id: string;
  userId: string;
  roleId: string;
  createdAt: string;
  user: { id: string; name: string | null; phone: string; status: "ACTIVE" | "SUSPENDED" | "DELETED" };
  role: { id: string; name: string; isPrivileged: boolean };
};
export type PlatformInvite = {
  id: string;
  scope: "PLATFORM";
  shopId: null;
  phone: string;
  name: string | null;
  note: string | null;
  role: { id: string; name: string };
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  lastSentAt: string;
  sendCount: number;
  delivery: string | null;
  attemptsRemaining: number;
  invitedBy: string | null;
  acceptedAt: string | null;
  createdAt: string;
};
export type PlatformInviteIssued = {
  invite: PlatformInvite;
  shareOnce: { link: string; code: string; expiresAt: string };
};

export const adminApi = {
  overview: () => authedRequest<AdminOverview>("/admin/overview"),
  trend: (days = 30) => authedRequest<TrendPoint[]>(`/admin/analytics/orders-trend?days=${days}`),
  financeOverview: () => authedRequest<FinanceOverview>("/admin/finance/overview"),
  settlements: () => authedRequest<FinanceSettlement[]>("/admin/finance/settlements"),
  financeLedger: () => authedRequest<FinanceJournal[]>("/admin/finance/ledger?limit=100"),
  financeRefunds: () => authedRequest<FinanceRefund[]>("/admin/finance/refunds"),
  reconcileFinance: () => authedRequest<{ released: number; settlements: FinanceSettlement[] }>("/admin/finance/reconcile", { method: "POST" }),
  completeSettlement: (id: string, body: { outcome: 'success' | 'failure'; providerReference?: string; failureReason?: string }) => authedRequest<FinanceSettlement>(`/admin/finance/settlements/${encodeURIComponent(id)}/complete`, { method: "POST", body }),
  issueRefund: (orderId: string, body: { amount: number; reason: string; method: 'ORIGINAL_SOURCE' | 'MANUAL_TRANSFER'; providerRef?: string }) => authedRequest(`/admin/finance/orders/${encodeURIComponent(orderId)}/refunds`, { method: "POST", body }),
  completeRefund: (id: string, body: { outcome: 'success' | 'failure'; providerReference?: string; failureReason?: string }) => authedRequest<FinanceRefund>(`/admin/finance/refunds/${encodeURIComponent(id)}/complete`, { method: "POST", body }),
  processRefund: (id: string) => authedRequest<FinanceRefund>(`/admin/finance/refunds/${encodeURIComponent(id)}/process`, { method: "POST" }),
  platformCoupons: () => authedRequest<PlatformCoupon[]>("/admin/coupons"),
  createPlatformCoupon: (body: { code: string; type: 'PERCENT' | 'FLAT'; value: number; minOrder?: number; maxDiscount?: number; usageLimit?: number; perUserLimit?: number; validFrom?: string; validTo?: string }) => authedRequest<PlatformCoupon>("/admin/coupons", { method: "POST", body }),
  updatePlatformCoupon: (id: string, body: { isActive?: boolean; minOrder?: number; usageLimit?: number; validTo?: string }) => authedRequest<PlatformCoupon>(`/admin/coupons/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  deactivatePlatformCoupon: (id: string) => authedRequest<PlatformCoupon>(`/admin/coupons/${encodeURIComponent(id)}`, { method: "DELETE" }),
  shops: () => authedRequest<AdminShop[]>("/admin/shops"),
  shop: (id: string) => authedRequest<AdminShopDetail>(`/admin/shops/${encodeURIComponent(id)}`),
  shopAction: (id: string, action: "approve" | "reject" | "suspend" | "reactivate", reason?: string) =>
    authedRequest<AdminShop>(`/admin/shops/${id}/${action}`, { method: "POST", ...(reason ? { body: { reason } } : {}) }),
  users: () => authedRequest<AdminUser[]>("/admin/users"),
  userAction: (id: string, action: "suspend" | "reactivate") =>
    authedRequest<AdminUser>(`/admin/users/${id}/${action}`, { method: "POST" }),
  audit: () => authedRequest<{ items: AuditWire[]; nextCursor: string | null }>("/admin/audit"),
  supportTickets: () => authedRequest<AdminTicket[]>("/admin/support/tickets"),
  supportTicket: (id: string) => authedRequest<AdminTicket>(`/admin/support/tickets/${encodeURIComponent(id)}`),
  replySupportTicket: (id: string, body: string, file?: File) => {
    const path = `/admin/support/tickets/${encodeURIComponent(id)}/reply`;
    if (!file) return authedRequest<AdminTicket>(path, { method: "POST", body: { body } });
    const form = new FormData(); form.append("body", body); form.append("file", file);
    return authedRequest<AdminTicket>(`${path}/with-file`, { method: "POST", form });
  },
  supportTicketFile: (ticketId: string, fileId: string) =>
    authedBlob(`/admin/support/tickets/${encodeURIComponent(ticketId)}/files/${encodeURIComponent(fileId)}`),
  setSupportTicketStatus: (id: string, status: "OPEN" | "PENDING" | "CLOSED") => authedRequest<AdminTicket>(`/admin/support/tickets/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status } }),
  disputes: (status?: AdminDispute["status"]) => authedRequest<AdminDispute[]>(`/admin/support/disputes${status ? `?status=${status}` : ""}`),
  dispute: (id: string) => authedRequest<AdminDispute>(`/admin/support/disputes/${encodeURIComponent(id)}`),
  deliveryProof: (orderId: string) =>
    authedBlob(`/admin/orders/${encodeURIComponent(orderId)}/delivery-proof`),
  reviewDispute: (id: string) => authedRequest<AdminDispute>(`/admin/support/disputes/${encodeURIComponent(id)}/review`, { method: "PATCH" }),
  resolveDispute: (id: string, body: { status: "RESOLVED_CUSTOMER" | "RESOLVED_SHOP" | "REJECTED"; resolution: string }) => authedRequest<AdminDispute>(`/admin/support/disputes/${encodeURIComponent(id)}/resolve`, { method: "POST", body }),
  fraudFlags: (status?: FraudFlag["status"]) => authedRequest<FraudFlag[]>(`/admin/fraud${status ? `?status=${status}` : ""}`),
  fraudFlag: (id: string) => authedRequest<FraudFlag>(`/admin/fraud/${encodeURIComponent(id)}`),
  raiseFraudFlag: (body: { subjectType: FraudFlag["subjectType"]; subjectId: string; reason: string; severity: FraudFlag["severity"] }) => authedRequest<FraudFlag>("/admin/fraud", { method: "POST", body }),
  setFraudStatus: (id: string, status: FraudFlag["status"]) => authedRequest<FraudFlag>(`/admin/fraud/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status } }),
  products: (q?: string, active?: boolean) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (active !== undefined) params.set("active", String(active));
    return authedRequest<AdminProduct[]>(`/admin/products${params.size ? `?${params}` : ""}`);
  },
  moderateProduct: (id: string, isActive: boolean) => authedRequest<AdminProduct>(`/admin/products/${encodeURIComponent(id)}/moderate`, { method: "PATCH", body: { isActive } }),
  policies: (key?: PolicyDocument["key"]) => authedRequest<PolicyDocument[]>(`/admin/policies${key ? `?key=${key}` : ""}`),
  policy: (id: string) => authedRequest<PolicyDocument>(`/admin/policies/${encodeURIComponent(id)}`),
  createPolicy: (body: Pick<PolicyDocument, "key" | "version" | "title" | "content">) => authedRequest<PolicyDocument>("/admin/policies", { method: "POST", body }),
  updatePolicy: (id: string, body: Partial<Pick<PolicyDocument, "version" | "title" | "content">>) => authedRequest<PolicyDocument>(`/admin/policies/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  publishPolicy: (id: string) => authedRequest<PolicyDocument>(`/admin/policies/${encodeURIComponent(id)}/publish`, { method: "POST" }),
  platformConfig: (environment: ConfigEnvironment) => authedRequest<{ current: PlatformConfigVersion | null; history: PlatformConfigVersion[] }>(`/admin/config?environment=${environment}`),
  createPlatformConfig: (body: Omit<PlatformConfigVersion, "id" | "version" | "changedById" | "changedBy" | "createdAt">) => authedRequest<PlatformConfigVersion>("/admin/config", { method: "POST", body }),
  featureFlags: (environment: ConfigEnvironment, shopId?: string) => {
    const params = new URLSearchParams({ environment });
    if (shopId) params.set("shopId", shopId);
    return authedRequest<{ target: { type: "global" | "shop"; shopId?: string }; current: FeatureFlagVersion[]; history: FeatureFlagVersion[] }>(`/admin/config/features?${params}`);
  },
  setFeatureFlag: (body: { key: string; environment: ConfigEnvironment; shopId?: string; enabled: boolean; description?: string; changeNote: string }) => authedRequest<FeatureFlagVersion>("/admin/config/features", { method: "POST", body }),
  platformRoles: () => authedRequest<PlatformRole[]>("/admin/roles"),
  platformPermissionCatalog: () => authedRequest<PermissionGroup[]>("/admin/roles/catalog"),
  createPlatformRole: (body: { name: string; description?: string; permissions: string[] }) =>
    authedRequest<PlatformRole>("/admin/roles", { method: "POST", body }),
  updatePlatformRole: (id: string, body: { name?: string; description?: string; permissions?: string[] }) =>
    authedRequest<PlatformRole>(`/admin/roles/${encodeURIComponent(id)}`, { method: "PATCH", body }),
  clonePlatformRole: (id: string, name?: string) =>
    authedRequest<PlatformRole>(`/admin/roles/${encodeURIComponent(id)}/clone`, { method: "POST", body: name ? { name } : {} }),
  deletePlatformRole: (id: string) =>
    authedRequest<{ deleted: true }>(`/admin/roles/${encodeURIComponent(id)}`, { method: "DELETE" }),
  platformStaff: () => authedRequest<PlatformStaff[]>("/admin/staff"),
  changePlatformStaffRole: (phone: string, roleId: string) =>
    authedRequest<PlatformStaff>("/admin/staff/role", { method: "PATCH", body: { phone, roleId } }),
  removePlatformStaff: (userId: string) =>
    authedRequest<{ removed: true }>(`/admin/staff/${encodeURIComponent(userId)}`, { method: "DELETE" }),
  platformInvites: (status: PlatformInvite["status"] | "ALL" = "PENDING") =>
    authedRequest<PlatformInvite[]>(`/admin/staff/invites?status=${status}`),
  createPlatformInvite: (body: { phone: string; roleId: string; name?: string; note?: string }) =>
    authedRequest<PlatformInviteIssued>("/admin/staff/invites", { method: "POST", body }),
  resendPlatformInvite: (id: string) =>
    authedRequest<PlatformInviteIssued>(`/admin/staff/invites/${encodeURIComponent(id)}/resend`, { method: "POST" }),
  revokePlatformInvite: (id: string) =>
    authedRequest<PlatformInvite>(`/admin/staff/invites/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

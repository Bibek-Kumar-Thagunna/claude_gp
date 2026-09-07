"use client";

import * as React from "react";
import type { Lang } from "@/lib/i18n";
import { DEFAULT_ROLES, SUPER_ADMIN_ROLE, type Role, type PermissionId } from "@/lib/rbac";
import { useAuth } from "@/components/auth-provider";
import {
  CURRENT_ADMIN,
  PLATFORM_STAFF,
  SHOPS,
  USERS,
  DISPUTES,
  FRAUD_FLAGS,
  TICKETS,
  MODERATION_QUEUE,
  POLICIES,
  PLATFORM_COUPONS,
  AUDIT_LOG,
  type StaffMember,
  type PlatformShop,
  type PlatformUser,
  type Dispute,
  type FraudFlag,
  type Ticket,
  type ModerationProduct,
  type PolicyDoc,
  type PlatformCoupon,
  type AuditEntry,
} from "@/lib/data";

/* ----------------------------------------------------------------- Language */

type LangCtx = { lang: Lang; setLang: (l: Lang) => void };
const LanguageContext = React.createContext<LangCtx | null>(null);

export function useLang() {
  const ctx = React.useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used within AdminProvider");
  return ctx;
}

/* -------------------------------------------------------------- Admin state */

type AdminCtx = {
  /**
   * Signed-in platform operator, still from fixtures — the staff and settings
   * screens are not on the API yet. The *identity* shown in the chrome and the
   * *permissions* that gate actions both come from `useAuth()` instead, so this
   * is only used where a fixture screen needs a fixture author.
   */
  me: typeof CURRENT_ADMIN;

  /**
   * Default-deny permission check, delegated to `AuthProvider` — which means the
   * API's own resolved list from `GET /auth/me`, not the editable role catalogue
   * below. Those are two different things and conflating them is how a console
   * ends up offering a button the API will refuse.
   */
  can: (perm: PermissionId) => boolean;

  /** Editable platform role catalogue (custom RBAC). */
  roles: Role[];
  saveRole: (role: Role) => void;
  deleteRole: (id: string) => void;
  cloneRole: (id: string) => Role;

  staff: StaffMember[];
  saveStaff: (s: StaffMember) => void;

  /** Mutable working copies of the platform data (local, optimistic). */
  shops: PlatformShop[];
  /**
   * Suspend or reactivate a live shop. Approval and rejection are deliberately
   * **not** here any more: those belong to the onboarding application, they are
   * real API calls, and they live in `lib/api/onboarding-review.ts`.
   */
  setShopStatus: (id: string, status: "ACTIVE" | "SUSPENDED", note?: string) => void;

  users: PlatformUser[];
  setUserStatus: (id: string, status: PlatformUser["status"], note?: string) => void;

  moderation: ModerationProduct[];
  setProductVisible: (id: string, isActive: boolean) => void;

  disputes: Dispute[];
  resolveDispute: (id: string, status: Dispute["status"], resolution: string) => void;

  fraud: FraudFlag[];
  setFraudStatus: (id: string, status: FraudFlag["status"]) => void;

  tickets: Ticket[];
  replyToTicket: (id: string, body: string) => void;
  setTicketStatus: (id: string, status: Ticket["status"]) => void;
  setTicketPriority: (id: string, priority: Ticket["priority"]) => void;

  policies: PolicyDoc[];
  publishPolicy: (key: string, version: number) => void;

  coupons: PlatformCoupon[];
  saveCoupon: (c: PlatformCoupon) => void;

  /** Newest-first action trail; every mutation above appends to it. */
  audit: AuditEntry[];
};

const AdminContext = React.createContext<AdminCtx | null>(null);

export function useAdmin() {
  const ctx = React.useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used within AdminProvider");
  return ctx;
}

/** Convenience hook for permission-gated rendering. */
export function useCan(): (perm: PermissionId) => boolean {
  return useAdmin().can;
}

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { user, roleName, hasPermission } = useAuth();
  const [lang, setLangState] = React.useState<Lang>("en");
  const [roles, setRoles] = React.useState<Role[]>(() => DEFAULT_ROLES.map((r) => ({ ...r })));
  const [staff, setStaff] = React.useState<StaffMember[]>(() => PLATFORM_STAFF.map((s) => ({ ...s })));

  const [shops, setShops] = React.useState<PlatformShop[]>(() => SHOPS.map((s) => ({ ...s })));
  const [users, setUsers] = React.useState<PlatformUser[]>(() => USERS.map((u) => ({ ...u })));
  const [moderation, setModeration] = React.useState<ModerationProduct[]>(() =>
    MODERATION_QUEUE.map((p) => ({ ...p })),
  );
  const [disputes, setDisputes] = React.useState<Dispute[]>(() => DISPUTES.map((d) => ({ ...d })));
  const [fraud, setFraud] = React.useState<FraudFlag[]>(() => FRAUD_FLAGS.map((f) => ({ ...f })));
  const [tickets, setTickets] = React.useState<Ticket[]>(() => TICKETS.map((t) => ({ ...t })));
  const [policies, setPolicies] = React.useState<PolicyDoc[]>(() => POLICIES.map((p) => ({ ...p })));
  const [coupons, setCoupons] = React.useState<PlatformCoupon[]>(() =>
    PLATFORM_COUPONS.map((c) => ({ ...c })),
  );
  const [audit, setAudit] = React.useState<AuditEntry[]>(() => AUDIT_LOG.map((a) => ({ ...a })));

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem("gp-admin-lang") as Lang | null;
      if (saved === "en" || saved === "np") setLangState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const setLang = React.useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem("gp-admin-lang", l);
    } catch {
      /* ignore */
    }
  }, []);

  // Permissions are the API's answer, not a local role lookup. `PermissionId` and
  // the API's `PLATFORM_PERMISSIONS` are the same dotted keys, so this is a direct
  // pass-through with no translation layer to drift.
  const can = React.useCallback((perm: PermissionId) => hasPermission(perm), [hasPermission]);

  /**
   * Append an entry to the in-memory audit trail. The API writes the real one; this
   * only backs the screens that are still on fixtures, and it is signed with the
   * genuinely signed-in operator so it at least does not misattribute anything.
   */
  const log = React.useCallback(
    (e: Omit<AuditEntry, "id" | "actor" | "actorRole" | "surface" | "ip" | "createdAt">) => {
      setAudit((prev) => [
        {
          ...e,
          id: `a-${Date.now()}`,
          actor: user?.name ?? user?.phone ?? "Platform staff",
          actorRole: roleName ?? "Platform staff",
          surface: "PLATFORM",
          ip: "—",
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    },
    [user, roleName],
  );

  /* ---------------------------------------------------------------- roles */

  const saveRole = React.useCallback(
    (next: Role) => {
      setRoles((prev) => {
        const idx = prev.findIndex((r) => r.id === next.id);
        if (idx === -1) return [...prev, next];
        const copy = [...prev];
        copy[idx] = next;
        return copy;
      });
      log({
        action: "rbac.role.update",
        entityType: "role",
        entityId: next.id,
        entityLabel: next.name,
        after: `permissions: ${next.permissions.length}`,
      });
    },
    [log],
  );

  const deleteRole = React.useCallback(
    (id: string) => {
      setRoles((prev) => prev.filter((r) => r.id !== id || r.system));
      log({ action: "rbac.role.delete", entityType: "role", entityId: id, entityLabel: id });
    },
    [log],
  );

  const cloneRole = React.useCallback(
    (id: string): Role => {
      const base: Role = roles.find((r) => r.id === id) ?? roles[0] ?? SUPER_ADMIN_ROLE;
      const clone: Role = {
        ...base,
        id: `role-${Date.now()}`,
        name: `${base.name} (copy)`,
        system: false,
        superAdmin: false,
        permissions: [...base.permissions],
      };
      setRoles((prev) => [...prev, clone]);
      log({
        action: "rbac.role.create",
        entityType: "role",
        entityId: clone.id,
        entityLabel: clone.name,
        after: `cloned from ${base.name}`,
      });
      return clone;
    },
    [roles, log],
  );

  const saveStaff = React.useCallback(
    (next: StaffMember) => {
      setStaff((prev) => {
        const idx = prev.findIndex((s) => s.id === next.id);
        if (idx === -1) return [...prev, next];
        const copy = [...prev];
        copy[idx] = next;
        return copy;
      });
      log({
        action: "rbac.staff.update",
        entityType: "user",
        entityId: next.id,
        entityLabel: next.name,
        after: `role: ${next.roleId}, status: ${next.status}`,
      });
    },
    [log],
  );

  /* ---------------------------------------------------------------- shops */

  const setShopStatus = React.useCallback(
    (id: string, status: "ACTIVE" | "SUSPENDED", note?: string) => {
      setShops((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          const next: PlatformShop = { ...s, status };
          if (note) next.note = note;
          return next;
        }),
      );
      const shop = shops.find((s) => s.id === id);
      log({
        action: status === "SUSPENDED" ? "shop.suspend" : "shop.reactivate",
        entityType: "shop",
        entityId: id,
        entityLabel: shop?.name ?? id,
        before: `status: ${shop?.status ?? "?"}`,
        after: `status: ${status}`,
      });
    },
    [shops, log],
  );

  /* ---------------------------------------------------------------- users */

  const setUserStatus = React.useCallback(
    (id: string, status: PlatformUser["status"], note?: string) => {
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, status, note: note ?? u.note } : u)));
      const user = users.find((u) => u.id === id);
      log({
        action: status === "SUSPENDED" ? "user.suspend" : "user.reactivate",
        entityType: "user",
        entityId: id,
        entityLabel: user?.name ?? id,
        before: `status: ${user?.status ?? "?"}`,
        after: `status: ${status}`,
      });
    },
    [users, log],
  );

  /* ----------------------------------------------------------- moderation */

  const setProductVisible = React.useCallback(
    (id: string, isActive: boolean) => {
      setModeration((prev) => prev.map((p) => (p.id === id ? { ...p, isActive } : p)));
      const p = moderation.find((x) => x.id === id);
      log({
        action: "product.moderate",
        entityType: "product",
        entityId: id,
        entityLabel: p?.name ?? id,
        before: `visible: ${!isActive}`,
        after: `visible: ${isActive}`,
      });
    },
    [moderation, log],
  );

  /* ------------------------------------------------------------- disputes */

  const resolveDispute = React.useCallback(
    (id: string, status: Dispute["status"], resolution: string) => {
      const now = new Date().toISOString();
      setDisputes((prev) =>
        prev.map((d) =>
          d.id === id
            ? {
                ...d,
                status,
                resolution,
                resolvedBy: CURRENT_ADMIN.name,
                updatedAt: now,
                notes: [
                  ...d.notes,
                  { author: CURRENT_ADMIN.name, role: "platform" as const, at: now, body: resolution },
                ],
              }
            : d,
        ),
      );
      const d = disputes.find((x) => x.id === id);
      log({
        action: "dispute.resolve",
        entityType: "dispute",
        entityId: id,
        entityLabel: `Dispute on ${d?.orderCode ?? id}`,
        before: `status: ${d?.status ?? "?"}`,
        after: `status: ${status}`,
      });
    },
    [disputes, log],
  );

  /* ---------------------------------------------------------------- fraud */

  const setFraudStatus = React.useCallback(
    (id: string, status: FraudFlag["status"]) => {
      setFraud((prev) => prev.map((f) => (f.id === id ? { ...f, status } : f)));
      const f = fraud.find((x) => x.id === id);
      log({
        action: "fraud.status",
        entityType: "fraud",
        entityId: id,
        entityLabel: f?.reason ?? id,
        before: `status: ${f?.status ?? "?"}`,
        after: `status: ${status}`,
      });
    },
    [fraud, log],
  );

  /* -------------------------------------------------------------- support */

  const replyToTicket = React.useCallback(
    (id: string, body: string) => {
      const now = new Date().toISOString();
      setTickets((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                status: t.status === "OPEN" ? "PENDING" : t.status,
                assignee: t.assignee ?? CURRENT_ADMIN.name,
                updatedAt: now,
                messages: [
                  ...t.messages,
                  { author: CURRENT_ADMIN.name, role: "platform" as const, at: now, body },
                ],
              }
            : t,
        ),
      );
      const t = tickets.find((x) => x.id === id);
      log({
        action: "ticket.respond",
        entityType: "ticket",
        entityId: id,
        entityLabel: `${t?.code ?? id} ${t?.subject ?? ""}`.trim(),
        after: "reply sent",
      });
    },
    [tickets, log],
  );

  const setTicketStatus = React.useCallback(
    (id: string, status: Ticket["status"]) => {
      setTickets((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status, updatedAt: new Date().toISOString() } : t)),
      );
      const t = tickets.find((x) => x.id === id);
      log({
        action: "ticket.status",
        entityType: "ticket",
        entityId: id,
        entityLabel: t?.code ?? id,
        before: `status: ${t?.status ?? "?"}`,
        after: `status: ${status}`,
      });
    },
    [tickets, log],
  );

  const setTicketPriority = React.useCallback(
    (id: string, priority: Ticket["priority"]) => {
      setTickets((prev) =>
        prev.map((t) => (t.id === id ? { ...t, priority, updatedAt: new Date().toISOString() } : t)),
      );
    },
    [],
  );

  /* ------------------------------------------------------------- policies */

  const publishPolicy = React.useCallback(
    (key: string, version: number) => {
      const now = new Date().toISOString();
      setPolicies((prev) =>
        prev.map((p) =>
          p.key === key
            ? {
                ...p,
                versions: p.versions.map((v) =>
                  v.version === version
                    ? { ...v, isPublished: true, effectiveAt: now }
                    : { ...v, isPublished: false },
                ),
              }
            : p,
        ),
      );
      const p = policies.find((x) => x.key === key);
      const wasPublished = p?.versions.find((v) => v.isPublished)?.version;
      log({
        action: "policy.publish",
        entityType: "policy",
        entityId: key,
        entityLabel: `${p?.label ?? key} v${version}`,
        before: wasPublished ? `published: v${wasPublished}` : undefined,
        after: `published: v${version}`,
      });
    },
    [policies, log],
  );

  /* -------------------------------------------------------------- coupons */

  const saveCoupon = React.useCallback(
    (next: PlatformCoupon) => {
      setCoupons((prev) => {
        const idx = prev.findIndex((c) => c.id === next.id);
        if (idx === -1) return [next, ...prev];
        const copy = [...prev];
        copy[idx] = next;
        return copy;
      });
      log({
        action: "coupon.save",
        entityType: "coupon",
        entityId: next.code,
        entityLabel: `${next.code} — ${next.description}`,
        after: `status: ${next.status}, budget: ${next.budget}`,
      });
    },
    [log],
  );

  const langValue = React.useMemo(() => ({ lang, setLang }), [lang, setLang]);

  const value = React.useMemo<AdminCtx>(
    () => ({
      me: CURRENT_ADMIN,
      can,
      roles,
      saveRole,
      deleteRole,
      cloneRole,
      staff,
      saveStaff,
      shops,
      setShopStatus,
      users,
      setUserStatus,
      moderation,
      setProductVisible,
      disputes,
      resolveDispute,
      fraud,
      setFraudStatus,
      tickets,
      replyToTicket,
      setTicketStatus,
      setTicketPriority,
      policies,
      publishPolicy,
      coupons,
      saveCoupon,
      audit,
    }),
    [
      can,
      roles,
      saveRole,
      deleteRole,
      cloneRole,
      staff,
      saveStaff,
      shops,
      setShopStatus,
      users,
      setUserStatus,
      moderation,
      setProductVisible,
      disputes,
      resolveDispute,
      fraud,
      setFraudStatus,
      tickets,
      replyToTicket,
      setTicketStatus,
      setTicketPriority,
      policies,
      publishPolicy,
      coupons,
      saveCoupon,
      audit,
    ],
  );

  return (
    <LanguageContext.Provider value={langValue}>
      <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
    </LanguageContext.Provider>
  );
}

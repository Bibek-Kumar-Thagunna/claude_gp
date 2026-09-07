"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ShieldCheck,
  Plus,
  Copy,
  Trash2,
  Pencil,
  X,
  Search,
  Lock,
  RefreshCw,
  Users,
  Store,
  Check,
} from "lucide-react";
import { ApiError } from "@gopasal/api-client";
import { useAuth } from "@/components/auth-provider";
import { useShops } from "@/components/shop-provider";
import { PageHeader, Card, Button, Badge, EmptyState, Switch } from "@/components/primitives";
import { PermissionGate } from "@/components/PermissionGate";
import { ErrorPanel, InlineError, InlineNotice, SkeletonRows, Spinner } from "@/components/states";
import { cn } from "@/lib/cn";
import { num } from "@/lib/format";
import { asApiError } from "@/lib/api/client";
import { useEscape } from "@/lib/use-escape";
import {
  cloneShopRole,
  createShopRole,
  deleteShopRole,
  fetchShopPermissionCatalog,
  listShopRoles,
  roleMemberScope,
  rolePermissionKeys,
  updateShopRole,
  type ShopRoleWire,
} from "@/lib/api/roles";
import {
  catalogKeys,
  permissionLabelFrom,
  roleAccent,
  roleGrantSummary,
  toCatalogGroups,
  type CatalogGroup,
} from "@/lib/team-view";

/**
 * Roles, built from the API's own permission catalogue.
 *
 * `GET /seller/shops/:shopId/roles/catalog` decides what this editor may offer.
 * Nothing on this screen invents a permission key: a locally-held list would let
 * a shop owner toggle something the server answers `Unknown permission: …` to,
 * or quietly hide a key the API has added since this build shipped. What the
 * console contributes is the Nepali label and the shopkeeper-facing hint, matched
 * by key — see `lib/team-view.ts`.
 *
 * Three constraints come straight from `roles.service.ts`:
 *
 * - **Every route here is `rbac.manage`**, reads included, and roles are per
 *   shop. So this screen needs one shop, not the consolidated view, and it says
 *   so instead of guessing which shop was meant.
 * - **System templates cannot be edited or deleted, only cloned** — and a clone
 *   is never privileged, however privileged its source. The Owner role cannot be
 *   edited at all. Both are visible on the row (`isSystem`, `isPrivileged`), so
 *   the controls are absent rather than failing with a 403.
 * - **A role with members cannot be deleted.** `_count.shopMemberships` says how
 *   many — but for a shared template that number spans every shop on GoPasal, so
 *   it is labelled for what it is rather than printed as "your team".
 *
 * `PATCH` replaces the whole permission set when `permissions` is present and
 * keeps it when omitted; there is no partial add or remove. The editor therefore
 * sends the complete set it is showing.
 */

export default function RolesPage() {
  return (
    <PermissionGate perm="rbac.manage">
      <RolesGate />
    </PermissionGate>
  );
}

/**
 * Roles belong to one shop, so this picks one before anything is fetched: the
 * shop in scope when it is manageable, the only manageable shop when there is
 * just one, and otherwise a choice — never a silent pick.
 */
function RolesGate() {
  const { canInShop } = useAuth();
  const { activeShopId, scopedShopIds, shopById, switchShop, loading } = useShops();

  const manageable = React.useMemo(
    () => scopedShopIds.filter((id) => canInShop(id, "rbac.manage")),
    [scopedShopIds, canInShop],
  );

  const chosen =
    activeShopId && manageable.includes(activeShopId)
      ? activeShopId
      : manageable.length === 1
        ? manageable[0]
        : undefined;

  if (chosen) return <RolesInner shopId={chosen} />;

  return (
    <div>
      <PageHeader
        icon={<ShieldCheck className="h-5 w-5" />}
        title="Roles & permissions"
        subtitle="Roles belong to a single shop, so pick which shop’s roles to work on."
      />
      {manageable.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={<Lock className="h-6 w-6" />}
            title={loading ? "Loading your shops" : "No shop to manage roles for"}
            description={
              loading
                ? "One moment — reading the shops on your account."
                : "Creating and editing roles needs the “manage roles & permissions” permission on a shop. Ask an owner to grant it."
            }
          />
        </Card>
      ) : (
        <div className="space-y-2.5">
          {manageable.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => switchShop(id)}
              className="flex w-full items-center justify-between rounded-xl border border-ink-200 bg-white px-4 py-3.5 text-left transition-colors hover:bg-ink-50"
            >
              <span className="inline-flex items-center gap-2 font-semibold text-ink-900">
                <Store className="h-4 w-4 text-ink-400" /> {shopById(id)?.name ?? id}
              </span>
              <span className="text-sm text-ink-400">Manage roles</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** What the editor drawer is doing: a new role, or an existing one. */
type EditorState = { mode: "new" } | { mode: "edit"; role: ShopRoleWire } | null;

function RolesInner({ shopId }: { shopId: string }) {
  const { shopById } = useShops();
  const [roles, setRoles] = React.useState<ShopRoleWire[]>([]);
  const [catalog, setCatalog] = React.useState<CatalogGroup[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [acting, setActing] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [editor, setEditor] = React.useState<EditorState>(null);

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const [list, wire] = await Promise.all([
          listShopRoles(shopId, signal),
          fetchShopPermissionCatalog(shopId, signal),
        ]);
        if (signal?.aborted) return;
        setRoles(list);
        setCatalog(toCatalogGroups(wire));
        setError(null);
      } catch (err) {
        if (signal?.aborted) return;
        setError(asApiError(err));
        setRoles([]);
        setCatalog([]);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [shopId],
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  /** Writes answer without `_count`, so the list is re-read rather than patched. */
  const runAction = React.useCallback(
    async (id: string, fn: () => Promise<unknown>) => {
      setActing(id);
      setActionError(null);
      try {
        await fn();
        await load();
      } catch (err) {
        setActionError(
          err instanceof ApiError ? err.message : "That didn’t go through. Please try again.",
        );
      } finally {
        setActing(null);
        setConfirming(null);
      }
    },
    [load],
  );

  const selected = roles.find((r) => r.id === selectedId) ?? roles[0] ?? null;
  const shopName = shopById(shopId)?.name;
  const custom = roles.filter((r) => r.shopId === shopId).length;

  return (
    <div>
      <PageHeader
        icon={<ShieldCheck className="h-5 w-5" />}
        title="Roles & permissions"
        subtitle={
          shopName
            ? `${shopName} · ${num(custom)} of your own role${custom === 1 ? "" : "s"}, plus GoPasal’s templates`
            : "This shop’s own roles, plus GoPasal’s shared templates"
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Refresh
            </Button>
            <Button size="sm" disabled={catalog.length === 0} onClick={() => setEditor({ mode: "new" })}>
              <Plus className="h-4 w-4" /> New role
            </Button>
          </>
        }
      />

      {actionError && <InlineError message={actionError} className="mb-4" />}

      {loading && roles.length === 0 ? (
        <SkeletonRows rows={5} />
      ) : error ? (
        <ErrorPanel
          title="Couldn’t load this shop’s roles"
          message={error.message}
          offline={error.offline}
          onRetry={() => void load()}
        />
      ) : roles.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={<ShieldCheck className="h-6 w-6" />}
            title="No roles yet"
            description="Unusual — every shop is created with an Owner role and GoPasal’s templates. Try refreshing."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          <div className="space-y-2.5">
            {roles.map((r) => (
              <RoleCard
                key={r.id}
                role={r}
                shopId={shopId}
                active={selected?.id === r.id}
                onSelect={() => setSelectedId(r.id)}
              />
            ))}
          </div>

          {selected && (
            <RoleDetail
              role={selected}
              shopId={shopId}
              catalog={catalog}
              busy={acting === selected.id}
              confirming={confirming === selected.id}
              onEdit={() => setEditor({ mode: "edit", role: selected })}
              onClone={() => void runAction(selected.id, () => cloneShopRole(shopId, selected.id))}
              onAskDelete={() => setConfirming(selected.id)}
              onCancelDelete={() => setConfirming(null)}
              onDelete={() => void runAction(selected.id, () => deleteShopRole(shopId, selected.id))}
            />
          )}
        </div>
      )}

      <AnimatePresence>
        {editor && (
          <RoleEditor
            catalog={catalog}
            role={editor.mode === "edit" ? editor.role : null}
            onClose={() => setEditor(null)}
            onSave={async (body) => {
              if (editor.mode === "edit") {
                await updateShopRole(shopId, editor.role.id, body);
              } else {
                await createShopRole(shopId, {
                  name: body.name ?? "",
                  ...(body.description ? { description: body.description } : {}),
                  permissions: body.permissions ?? [],
                });
              }
              setEditor(null);
              await load();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------- One role row */

function RoleCard({
  role,
  shopId,
  active,
  onSelect,
}: {
  role: ShopRoleWire;
  shopId: string;
  active: boolean;
  onSelect: () => void;
}) {
  const tone = roleAccent(role);
  const scope = roleMemberScope(role, shopId);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full rounded-xl border bg-white px-4 py-3.5 text-left transition-colors",
        active ? "border-crimson-300 bg-crimson-50/40" : "border-ink-200 hover:bg-ink-50",
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="inline-flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold text-ink-900">{role.name}</span>
          {role.isPrivileged && <Badge tone="crimson">Owner</Badge>}
          {role.isSystem && !role.isPrivileged && <Badge tone="ink">Template</Badge>}
        </span>
        <Badge tone={tone}>{role.isPrivileged ? "All" : num(role.permissions.length)}</Badge>
      </span>
      {role.description && (
        <span className="mt-1 block truncate text-xs text-ink-400">{role.description}</span>
      )}
      <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-ink-400">
        <Users className="h-3 w-3" />
        {scope === "this-shop"
          ? `${num(role._count.shopMemberships)} in this shop`
          : `${num(role._count.shopMemberships)} across GoPasal`}
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------- Role detail pane */

function RoleDetail({
  role,
  shopId,
  catalog,
  busy,
  confirming,
  onEdit,
  onClone,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  role: ShopRoleWire;
  shopId: string;
  catalog: CatalogGroup[];
  busy: boolean;
  confirming: boolean;
  onEdit: () => void;
  onClone: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const granted = rolePermissionKeys(role);
  const scope = roleMemberScope(role, shopId);
  const editable = !role.isSystem && !role.isPrivileged;
  const hasMembers = scope === "this-shop" && role._count.shopMemberships > 0;

  /*
    A key the role grants that the catalogue no longer lists. Shown rather than
    dropped: the whole point of this screen is that what is granted is visible.
  */
  const orphaned = [...granted].filter((k) => !catalog.some((g) => g.permissions.some((p) => p.key === k)));

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-ink-900">{role.name}</h2>
            {role.isPrivileged && <Badge tone="crimson">Owner</Badge>}
            {role.isSystem && !role.isPrivileged && <Badge tone="ink">GoPasal template</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {/* A cleared description arrives as "" rather than null, and "" is not
                nullish — so `??` alone would print an empty run before the dot. */}
            {role.description?.trim() ? role.description : "No description."} ·{" "}
            {roleGrantSummary(role)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editable && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={busy} onClick={onClone}>
            {busy ? <Spinner /> : <Copy className="h-4 w-4" />} Clone
          </Button>
          {editable &&
            (confirming ? (
              <>
                <Button variant="danger" size="sm" disabled={busy} onClick={onDelete}>
                  {busy ? <Spinner /> : <Trash2 className="h-4 w-4" />} Delete for good
                </Button>
                <Button variant="ghost" size="sm" onClick={onCancelDelete}>
                  Keep
                </Button>
              </>
            ) : (
              <Button
                variant="danger"
                size="sm"
                disabled={hasMembers}
                onClick={onAskDelete}
                title={hasMembers ? "Move this role’s members to another role first." : undefined}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            ))}
        </div>
      </div>

      <div className="space-y-3 px-5 py-4">
        {role.isPrivileged && (
          <InlineNotice message="The Owner role holds every permission in the shop, including ones added to GoPasal later, and cannot be edited or deleted. Clone it if you want a role that starts from the same place." />
        )}
        {role.isSystem && !role.isPrivileged && (
          <InlineNotice message="This is one of GoPasal’s shared templates. It cannot be edited or deleted — clone it and edit the copy, which belongs to your shop alone." />
        )}
        {hasMembers && (
          <InlineNotice
            message={`${num(role._count.shopMemberships)} ${role._count.shopMemberships === 1 ? "person holds" : "people hold"} this role in this shop. Move them to another role before deleting it.`}
          />
        )}
        {scope === "platform-wide" && role._count.shopMemberships > 0 && (
          <InlineNotice
            message={`${num(role._count.shopMemberships)} memberships use this template across GoPasal — that count is not your shop alone.`}
          />
        )}
      </div>

      <div className="space-y-5 px-5 pb-5">
        {catalog.map((group) => {
          const on = group.permissions.filter((p) => role.isPrivileged || granted.has(p.key));
          return (
            <div key={group.group}>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-ink-900">{group.group}</h3>
                <span className="text-xs text-ink-400">
                  {num(on.length)} of {num(group.permissions.length)}
                </span>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {group.permissions.map((p) => {
                  const has = role.isPrivileged || granted.has(p.key);
                  return (
                    <div
                      key={p.key}
                      className={cn(
                        "flex items-start gap-2 rounded-lg px-2.5 py-2 text-sm",
                        has ? "bg-[#EAF7EF] text-[#0B7E58]" : "bg-ink-50 text-ink-400",
                      )}
                    >
                      <span className="mt-0.5 shrink-0">
                        {has ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium">{p.label}</span>
                        {p.labelNp && (
                          <span className="deva block text-xs opacity-80" lang="ne">
                            {p.labelNp}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {orphaned.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-bold text-ink-900">Not in the catalogue</h3>
            <p className="mb-2 text-xs text-ink-400">
              This role grants keys the API’s catalogue no longer lists. They are shown so nothing is
              granted invisibly; editing the role will drop them.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {orphaned.map((k) => (
                <Badge key={k} tone="marigold">
                  {permissionLabelFrom(catalog, k)}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------- Role editor */

/** What the drawer hands back — exactly the shape `PATCH …/roles/:id` accepts. */
type RoleDraft = { name?: string; description?: string; permissions?: string[] };

/**
 * The editor toggles the server's keys, never a local list.
 *
 * `permissions` is `@ArrayNotEmpty` on create, so an empty role is refused by the
 * API rather than allowed and then surprising someone — Save stays disabled until
 * at least one key is on. There is no "grant everything" that means privileged
 * either: the closest a custom role gets is every key currently in the
 * catalogue, which is a different and honest thing, and labelled as such.
 */
function RoleEditor({
  catalog,
  role,
  onClose,
  onSave,
}: {
  catalog: CatalogGroup[];
  role: ShopRoleWire | null;
  onClose: () => void;
  onSave: (draft: RoleDraft) => Promise<void>;
}) {
  const everyKey = React.useMemo(() => catalogKeys(catalog), [catalog]);
  const [name, setName] = React.useState(role?.name ?? "");
  const [description, setDescription] = React.useState(role?.description ?? "");
  const [keys, setKeys] = React.useState<Set<string>>(() =>
    role ? new Set([...rolePermissionKeys(role)].filter((k) => everyKey.includes(k))) : new Set(),
  );
  const [filter, setFilter] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  useEscape(onClose);

  const toggle = (key: string, on: boolean) =>
    setKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const setGroup = (group: CatalogGroup, on: boolean) =>
    setKeys((prev) => {
      const next = new Set(prev);
      for (const p of group.permissions) {
        if (on) next.add(p.key);
        else next.delete(p.key);
      }
      return next;
    });

  const q = filter.trim().toLowerCase();
  const shown = catalog
    .map((g) => ({
      ...g,
      permissions: q
        ? g.permissions.filter(
            (p) =>
              p.label.toLowerCase().includes(q) ||
              p.key.toLowerCase().includes(q) ||
              (p.labelNp ?? "").includes(filter.trim()),
          )
        : g.permissions,
    }))
    .filter((g) => g.permissions.length > 0);

  const trimmed = name.trim();
  const canSave =
    trimmed.length >= 2 && trimmed.length <= 60 && keys.size > 0 && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    setErr(null);
    try {
      /*
        The description is sent even when it is empty, because an empty one is a
        real value the API accepts: both DTOs declare it `@IsOptional() @IsString()
        @MaxLength(200)` with no `@MinLength`, and `RolesService#update` writes
        `description: patch.description` straight through. Omitting it — which this
        drawer used to do — kept the old text on the server while showing the
        shopkeeper an empty box, so clearing a description looked like it saved and
        then reappeared on the next read. The create path (`onSave` above) drops an
        empty string instead of storing one, since there is nothing to clear yet.
      */
      await onSave({
        name: trimmed,
        description: description.trim(),
        permissions: [...keys],
      });
    } catch (error) {
      setErr(
        error instanceof ApiError ? error.message : "That didn’t save. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 z-50 bg-ink-900/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        // The backdrop is a mouse convenience, not content: Escape is the keyboard
        // equivalent, and the Close button below is the visible one.
        aria-hidden
      />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-editor-title"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-white shadow-2xl"
        initial={{ x: 40, opacity: 0.6 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ type: "tween", duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <h2 id="role-editor-title" className="text-lg font-bold text-ink-900">
            {role ? `Edit ${role.name}` : "New role"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-ink-500 hover:bg-ink-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="gp-scroll flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {err && <InlineError message={err} />}

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-700">Role name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Evening Counter"
              maxLength={60}
              className="h-11 w-full rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-crimson-300"
            />
            <span className="mt-1 block text-xs text-ink-400">
              Between 2 and 60 characters.
            </span>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-700">
              Description <span className="font-normal text-ink-400">(optional)</span>
            </span>
            {/* Both caps mirror the DTOs — `name` is @MaxLength(60), `description`
                @MaxLength(200) — so the field stops where the server stops instead
                of accepting a sentence and answering 400 on Save. */}
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this role is for"
              maxLength={200}
              className="h-11 w-full rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-crimson-300"
            />
            <span className="mt-1 block text-xs text-ink-400">
              Up to 200 characters. Leave it empty to remove the description.
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-4">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter permissions"
                className="h-10 w-full rounded-xl border border-ink-200 pl-9 pr-3 text-sm outline-none focus:border-crimson-300"
              />
            </div>
            <span className="text-xs font-semibold text-ink-500">
              {num(keys.size)} of {num(everyKey.length)} on
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setKeys(new Set(everyKey))}
              title="Every permission the API currently lists. Not the same as Owner, which also covers future ones."
            >
              Select all
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setKeys(new Set())}>
              Clear
            </Button>
          </div>

          {shown.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-400">
              No permission matches “{filter.trim()}”.
            </p>
          ) : (
            shown.map((group) => {
              const onCount = group.permissions.filter((p) => keys.has(p.key)).length;
              return (
                <div key={group.group} className="rounded-xl border border-ink-200 p-3.5">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-ink-900">{group.group}</h3>
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setGroup(group, true)}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-ink-500 hover:bg-ink-100"
                      >
                        All {onCount === group.permissions.length ? "✓" : ""}
                      </button>
                      <button
                        type="button"
                        onClick={() => setGroup(group, false)}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-ink-500 hover:bg-ink-100"
                      >
                        None
                      </button>
                    </span>
                  </div>

                  <div className="space-y-2">
                    {group.permissions.map((p) => (
                      <div key={p.key} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink-800">
                            {p.label}
                            {p.labelNp && (
                              <span className="deva ml-1.5 text-xs font-normal text-ink-400" lang="ne">
                                {p.labelNp}
                              </span>
                            )}
                          </p>
                          {p.hint && <p className="text-xs text-ink-400">{p.hint}</p>}
                          {p.unglossed && (
                            <p className="text-xs text-[#8a5a00]">
                              New permission — {p.key}. This console has no description for it yet.
                            </p>
                          )}
                        </div>
                        <Switch
                          checked={keys.has(p.key)}
                          onChange={(v) => toggle(p.key, v)}
                          label={p.label}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-ink-100 px-5 py-4">
          <p className="text-xs text-ink-400">
            {keys.size === 0
              ? "A role must grant at least one permission."
              : "Saving replaces this role’s whole permission set."}
          </p>
          <span className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!canSave} onClick={() => void submit()}>
              {saving ? <Spinner /> : <Check className="h-4 w-4" />} Save role
            </Button>
          </span>
        </div>
      </motion.div>
    </>
  );
}


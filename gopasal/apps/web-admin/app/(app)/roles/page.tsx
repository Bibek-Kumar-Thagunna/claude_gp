"use client";

import * as React from "react";
import {
  ShieldCheck,
  Search,
  Plus,
  Copy,
  Trash2,
  Save,
  Lock,
  Users,
  KeyRound,
  RotateCcw,
  Info,
  CheckCheck,
  CircleSlash,
} from "lucide-react";
import {
  PageHeader,
  Card,
  SectionTitle,
  Badge,
  Button,
  SearchInput,
  EmptyState,
  Field,
  inputCls,
  Switch,
} from "@/components/primitives";
import { PermissionGate } from "@/components/PermissionGate";
import { ConfirmDialog } from "@/components/Drawer";
import { Reveal } from "@/components/Reveal";
import { useAdmin, useLang } from "@/components/providers";
import {
  PERMISSION_GROUPS,
  ALL_PERMISSIONS,
  type PermissionId,
  type Role,
} from "@/lib/rbac";
import { num } from "@/lib/format";

/** Tailwind classes for the colour a role carries in the list. */
const DOT: Record<string, string> = {
  crimson: "bg-crimson-500",
  blue: "bg-[#1D4ED8]",
  marigold: "bg-[#E8A33D]",
  green: "bg-[#0B7E58]",
  ink: "bg-ink-400",
};

const COLORS = ["crimson", "blue", "marigold", "green", "ink"] as const;

const same = (a: PermissionId[], b: PermissionId[]) =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

export default function RolesPage() {
  return (
    <PermissionGate
      perm="rbac.platform.manage"
      title="You can’t manage platform roles"
      description="Creating roles and granting permissions needs the “Manage platform roles” permission — the highest level of access GoPasal grants."
    >
      <RolesInner />
    </PermissionGate>
  );
}

function RolesInner() {
  const { lang } = useLang();
  const { roles, saveRole, deleteRole, cloneRole, staff } = useAdmin();

  const [selectedId, setSelectedId] = React.useState<string>(roles[0]?.id ?? "");
  const [q, setQ] = React.useState("");
  const [draft, setDraft] = React.useState<Role | null>(null);
  const [confirm, setConfirm] = React.useState<"delete" | "save" | null>(null);

  const selected = roles.find((r) => r.id === selectedId) ?? roles[0] ?? null;

  /* Reload the editor whenever a different role is opened. */
  React.useEffect(() => {
    setDraft(
      selected ? { ...selected, permissions: [...selected.permissions] } : null,
    );
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const usedBy = React.useCallback(
    (roleId: string) => staff.filter((s) => s.roleId === roleId && s.status !== "SUSPENDED"),
    [staff],
  );

  const listed = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return roles
      .filter((r) =>
        needle
          ? r.name.toLowerCase().includes(needle) || r.description.toLowerCase().includes(needle)
          : true,
      )
      .sort((a, b) => Number(b.system) - Number(a.system) || a.name.localeCompare(b.name));
  }, [roles, q]);

  const isSuper = draft?.superAdmin === true;
  const held = React.useMemo<PermissionId[]>(
    () => (isSuper ? ALL_PERMISSIONS : (draft?.permissions ?? [])),
    [isSuper, draft?.permissions],
  );
  const has = (p: PermissionId) => held.includes(p);

  const dirty =
    !!draft &&
    !!selected &&
    (draft.name !== selected.name ||
      draft.description !== selected.description ||
      draft.color !== selected.color ||
      !same(draft.permissions, selected.permissions));

  const toggle = (p: PermissionId, on: boolean) => {
    if (!draft || isSuper) return;
    setDraft({
      ...draft,
      permissions: on
        ? [...draft.permissions.filter((x) => x !== p), p]
        : draft.permissions.filter((x) => x !== p),
    });
  };

  const setGroup = (ids: PermissionId[], on: boolean) => {
    if (!draft || isSuper) return;
    const rest = draft.permissions.filter((x) => !ids.includes(x));
    setDraft({ ...draft, permissions: on ? [...rest, ...ids] : rest });
  };

  const createRole = () => {
    const fresh: Role = {
      id: `role-${Date.now()}`,
      name: "New role",
      description: "Describe what this role is for, so the next admin does not have to guess.",
      system: false,
      permissions: ["admin.dashboard.view"],
      color: "ink",
    };
    saveRole(fresh);
    setSelectedId(fresh.id);
  };

  return (
    <>
      <PageHeader
        icon={<ShieldCheck className="h-5 w-5" />}
        title={lang === "np" ? "भूमिका र अनुमति" : "Roles and permissions"}
        subtitle={
          lang === "np"
            ? "कुनै पनि अनुमति नदिइएसम्म कर्मचारी कुनै काम गर्न सक्दैनन् — पूर्ण रूपमा तपाईंको नियन्त्रणमा"
            : "Nothing is allowed until you allow it. Build the roles your team actually needs, then hand them out on the staff page."
        }
        actions={
          <>
            <Badge tone="ink" dot={false}>
              <KeyRound className="h-3.5 w-3.5" /> {num(ALL_PERMISSIONS.length)} permissions
            </Badge>
            <Button size="sm" onClick={createRole}>
              <Plus className="h-4 w-4" /> New role
            </Button>
          </>
        }
      />

      {listed.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6" />}
          title="No role matches that search"
          description="Clear the search, or create a role for the job you have in mind."
          action={
            <Button size="sm" onClick={createRole}>
              <Plus className="h-4 w-4" /> New role
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Reveal>
            <Card className="pb-3">
              <SectionTitle title="Roles" hint="Default roles first" />
              <div className="px-5 pt-4">
                <SearchInput
                  value={q}
                  onChange={setQ}
                  placeholder="Role name"
                  icon={<Search className="h-4 w-4" />}
                />
              </div>
              <ul className="mt-3 divide-y divide-ink-100">
                {listed.map((r) => {
                  const active = selected?.id === r.id;
                  const people = usedBy(r.id).length;
                  const count = r.superAdmin ? ALL_PERMISSIONS.length : r.permissions.length;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        aria-current={active}
                        className={
                          active
                            ? "w-full border-l-[3px] border-crimson-500 bg-crimson-50/60 px-4 py-3.5 text-left"
                            : "w-full border-l-[3px] border-transparent px-4 py-3.5 text-left transition hover:bg-ink-50"
                        }
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[r.color] ?? DOT.ink}`}
                            aria-hidden
                          />
                          <span className="truncate text-sm font-semibold text-ink-900">
                            {r.name}
                          </span>
                          {r.system && (
                            <span className="ml-auto shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wide text-ink-500">
                              default
                            </span>
                          )}
                        </span>
                        <span className="mt-1 block text-xs text-ink-500">
                          {r.superAdmin ? "Every permission" : `${num(count)} permissions`} ·{" "}
                          {people === 0 ? "nobody yet" : `${num(people)} on the team`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="px-5 pb-1 pt-4 text-xs text-ink-400">
                A default role can be edited and copied, but never deleted — so the console can
                always be recovered.
              </p>
            </Card>
          </Reveal>

          {draft && selected && (
            <Reveal delay={0.06}>
              <Card className="pb-5">
                <SectionTitle
                  title={draft.name || "Untitled role"}
                  hint={
                    isSuper
                      ? "Holds every permission GoPasal has, including ones added in future releases."
                      : `${num(held.length)} of ${num(ALL_PERMISSIONS.length)} permissions granted`
                  }
                  action={
                    <span className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedId(cloneRole(selected.id).id)}
                      >
                        <Copy className="h-4 w-4" /> Duplicate
                      </Button>
                      {!selected.system && (
                        <Button variant="danger" size="sm" onClick={() => setConfirm("delete")}>
                          <Trash2 className="h-4 w-4" /> Delete
                        </Button>
                      )}
                    </span>
                  }
                />

                <div className="px-5 pt-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Role name" required>
                      <input
                        className={inputCls}
                        value={draft.name}
                        onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                        maxLength={40}
                      />
                    </Field>
                    <Field label="Colour" hint="Used on the staff list and the audit log">
                      <div className="flex flex-wrap gap-2 pt-1">
                        {COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            aria-label={c}
                            aria-pressed={draft.color === c}
                            onClick={() => setDraft({ ...draft, color: c })}
                            className={
                              draft.color === c
                                ? `h-8 w-8 rounded-full ring-2 ring-ink-900 ring-offset-2 ${DOT[c]}`
                                : `h-8 w-8 rounded-full ${DOT[c]} opacity-60 transition hover:opacity-100`
                            }
                          />
                        ))}
                      </div>
                    </Field>
                  </div>

                  <Field
                    label="What this role is for"
                    hint="Written for the person who inherits your job"
                    className="mt-4"
                  >
                    <textarea
                      className={`${inputCls} resize-y`}
                      rows={2}
                      value={draft.description}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                      maxLength={220}
                    />
                  </Field>

                  {isSuper && (
                    <p className="mt-4 flex items-start gap-2 rounded-xl bg-crimson-50/70 px-3.5 py-3 text-xs text-crimson-800">
                      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Super Admin is deliberately unrestricted, so its switches are locked on. To
                      give someone narrower access, duplicate this role and switch things off in the
                      copy.
                    </p>
                  )}

                  {selected.system && !isSuper && (
                    <p className="mt-4 flex items-start gap-2 rounded-xl bg-ink-50 px-3.5 py-3 text-xs text-ink-600">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
                      This is a default role. You can edit it freely, but it cannot be deleted —
                      duplicate it if you would rather keep the original wording intact.
                    </p>
                  )}

                  <div className="mt-6 flex items-center justify-between">
                    <p className="flex items-center gap-2 text-sm font-bold text-ink-900">
                      <KeyRound className="h-4 w-4 text-ink-400" /> Permissions
                    </p>
                    <span className="flex items-center gap-1.5 text-xs text-ink-500">
                      <Users className="h-3.5 w-3.5" />
                      {usedBy(selected.id).length === 0
                        ? "nobody holds this yet"
                        : `${num(usedBy(selected.id).length)} people hold this role`}
                    </span>
                  </div>

                  <div className="mt-3 space-y-3">
                    {PERMISSION_GROUPS.map((g) => {
                      const ids = g.permissions.map((p) => p.id);
                      const on = ids.filter((id) => has(id)).length;
                      const all = on === ids.length;
                      return (
                        <div key={g.resource} className="rounded-xl border border-ink-100">
                          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 bg-ink-50/60 px-3.5 py-3">
                            <div>
                              <p className="text-sm font-bold text-ink-900">
                                {lang === "np" ? g.labelNp : g.label}
                              </p>
                              <p className="mt-0.5 text-xs text-ink-500">{g.description}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={
                                  all
                                    ? "rounded-full bg-[#EAF7EF] px-2 py-0.5 text-xs font-bold text-[#0B7E58]"
                                    : "rounded-full bg-ink-100 px-2 py-0.5 text-xs font-bold text-ink-600"
                                }
                              >
                                {num(on)}/{num(ids.length)}
                              </span>
                              {!isSuper && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setGroup(ids, !all)}
                                >
                                  {all ? (
                                    <>
                                      <CircleSlash className="h-4 w-4" /> None
                                    </>
                                  ) : (
                                    <>
                                      <CheckCheck className="h-4 w-4" /> All
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          </div>
                          <ul className="divide-y divide-ink-100">
                            {g.permissions.map((p) => (
                              <li
                                key={p.id}
                                className="flex items-start justify-between gap-4 px-3.5 py-3"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-ink-800">
                                    {lang === "np" ? p.labelNp : p.label}
                                  </p>
                                  <p className="mt-0.5 text-xs text-ink-500">{p.hint}</p>
                                  <p className="mt-0.5 font-mono text-[0.68rem] text-ink-400">
                                    {p.id}
                                  </p>
                                </div>
                                <Switch
                                  checked={has(p.id)}
                                  disabled={isSuper}
                                  onChange={(v) => toggle(p.id, v)}
                                  label={p.label}
                                />
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-5">
                    <p className="text-xs text-ink-500">
                      {dirty
                        ? "Unsaved changes. Nothing is applied until you save."
                        : "Saved — this is exactly what the API enforces."}
                    </p>
                    <span className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!dirty}
                        onClick={() =>
                          setDraft({ ...selected, permissions: [...selected.permissions] })
                        }
                      >
                        <RotateCcw className="h-4 w-4" /> Undo changes
                      </Button>
                      <Button size="sm" disabled={!dirty} onClick={() => setConfirm("save")}>
                        <Save className="h-4 w-4" /> Save role
                      </Button>
                    </span>
                  </div>
                </div>
              </Card>
            </Reveal>
          )}

        </div>
      )}

      <ConfirmDialog
        open={confirm === "delete"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (selected) {
            deleteRole(selected.id);
            setSelectedId(roles.find((r) => r.id !== selected.id)?.id ?? "");
          }
          setConfirm(null);
        }}
        title={`Delete the ${selected?.name ?? "role"} role?`}
        description={`${
          selected && usedBy(selected.id).length > 0
            ? `${num(usedBy(selected.id).length)} people still hold this role and will lose access the moment it goes. `
            : ""
        }Deleting a role never deletes a person — they simply have nothing granted until you give them another role.`}
        confirmLabel="Delete role"
        destructive
        reasonLabel="Why this role is being removed"
        reasonRequired
      />

      <ConfirmDialog
        open={confirm === "save"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (draft) saveRole(draft);
          setConfirm(null);
        }}
        title={`Save ${draft?.name ?? "this role"}?`}
        description={`${num(draft?.permissions.length ?? 0)} permissions will apply to ${
          selected ? num(usedBy(selected.id).length) : "0"
        } people on their next request. Anything you switched off is revoked immediately.`}
        confirmLabel="Save permissions"
        reasonLabel="Why this role is changing"
        reasonRequired
      />

      <p className="mt-6 text-xs text-ink-400">
        Every permission here maps one-to-one to the guard the API enforces, so a role can never
        promise something the server would refuse.
      </p>
    </>
  );
}



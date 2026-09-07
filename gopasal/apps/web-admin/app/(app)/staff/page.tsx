"use client";

import * as React from "react";
import {
  UsersRound,
  Search,
  UserPlus,
  Pencil,
  ShieldCheck,
  ShieldOff,
  Mail,
  Phone as PhoneIcon,
  Clock,
  Send,
  Lock,
  Info,
} from "lucide-react";
import {
  PageHeader,
  Badge,
  Button,
  FilterPills,
  SearchInput,
  EmptyState,
  Field,
  inputCls,
  Avatar,
  TableWrap,
  Th,
  Td,
  type Tone,
} from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { StatusBadge } from "@/components/StatusBadge";
import { PermissionGate } from "@/components/PermissionGate";
import { Drawer, ConfirmDialog } from "@/components/Drawer";
import { Reveal } from "@/components/Reveal";
import { useAdmin, useLang } from "@/components/providers";
import { NOW, type StaffMember, type StaffStatus } from "@/lib/data";
import { ALL_PERMISSIONS } from "@/lib/rbac";
import { num, ago, fullDate, phone as fmtPhone } from "@/lib/format";

type Filter = "ALL" | StaffStatus;

const DOT: Record<string, string> = {
  crimson: "bg-crimson-500",
  blue: "bg-[#1D4ED8]",
  marigold: "bg-[#E8A33D]",
  green: "bg-[#0B7E58]",
  ink: "bg-ink-400",
};

type Draft = {
  id: string;
  name: string;
  phone: string;
  email: string;
  roleId: string;
  status: StaffStatus;
};

export default function StaffPage() {
  return (
    <PermissionGate
      perm="rbac.platform.manage"
      title="You can’t manage platform staff"
      description="Inviting people and changing what they can reach needs the “Manage platform roles” permission."
    >
      <StaffInner />
    </PermissionGate>
  );
}

function StaffInner() {
  const { lang } = useLang();
  const { staff, saveStaff, roles, me } = useAdmin();
  const [filter, setFilter] = React.useState<Filter>("ALL");
  const [q, setQ] = React.useState("");
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [pending, setPending] = React.useState<{ person: StaffMember; to: StaffStatus } | null>(
    null,
  );

  const roleOf = React.useCallback(
    (roleId: string) => roles.find((r) => r.id === roleId) ?? null,
    [roles],
  );

  const counts = React.useMemo(
    () => ({
      ALL: staff.length,
      ACTIVE: staff.filter((s) => s.status === "ACTIVE").length,
      INVITED: staff.filter((s) => s.status === "INVITED").length,
      SUSPENDED: staff.filter((s) => s.status === "SUSPENDED").length,
    }),
    [staff],
  );

  /* How many distinct roles are actually in use, and who can do everything. */
  const spread = React.useMemo(() => {
    const used = new Set(staff.filter((s) => s.status === "ACTIVE").map((s) => s.roleId));
    const supers = staff.filter(
      (s) => s.status === "ACTIVE" && roleOf(s.roleId)?.superAdmin === true,
    ).length;
    return { used: used.size, supers };
  }, [staff, roleOf]);

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rank: Record<StaffStatus, number> = { INVITED: 0, ACTIVE: 1, SUSPENDED: 2 };
    return staff
      .filter((s) => (filter === "ALL" ? true : s.status === filter))
      .filter((s) => {
        if (!needle) return true;
        return (
          s.name.toLowerCase().includes(needle) ||
          s.email.toLowerCase().includes(needle) ||
          s.phone.includes(needle) ||
          (roleOf(s.roleId)?.name.toLowerCase().includes(needle) ?? false)
        );
      })
      .sort((a, b) => rank[a.status] - rank[b.status] || a.name.localeCompare(b.name));
  }, [staff, filter, q, roleOf]);

  const invite = () =>
    setDraft({
      id: "",
      name: "",
      phone: "",
      email: "",
      roleId: roles.find((r) => !r.superAdmin)?.id ?? roles[0]?.id ?? "",
      status: "INVITED",
    });

  const commit = () => {
    if (!draft) return;
    const name = draft.name.trim();
    const digits = draft.phone.replace(/[^\d]/g, "").slice(-10);
    if (name.length < 3 || digits.length !== 10 || !draft.roleId) return;
    const existing = staff.find((s) => s.id === draft.id);
    const next: StaffMember = {
      id: draft.id || `u-${Date.now()}`,
      name,
      phone: digits,
      email: draft.email.trim().toLowerCase(),
      roleId: draft.roleId,
      status: draft.status,
      joinedAt: existing?.joinedAt ?? new Date().toISOString(),
      lastActiveAt: existing?.lastActiveAt,
      invitedBy: existing?.invitedBy ?? me.name,
    };
    saveStaff(next);
    setDraft(null);
  };

  return (
    <>
      <PageHeader
        icon={<UsersRound className="h-5 w-5" />}
        title={lang === "np" ? "प्लेटफर्म कर्मचारी" : "Platform staff"}
        subtitle={
          lang === "np"
            ? "कसले के गर्न सक्छ — भूमिका दिएपछि मात्र पहुँच खुल्छ"
            : "Who works on the console, and the single role each of them holds. Access follows the role, never the person."
        }
        actions={
          <>
            <Badge tone={counts.INVITED > 0 ? "blue" : "ink"} dot>
              {num(counts.INVITED)} invited
            </Badge>
            <Button size="sm" onClick={invite}>
              <UserPlus className="h-4 w-4" /> Invite someone
            </Button>
          </>
        }
      />

      <Reveal className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Working now"
          value={num(counts.ACTIVE)}
          icon={ShieldCheck}
          tone="green"
          hint={`${num(spread.used)} different roles in use`}
        />
        <StatCard
          label="Invitation open"
          value={num(counts.INVITED)}
          icon={Send}
          tone="blue"
          hint="No access until they sign in"
        />
        <StatCard
          label="Access removed"
          value={num(counts.SUSPENDED)}
          icon={ShieldOff}
          tone={counts.SUSPENDED ? "red" : "ink"}
          hint="Record kept for the audit trail"
        />
        <StatCard
          label="Unrestricted access"
          value={num(spread.supers)}
          icon={Lock}
          tone={spread.supers > 2 ? "marigold" : "crimson"}
          hint={`Holds all ${num(ALL_PERMISSIONS.length)} permissions`}
        />
      </Reveal>

      {spread.supers > 2 && (
        <Reveal delay={0.06} className="mt-4">
          <p className="flex items-start gap-2 rounded-2xl border border-[#F3D7A0] bg-[#FFF3DF] px-4 py-3 text-sm text-[#8a5a00]">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            {num(spread.supers)} people can do absolutely anything on the platform. Give most of the
            team a narrower role instead — it keeps mistakes small and the audit log readable.
          </p>
        </Reveal>
      )}

      <div className="mb-4 mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterPills<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "ALL", label: "Everyone", count: counts.ALL },
            { value: "ACTIVE", label: "Working", count: counts.ACTIVE },
            { value: "INVITED", label: "Invited", count: counts.INVITED },
            { value: "SUSPENDED", label: "Suspended", count: counts.SUSPENDED },
          ]}
        />
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Name, email, phone or role"
          icon={<Search className="h-4 w-4" />}
          className="w-full sm:w-80"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<UsersRound className="h-6 w-6" />}
          title="Nobody in this view"
          description="Try another status, or invite the person you have in mind."
          action={
            <Button size="sm" onClick={invite}>
              <UserPlus className="h-4 w-4" /> Invite someone
            </Button>
          }
        />
      ) : (
        <Reveal>
          <TableWrap>
            <thead>
              <tr>
                <Th>Person</Th>
                <Th>Contact</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Activity</Th>
                <Th className="text-right">Access</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const role = roleOf(s.roleId);
                const isMe = s.id === me.id;
                const perms = role?.superAdmin
                  ? ALL_PERMISSIONS.length
                  : (role?.permissions.length ?? 0);
                return (
                  <tr key={s.id} className="transition hover:bg-ink-50">
                    <Td>
                      <span className="flex items-center gap-2.5">
                        <Avatar name={s.name} tone={(role?.color as Tone) ?? "ink"} size={34} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate font-semibold text-ink-900">{s.name}</span>
                            {isMe && (
                              <span className="rounded-full bg-ink-900 px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-white">
                                you
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-ink-400">
                            {s.invitedBy ? `Invited by ${s.invitedBy}` : "Founding account"}
                          </span>
                        </span>
                      </span>
                    </Td>
                    <Td>
                      <span className="flex items-center gap-1.5 text-sm text-ink-700">
                        <PhoneIcon className="h-3.5 w-3.5 text-ink-400" /> {fmtPhone(s.phone)}
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-400">
                        <Mail className="h-3 w-3" /> {s.email || "no email on file"}
                      </span>
                    </Td>
                    <Td>
                      {role ? (
                        <>
                          <span className="flex items-center gap-2 font-semibold text-ink-900">
                            <span
                              className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[role.color] ?? DOT.ink}`}
                              aria-hidden
                            />
                            {role.name}
                          </span>
                          <span className="block text-xs text-ink-400">
                            {role.superAdmin ? "every permission" : `${num(perms)} permissions`}
                          </span>
                        </>
                      ) : (
                        <span className="text-sm font-semibold text-[#c02636]">
                          Role was deleted — no access
                        </span>
                      )}
                    </Td>
                    <Td>
                      <StatusBadge value={s.status} />
                    </Td>
                    <Td>
                      <span className="flex items-center gap-1.5 whitespace-nowrap text-sm text-ink-700">
                        <Clock className="h-3.5 w-3.5 text-ink-400" />
                        {s.lastActiveAt ? ago(s.lastActiveAt, NOW) : "never signed in"}
                      </span>
                      <span className="block text-xs text-ink-400">
                        Joined {fullDate(s.joinedAt)}
                      </span>
                    </Td>
                    <Td className="text-right">
                      <span className="inline-flex flex-wrap justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setDraft({
                              id: s.id,
                              name: s.name,
                              phone: s.phone,
                              email: s.email,
                              roleId: s.roleId,
                              status: s.status,
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" /> Edit
                        </Button>
                        {s.status === "SUSPENDED" ? (
                          <Button size="sm" onClick={() => setPending({ person: s, to: "ACTIVE" })}>
                            <ShieldCheck className="h-4 w-4" /> Restore
                          </Button>
                        ) : (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={isMe}
                            onClick={() => setPending({ person: s, to: "SUSPENDED" })}
                          >
                            <ShieldOff className="h-4 w-4" /> Suspend
                          </Button>
                        )}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Reveal>
      )}

      <Drawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? `Edit ${draft.name || "person"}` : "Invite someone to the console"}
        subtitle="One person, one role. Change the role to change everything they can reach."
        width={560}
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-ink-500">
              {draft?.id
                ? "Changes apply on their next request."
                : "They sign in with the phone number, by one-time code."}
            </span>
            <span className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={commit}>
                {draft?.id ? "Save person" : "Send invitation"}
              </Button>
            </span>
          </div>
        }
      >
        {draft && (
          <div className="space-y-4">
            <Field label="Full name" required>
              <input
                className={inputCls}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Asmita Joshi"
                maxLength={60}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Mobile number" hint="Ten digits, used to sign in" required>
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={draft.phone}
                  onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  placeholder="9800000000"
                  maxLength={14}
                />
              </Field>
              <Field label="Work email" hint="For notifications only">
                <input
                  className={inputCls}
                  type="email"
                  value={draft.email}
                  onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  placeholder="name@gopasal.com"
                />
              </Field>
            </div>

            <Field label="Role" hint="Everything they can do comes from this one choice" required>
              <div className="space-y-2">
                {roles.map((r) => {
                  const on = draft.roleId === r.id;
                  const perms = r.superAdmin ? ALL_PERMISSIONS.length : r.permissions.length;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDraft({ ...draft, roleId: r.id })}
                      className={
                        on
                          ? "flex w-full items-start gap-3 rounded-xl border border-crimson-300 bg-crimson-50 px-3.5 py-3 text-left"
                          : "flex w-full items-start gap-3 rounded-xl border border-ink-200 px-3.5 py-3 text-left transition hover:border-ink-300"
                      }
                    >
                      <span
                        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[r.color] ?? DOT.ink}`}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-ink-900">{r.name}</span>
                          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[0.68rem] font-bold text-ink-600">
                            {r.superAdmin ? "everything" : `${num(perms)} permissions`}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-xs text-ink-500">{r.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Status">
              <select
                className={inputCls}
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as StaffStatus })}
              >
                <option value="INVITED">Invited — waiting for first sign-in</option>
                <option value="ACTIVE">Working</option>
                <option value="SUSPENDED">Suspended — no access</option>
              </select>
            </Field>

            <p className="flex items-start gap-2 rounded-xl bg-ink-50 px-3.5 py-3 text-xs text-ink-600">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
              Platform staff never see a customer’s full payment details, and every action they take
              is recorded against their name.
            </p>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={pending !== null}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) saveStaff({ ...pending.person, status: pending.to });
          setPending(null);
        }}
        title={
          pending?.to === "SUSPENDED"
            ? `Suspend ${pending?.person.name}?`
            : `Restore access for ${pending?.person.name}?`
        }
        description={
          pending?.to === "SUSPENDED"
            ? "They are signed out everywhere and lose the console immediately. Their record and their history stay exactly as they are."
            : "They get their role back and can sign in again with a one-time code."
        }
        confirmLabel={pending?.to === "SUSPENDED" ? "Suspend access" : "Restore access"}
        destructive={pending?.to === "SUSPENDED"}
        reasonLabel="Reason for the audit log"
        reasonRequired
      />


      <p className="mt-6 text-xs text-ink-400">
        You cannot suspend your own account, and suspending someone never deletes what they did —
        their name stays on every decision in the audit log.
      </p>
    </>
  );
}



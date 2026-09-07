"use client";

import * as React from "react";
import {
  ScrollText,
  Search,
  BadgeCheck,
  History,
  Users,
  Store,
  UsersRound,
  Upload,
  FileText,
} from "lucide-react";
import {
  PageHeader,
  Card,
  SectionTitle,
  Badge,
  Button,
  FilterPills,
  SearchInput,
  EmptyState,
  KeyValue,
} from "@/components/primitives";
import { PermissionGate, Can } from "@/components/PermissionGate";
import { ConfirmDialog } from "@/components/Drawer";
import { Reveal } from "@/components/Reveal";
import { useAdmin, useLang } from "@/components/providers";
import { NOW } from "@/lib/data";
import { num, ago, fullDate } from "@/lib/format";

type Filter = "ALL" | "customer" | "seller" | "both";

const AUDIENCE = {
  customer: { label: "Shoppers", icon: Users, tone: "blue" as const },
  seller: { label: "Shopkeepers", icon: Store, tone: "marigold" as const },
  both: { label: "Everyone", icon: UsersRound, tone: "crimson" as const },
};

export default function PoliciesPage() {
  return (
    <PermissionGate
      perm="policy.view"
      title="You can’t see platform policies"
      description="Reading policy versions needs the “View policies” permission."
    >
      <PoliciesInner />
    </PermissionGate>
  );
}

function PoliciesInner() {
  const { lang } = useLang();
  const { policies, publishPolicy } = useAdmin();
  const [filter, setFilter] = React.useState<Filter>("ALL");
  const [q, setQ] = React.useState("");
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<{ key: string; version: number } | null>(null);

  const counts = React.useMemo(
    () => ({
      ALL: policies.length,
      customer: policies.filter((p) => p.audience === "customer").length,
      seller: policies.filter((p) => p.audience === "seller").length,
      both: policies.filter((p) => p.audience === "both").length,
    }),
    [policies],
  );

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    return policies
      .filter((p) => (filter === "ALL" ? true : p.audience === filter))
      .filter((p) => {
        if (!needle) return true;
        return (
          p.label.toLowerCase().includes(needle) ||
          p.key.includes(needle) ||
          p.summary.toLowerCase().includes(needle)
        );
      });
  }, [policies, filter, q]);

  const open = rows.find((p) => p.key === selectedKey) ?? rows[0] ?? null;

  React.useEffect(() => {
    if (open && open.key !== selectedKey) setSelectedKey(open.key);
  }, [open, selectedKey]);

  const live = open?.versions.find((v) => v.isPublished) ?? null;
  const draft = open?.versions.find((v) => !v.isPublished && v.version > (live?.version ?? 0)) ?? null;
  const target = pending ? policies.find((p) => p.key === pending.key) : null;
  const targetVersion = target?.versions.find((v) => v.version === pending?.version);

  /* Documents whose newest version is not the one customers see. */
  const unpublished = React.useMemo(
    () =>
      policies.filter((p) => {
        const newest = p.versions[0];
        return newest ? !newest.isPublished : false;
      }).length,
    [policies],
  );

  return (
    <>
      <PageHeader
        icon={<ScrollText className="h-5 w-5" />}
        title={lang === "np" ? "नीति र सर्तहरू" : "Policies"}
        subtitle={
          lang === "np"
            ? "हरेक नीतिको संस्करण राखिन्छ — प्रकाशित संस्करण मात्र ग्राहकले देख्छन्"
            : "Every policy is versioned. Only a published version is shown to people, and the old one is never lost."
        }
        actions={
          unpublished > 0 ? (
            <Badge tone="marigold" dot>
              {num(unpublished)} draft{unpublished === 1 ? "" : "s"} not published
            </Badge>
          ) : (
            <Badge tone="green" dot>
              Everything published
            </Badge>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterPills<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "ALL", label: "All", count: counts.ALL },
            { value: "both", label: "Everyone", count: counts.both },
            { value: "customer", label: "Shoppers", count: counts.customer },
            { value: "seller", label: "Shopkeepers", count: counts.seller },
          ]}
        />
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Policy name or wording"
          icon={<Search className="h-4 w-4" />}
          className="w-full sm:w-72"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No policy matches this view"
          description="Try a different audience, or search the policy wording."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Reveal>
            <Card className="pb-3">
              <SectionTitle title="Documents" hint="Grouped by who they bind" />
              <ul className="mt-3 divide-y divide-ink-100">
                {rows.map((p) => {
                  const active = open?.key === p.key;
                  const aud = AUDIENCE[p.audience];
                  const AudIcon = aud.icon;
                  const newest = p.versions[0];
                  return (
                    <li key={p.key}>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(p.key)}
                        aria-current={active}
                        className={
                          active
                            ? "w-full border-l-[3px] border-crimson-500 bg-crimson-50/60 px-4 py-3.5 text-left"
                            : "w-full border-l-[3px] border-transparent px-4 py-3.5 text-left transition hover:bg-ink-50"
                        }
                      >
                        <span className="flex items-center gap-2">
                          <AudIcon className="h-4 w-4 shrink-0 text-ink-400" />
                          <span className="truncate text-sm font-semibold text-ink-900">
                            {lang === "np" ? p.labelNp : p.label}
                          </span>
                        </span>
                        <span className="mt-1 flex items-center gap-2 text-xs text-ink-500">
                          <span className="font-mono">{p.key}</span>
                          {newest && !newest.isPublished && (
                            <span className="rounded-full bg-[#FFF3DF] px-2 py-0.5 text-[0.68rem] font-bold text-[#8a5a00]">
                              v{newest.version} draft
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </Reveal>

          {open && (
            <Reveal delay={0.06}>
              <Card className="pb-5">
                <SectionTitle
                  title={lang === "np" ? open.labelNp : open.label}
                  hint={open.summary}
                  action={
                    <Badge tone={AUDIENCE[open.audience].tone} dot>
                      {AUDIENCE[open.audience].label}
                    </Badge>
                  }
                />

                <div className="px-5 pt-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-[#BFE5D2] bg-[#EAF7EF] px-3.5 py-3">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[#0B7E58]">
                        <BadgeCheck className="h-3.5 w-3.5" /> Live version
                      </p>
                      {live ? (
                        <>
                          <p className="mt-1 text-lg font-bold text-ink-900">v{live.version}</p>
                          <p className="text-xs text-ink-600">
                            Effective {live.effectiveAt ? fullDate(live.effectiveAt) : "immediately"}{" "}
                            · {live.author}
                          </p>
                        </>
                      ) : (
                        <p className="mt-1 text-sm text-ink-700">
                          Nothing published yet — people see no policy for this key.
                        </p>
                      )}
                    </div>
                    <div className="rounded-xl bg-ink-50 px-3.5 py-3">
                      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
                        <History className="h-3.5 w-3.5" /> History
                      </p>
                      <p className="mt-1 text-lg font-bold text-ink-900">
                        {num(open.versions.length)} version
                        {open.versions.length === 1 ? "" : "s"}
                      </p>
                      <p className="text-xs text-ink-500">
                        {draft ? `v${draft.version} is waiting to be published` : "No pending draft"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 divide-y divide-ink-100">
                    <KeyValue label="Policy key">
                      <span className="font-mono text-xs">{open.key}</span>
                    </KeyValue>
                    <KeyValue label="Applies to">{AUDIENCE[open.audience].label}</KeyValue>
                    <KeyValue label="Public URL">
                      <span className="font-mono text-xs">gopasal.com/{open.key}</span>
                    </KeyValue>
                  </div>

                  <p className="mt-6 text-sm font-bold text-ink-900">Published wording</p>
                  <div className="mt-2 rounded-xl border border-ink-100 bg-white px-4 py-4">
                    <p className="whitespace-pre-line text-sm leading-relaxed text-ink-700">
                      {open.content}
                    </p>
                  </div>

                  <p className="mt-6 flex items-center gap-2 text-sm font-bold text-ink-900">
                    <History className="h-4 w-4 text-ink-400" /> Version history
                  </p>
                  <ol className="mt-3 space-y-2.5">
                    {open.versions.map((v) => (
                      <li
                        key={v.version}
                        className={
                          v.isPublished
                            ? "rounded-xl border border-[#BFE5D2] bg-[#EAF7EF]/60 px-3.5 py-3"
                            : "rounded-xl border border-ink-100 px-3.5 py-3"
                        }
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg bg-ink-900 px-2 text-xs font-bold text-white">
                            v{v.version}
                          </span>
                          <span className="text-sm font-semibold text-ink-900">{v.title}</span>
                          {v.isPublished ? (
                            <Badge tone="green" dot>
                              Live
                            </Badge>
                          ) : (
                            <Badge tone="ink" dot={false}>
                              Draft
                            </Badge>
                          )}
                          <span className="ml-auto text-xs text-ink-400">
                            {ago(v.createdAt, NOW)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-ink-700">{v.changeNote}</p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs text-ink-500">
                            Written by {v.author} on {fullDate(v.createdAt)}
                            {v.effectiveAt ? ` · effective ${fullDate(v.effectiveAt)}` : ""}
                          </p>
                          {!v.isPublished && (
                            <Can perm="policy.publish">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPending({ key: open.key, version: v.version })}
                              >
                                <Upload className="h-4 w-4" /> Publish v{v.version}
                              </Button>
                            </Can>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>

                </div>
              </Card>
            </Reveal>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pending !== null}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) publishPolicy(pending.key, pending.version);
          setPending(null);
        }}
        title={`Publish v${pending?.version ?? ""} of ${target?.label ?? "this policy"}?`}
        description={`${
          targetVersion ? `“${targetVersion.changeNote}” — ` : ""
        }This becomes the wording everyone sees, and people are asked to accept it again on their next visit. The version now live is kept in history.`}
        confirmLabel="Publish version"
        reasonLabel="Why this version goes out now"
        reasonRequired
      />

      <p className="mt-6 text-xs text-ink-400">
        Acceptance is recorded per person, per version. Publishing never rewrites what someone
        already agreed to.
      </p>
    </>
  );
}


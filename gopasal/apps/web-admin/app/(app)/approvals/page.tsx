"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ClipboardCheck,
  Search,
  Inbox,
  ChevronLeft,
  ChevronRight,
  UserCheck,
} from "lucide-react";
import {
  PageHeader,
  Card,
  Badge,
  Button,
  EmptyState,
  Avatar,
  FilterPills,
  SearchInput,
} from "@/components/primitives";
import { StatusBadge } from "@/components/StatusBadge";
import { PermissionGate } from "@/components/PermissionGate";
import { Reveal } from "@/components/Reveal";
import { LoadingPanel, SkeletonRows, ErrorPanel } from "@/components/states";
import { useAuth } from "@/components/auth-provider";
import { useLang } from "@/components/providers";
import { ApiError } from "@gopasal/api-client";
import { fetchApplication, fetchQueue } from "@/lib/api/onboarding-review";
import type { Paginated, QueueFilter, QueueRow, ReviewApplication } from "@/lib/api/types";
import { ApplicationDetail } from "@/components/approvals/ApplicationDetail";
import { num, ago } from "@/lib/format";

/**
 * Seller onboarding review, on the real API.
 *
 * The whole screen is two reads and one selection: `GET
 * /admin/onboarding/applications` for the queue and `GET …/:id` for whichever row
 * is open. There is no local copy of an application beyond what the server last
 * said, and no fixture fallback — a reviewer who thinks they approved a shop that
 * never left the browser is worse off than one who is told the call failed.
 *
 * The gate is `shops.view`, not `shops.approve`, because reading the queue and
 * deciding on it are separate permissions server-side and a viewer arriving from
 * the dashboard should be able to look. Every button inside is wrapped in its own
 * `Can`, so the console offers exactly what the API would accept.
 *
 * `?id=<applicationId>` is the source of truth for the selection, which makes a
 * row linkable from the dashboard and from a notification.
 */

export default function ApprovalsPage() {
  return (
    <PermissionGate
      perm="shops.view"
      title="You can’t see shop applications"
      description="The review queue needs the “View shops” permission. Ask a Super Admin to grant it."
    >
      <React.Suspense fallback={<LoadingPanel label="Opening the review queue…" />}>
        <ApprovalsInner />
      </React.Suspense>
    </PermissionGate>
  );
}

const FILTERS: { value: QueueFilter; label: string }[] = [
  { value: "OPEN", label: "Waiting" },
  { value: "SUBMITTED", label: "Not picked up" },
  { value: "UNDER_REVIEW", label: "Being reviewed" },
  { value: "CHANGES_REQUESTED", label: "With the applicant" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "ALL", label: "Everything" },
];

const PAGE_SIZE = 20;

function ApprovalsInner() {
  const { lang } = useLang();
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();

  const selectedId = params.get("id");

  const [filter, setFilter] = React.useState<QueueFilter>("OPEN");
  const [mine, setMine] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [reloadToken, setReloadToken] = React.useState(0);

  const [queue, setQueue] = React.useState<Paginated<QueueRow> | null>(null);
  const [queueState, setQueueState] = React.useState<"loading" | "ready" | "error">("loading");
  const [queueError, setQueueError] = React.useState<ApiError | null>(null);

  const [detail, setDetail] = React.useState<ReviewApplication | null>(null);
  const [detailState, setDetailState] = React.useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [detailError, setDetailError] = React.useState<string | null>(null);

  /* Typing should not fire a request per keystroke. */
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  const reviewerId = mine ? user?.id : undefined;

  React.useEffect(() => {
    const controller = new AbortController();
    setQueueState("loading");
    fetchQueue(
      {
        page,
        limit: PAGE_SIZE,
        status: filter,
        ...(q ? { q } : {}),
        ...(reviewerId ? { reviewerId } : {}),
      },
      controller.signal,
    )
      .then((result) => {
        setQueue(result);
        setQueueError(null);
        setQueueState("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setQueue(null);
        setQueueError(
          err instanceof ApiError
            ? err
            : new ApiError({ status: 0, message: "Could not load the review queue." }),
        );
        setQueueState("error");
      });
    return () => controller.abort();
  }, [filter, q, page, reviewerId, reloadToken]);

  const select = React.useCallback(
    (id: string) => {
      router.replace(`/approvals?id=${encodeURIComponent(id)}`, { scroll: false });
    },
    [router],
  );

  /* Nothing chosen yet: open the one that has waited longest. */
  const firstId = queue?.data[0]?.id ?? null;
  React.useEffect(() => {
    if (!selectedId && firstId) select(firstId);
  }, [selectedId, firstId, select]);

  React.useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailState("idle");
      return;
    }
    const controller = new AbortController();
    setDetailState("loading");
    fetchApplication(selectedId, controller.signal)
      .then((result) => {
        setDetail(result);
        setDetailError(null);
        setDetailState("ready");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setDetail(null);
        setDetailError(
          err instanceof ApiError ? err.message : "Could not open that application.",
        );
        setDetailState("error");
      });
    return () => controller.abort();
  }, [selectedId, reloadToken]);

  /**
   * A mutation returns the whole application, so the detail is replaced rather
   * than patched. The queue only needs re-reading when the row itself moved —
   * a status change or a new holder — which is why this compares before doing it.
   */
  const onChanged = React.useCallback(
    (next: ReviewApplication) => {
      setDetail((prev) => {
        const moved =
          prev === null ||
          prev.status !== next.status ||
          prev.internal.reviewer?.id !== next.internal.reviewer?.id;
        if (moved) setReloadToken((t) => t + 1);
        return next;
      });
      setDetailState("ready");
      setDetailError(null);
    },
    [],
  );

  const total = queue?.meta.total ?? null;
  const pages = queue?.meta.pages ?? 1;
  const rows = queue?.data ?? [];

  return (
    <>
      <PageHeader
        icon={<ClipboardCheck className="h-5 w-5" />}
        title={lang === "np" ? "पसल स्वीकृति" : "Shop applications"}
        subtitle={
          lang === "np"
            ? "कागजात र डेलिभरी क्षेत्र जाँच गरेपछि मात्र स्वीकृत गर्नुहोस्"
            : "Check the papers and the coverage area before a shop is created"
        }
        actions={
          total === null ? (
            <Badge tone="ink">Queue unavailable</Badge>
          ) : (
            <Badge tone={total > 0 ? "marigold" : "green"} dot>
              {total > 0 ? `${num(total)} in this view` : "Nothing here"}
            </Badge>
          )
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Reveal>
            <Card className="p-4">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Shop name, reference or phone…"
                icon={<Search className="h-4 w-4" />}
              />
              <FilterPills
                className="mt-3"
                options={FILTERS}
                value={filter}
                onChange={(value) => {
                  setFilter(value);
                  setPage(1);
                }}
              />
              <button
                type="button"
                aria-pressed={mine}
                data-active={mine}
                disabled={!user}
                className="gp-pill mt-3"
                onClick={() => {
                  setMine((m) => !m);
                  setPage(1);
                }}
              >
                <UserCheck className="h-3.5 w-3.5" />
                Only the ones I picked up
              </button>
            </Card>
          </Reveal>

          {queueState === "error" && queueError ? (
            <ErrorPanel
              title="The review queue didn’t load"
              message={queueError.message}
              offline={queueError.offline}
              onRetry={() => setReloadToken((t) => t + 1)}
            />
          ) : queue === null ? (
            <SkeletonRows rows={5} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-6 w-6" />}
              title={q ? "Nothing matches that" : "No applications in this view"}
              description={
                q
                  ? "Try a shorter search — the reference, part of the shop name, or the phone number."
                  : "When a seller sends their shop for review it lands here, oldest first."
              }
            />
          ) : (
            <ul
              aria-busy={queueState === "loading"}
              className={`space-y-2.5 ${queueState === "loading" ? "opacity-60" : ""}`}
            >
              {rows.map((row) => (
                <QueueCard
                  key={row.id}
                  row={row}
                  active={row.id === selectedId}
                  onOpen={() => select(row.id)}
                />
              ))}
            </ul>
          )}

          {queue !== null && pages > 1 && (
            <div className="flex items-center justify-between gap-2 px-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || queueState === "loading"}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </Button>
              <span className="text-xs text-ink-500">
                Page {queue.meta.page} of {pages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= pages || queueState === "loading"}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div>
          {detailState === "error" && detailError ? (
            <ErrorPanel
              title="That application didn’t open"
              message={detailError}
              onRetry={() => setReloadToken((t) => t + 1)}
            />
          ) : detailState === "loading" ? (
            <LoadingPanel label="Opening the application…" />
          ) : detailState === "ready" && detail ? (
            <ApplicationDetail application={detail} onChanged={onChanged} />
          ) : (
            <EmptyState
              icon={<ClipboardCheck className="h-6 w-6" />}
              title="Pick an application"
              description="Choose a row on the left to read the papers, the coverage area and the owner’s details before deciding."
            />
          )}
        </div>
      </div>
    </>
  );
}

/**
 * One queue row. Everything shown here comes from the list endpoint, which
 * deliberately carries a masked payout account and a masked applicant phone —
 * the full numbers only exist on the detail view a reviewer has opened.
 */
function QueueCard({
  row,
  active,
  onOpen,
}: {
  row: QueueRow;
  active: boolean;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={active ? "true" : undefined}
        className={`w-full rounded-2xl border px-4 py-3.5 text-left transition ${
          active
            ? "border-crimson-300 bg-crimson-50/60 ring-2 ring-crimson-100"
            : "border-ink-100 bg-white hover:border-ink-200 hover:bg-ink-50/60"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink-900">
              {row.shopName ?? "Unnamed shop"}
            </p>
            <p className="mt-0.5 truncate font-mono text-[0.7rem] text-ink-500">{row.reference}</p>
          </div>
          <StatusBadge value={row.status} />
        </div>

        <div className="mt-2.5 flex items-center gap-2">
          <Avatar name={row.applicant.name ?? "Applicant"} size={26} tone="ink" />
          <p className="min-w-0 flex-1 truncate text-xs text-ink-600">
            {row.applicant.name ?? "No name given"} · {row.applicant.phoneMasked}
          </p>
        </div>

        <p className="mt-2 truncate text-xs text-ink-500">
          {[
            row.area ?? "No area set",
            row.category?.en ?? "No shop type",
            `${row.documentCount} ${row.documentCount === 1 ? "paper" : "papers"}`,
            row.submittedAt ? `sent ${ago(row.submittedAt)}` : "not sent yet",
          ].join(" · ")}
        </p>

        {row.submitCount > 1 && (
          <p className="mt-1 text-[0.7rem] text-ink-400">
            Sent {row.submitCount} times — check what changed.
          </p>
        )}

        {row.reviewer && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 text-[0.7rem] font-semibold text-ink-600 ring-1 ring-ink-100">
            <UserCheck className="h-3 w-3" />
            {row.reviewer.name ?? "A reviewer"} has it
          </p>
        )}
      </button>
    </li>
  );
}

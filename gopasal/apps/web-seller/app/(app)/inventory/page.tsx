"use client";

import * as React from "react";
import {
  Boxes,
  Search,
  Minus,
  Plus,
  PackageX,
  Store,
  RefreshCw,
  CircleSlash,
  Layers,
  Package,
} from "lucide-react";
import { ApiError, SEARCH_MAX_LENGTH } from "@gopasal/api-client";
import { useAuth } from "@/components/auth-provider";
import { useShops } from "@/components/shop-provider";
import { ShopScopeState, scopeShopIds, useShopScope } from "@/components/ShopScope";
import { PageHeader, Card, Button, Badge, EmptyState } from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { Reveal } from "@/components/Reveal";
import { PermissionGate } from "@/components/PermissionGate";
import { ErrorPanel, InlineError, InlineNotice, SkeletonRows, Spinner } from "@/components/states";
import { num, rs } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useDebounced } from "@/lib/use-debounced";
import { asApiError } from "@/lib/api/client";
import {
  adjustProductStock,
  fetchCategories,
  listAllShopProducts,
  updateProduct,
} from "@/lib/api/products";
import {
  EMPTY_CATALOG_SUMMARY,
  mergeCatalogSummaries,
  type CatalogSummaryWire,
  type ProductQuery,
  type ProductWire,
} from "@/lib/api/products";
import type { Category } from "@/lib/api/types";
import { categoryIndex, toSellerProducts, type SellerProduct } from "@/lib/catalog-view";

/**
 * Stock, as the API actually models it.
 *
 * The only endpoint that changes a count is
 * `POST /seller/shops/:shopId/products/:productId/stock`, and three facts about
 * it decide everything on this screen:
 *
 * - It takes a **signed delta**, not a total. There is no way to say "the count
 *   is 40"; only "add 12" or "take 3 away". So the controls below are a stepper
 *   over a delta, and the number beside them is text the seller cannot type into.
 * - It is **product level**. Variants have their own `stock` column, but the only
 *   route that writes it is `PATCH …/variants/:variantId`, which sets an absolute
 *   value and needs `catalog.edit`. Variant counts are therefore shown here and
 *   edited on the Products screen, where that permission is already in play.
 * - It **rejects a product with `trackStock: false`** with a 400. Rather than let
 *   a seller press plus and read an error, those products say so and — for
 *   someone holding `catalog.edit` — offer to turn tracking on first.
 *
 * The search box and the three lenses are **the API's filters**, not the browser's:
 * `GET …/products` takes `q` and `stock`, and returns a shop-wide `summary` that the
 * stat cards read. That distinction is the whole point of the change — the counts
 * describe the shop while the list describes the filter, so "Out of stock: 4" stays
 * true while a seller searches for one product.
 *
 * There is no low-stock tier. `Product` has `stock` and `trackStock` and no
 * threshold, so any "low" line would be ours, presented as the shop's. There is
 * also no stock value: a product's own price and its variants' prices are
 * separate columns, and which one a customer pays is not knowable here, so
 * multiplying either by a count would invent a number.
 */

export default function InventoryPage() {
  return (
    <PermissionGate perm="inventory.view">
      <InventoryInner />
    </PermissionGate>
  );
}

/**
 * What the two honest stock facts allow as a filter.
 *
 * These are the API's `stock` values, minus its `in`: "some left" is the ordinary
 * case and the "All" tab already shows it alongside everything else, so offering it
 * as a fourth tab would add a click without adding a question anyone asks.
 */
type Lens = "all" | "out" | "untracked";

/**
 * Both grants this screen needs, per shop.
 *
 * `GET …/products` carries `inventory.view`'s sibling permission, `catalog.view`,
 * on the API — but this screen is reached with `inventory.view`, and a seller can
 * hold one without the other. Asking only for shops where both are held makes a
 * single missing grant an absent row rather than a page-wide 403.
 */
const STOCK_PERMS = ["inventory.view", "catalog.view"] as const;

function InventoryInner() {
  const { canInShop } = useAuth();
  const { activeShopId, activeShop, shopById } = useShops();

  const [rows, setRows] = React.useState<ProductWire[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [summary, setSummary] = React.useState<CatalogSummaryWire>(EMPTY_CATALOG_SUMMARY);
  const [truncated, setTruncated] = React.useState(false);
  /** How many rows match the current filters across every readable shop, per the server. */
  const [matched, setMatched] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [acting, setActing] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [lens, setLens] = React.useState<Lens>("all");

  const debouncedQ = useDebounced(q.trim());

  /**
   * Which shops this screen may read, or why none of them may be.
   *
   * {@link useShopScope} separates the four answers that a bare
   * `readableShopIds.length === 0` used to collapse into one: the shop list is
   * still loading, it *failed* to load, the account holds no shop at all, or shops
   * exist and none grants both {@link STOCK_PERMS}. Only the last is a permission
   * problem, and only it should say so.
   */
  const scope = useShopScope(STOCK_PERMS);
  const readableShopIds = scopeShopIds(scope);
  const idsKey = readableShopIds.join(",");

  /*
    `sort: "name"` rather than the server default: this list is looked *up* rather
    than worked down, and when a very large catalogue truncates, an alphabetical
    prefix is a predictable place to be cut off. The local sort below then merges the
    per-shop reads, which arrive individually sorted.
  */
  const queryKey = JSON.stringify({
    q: debouncedQ || undefined,
    stock: lens === "all" ? undefined : lens,
    sort: "name",
  });

  const load = React.useCallback(
    async (signal?: AbortSignal) => {
      const ids = idsKey ? idsKey.split(",") : [];
      const query = JSON.parse(queryKey) as ProductQuery;
      if (ids.length === 0) {
        setRows([]);
        setSummary(EMPTY_CATALOG_SUMMARY);
        setMatched(0);
        setTruncated(false);
        setLoading(false);
        setError(null);
        return;
      }
      setLoading(true);
      try {
        const pages = await Promise.all(ids.map((id) => listAllShopProducts(id, query, signal)));
        if (signal?.aborted) return;
        setRows(pages.flatMap((p) => p.products).sort((a, b) => a.name.localeCompare(b.name)));
        setMatched(pages.reduce((a, p) => a + p.matched, 0));
        setSummary(mergeCatalogSummaries(pages.map((p) => p.summary)));
        setTruncated(pages.some((p) => p.truncated));
        setError(null);
      } catch (err) {
        if (signal?.aborted) return;
        setError(asApiError(err));
        setRows([]);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [idsKey, queryKey],
  );

  React.useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // A missing category list costs a label, not the screen, so it is dropped quietly.
  React.useEffect(() => {
    const ctrl = new AbortController();
    fetchCategories(ctrl.signal)
      .then(setCategories)
      .catch(() => setCategories([]));
    return () => ctrl.abort();
  }, []);

  const catIndex = React.useMemo(() => categoryIndex(categories), [categories]);
  const products = React.useMemo(() => toSellerProducts(rows, catIndex), [rows, catIndex]);

  /**
   * Both writes here answer with a bare product row — no `variants` — so merging
   * one in would blank variant counts already on screen. Re-read instead.
   */
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
      }
    },
    [load],
  );

  /*
    Every count is the server's, over the whole shop. `tracked` is a subtraction of
    two shop-wide counts rather than a tally of the rows on screen, so it cannot
    disagree with them the way a locally-counted figure would once the list is
    filtered.
  */
  const tracked = summary.total - summary.untracked;

  /**
   * Whether that roll-up is a fact yet.
   *
   * `summary` starts as `EMPTY_CATALOG_SUMMARY` — all zeros — so drawing the four
   * cards before the first answer arrives, or after one failed, states that this
   * shop has no products and nothing out of stock. It is a silence rather than a
   * zero, and it is drawn as one.
   */
  const summaryKnown = scope.kind === "ready" && !error && !(loading && rows.length === 0);
  const stat = (value: number) => (summaryKnown ? num(value) : "—");

  /** True when the list is narrowed — which is what makes "nothing matches" the right words. */
  const filtering = debouncedQ !== "" || lens !== "all";
  const canAdjustAnywhere = readableShopIds.some((id) => canInShop(id, "inventory.adjust"));

  return (
    <div>
      <PageHeader
        icon={<Boxes className="h-5 w-5" />}
        title="Inventory"
        subtitle={
          activeShop
            ? [activeShop.name, activeShop.area].filter(Boolean).join(" · ")
            : `Stock across ${readableShopIds.length} shop${readableShopIds.length === 1 ? "" : "s"}`
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Refresh
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Reveal delay={0}>
          <StatCard label="Products" value={stat(summary.total)} icon={Package} tone="crimson" />
        </Reveal>
        <Reveal delay={1}>
          <StatCard label="Tracking stock" value={stat(tracked)} icon={Boxes} tone="green" />
        </Reveal>
        <Reveal delay={2}>
          <StatCard
            label="Out of stock"
            value={stat(summary.outOfStock)}
            icon={PackageX}
            tone="red"
          />
        </Reveal>
        <Reveal delay={3}>
          <StatCard
            label="Not tracking"
            value={stat(summary.untracked)}
            icon={CircleSlash}
            tone="ink"
            hint={summaryKnown ? "Counts aren’t kept for these" : undefined}
          />
        </Reveal>
      </div>

      {/*
        The lens and the search reached the server, so `matched` is the size of the
        matching set. What is disclosed here is only that some matching rows were not
        fetched — not, as the old copy said, that the filters were applied locally.
      */}
      {truncated && (
        <InlineNotice
          className="mt-4"
          message={`Showing ${num(products.length)} of ${num(matched)} matching products, alphabetically. Search to reach the rest.`}
        />
      )}

      <Reveal delay={2} className="mt-4">
        <Card className="p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, category, variant or SKU"
                aria-label="Search stock"
                /* The server's own ceiling on `?q=`, so a long paste is stopped here
                    instead of coming back as a 400 nobody can act on. */
                maxLength={SEARCH_MAX_LENGTH}
                className="h-10 w-full rounded-xl border border-ink-200 pl-9 pr-9 text-sm outline-none focus:border-crimson-300"
              />
              {loading && rows.length > 0 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400">
                  <Spinner />
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 rounded-xl bg-ink-100 p-1">
              {(
                [
                  ["all", "All"],
                  ["out", "Out of stock"],
                  ["untracked", "Not tracking"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setLens(id)}
                  aria-pressed={lens === id}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    lens === id
                      ? "bg-white text-ink-900 shadow-sm"
                      : "text-ink-500 hover:text-ink-800",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </Card>
      </Reveal>

      {!canAdjustAnywhere && readableShopIds.length > 0 && (
        <p className="mt-4 rounded-xl bg-ink-50 px-4 py-2.5 text-sm text-ink-500">
          You can see stock but not change it. Ask an owner for the “adjust stock” permission.
        </p>
      )}

      {actionError && <InlineError message={actionError} className="mt-4" />}

      <div className="mt-4 space-y-3">
        {loading && rows.length === 0 ? (
          <SkeletonRows rows={4} />
        ) : error ? (
          <ErrorPanel
            title="Couldn’t load your stock"
            message={error.message}
            offline={error.offline}
            onRetry={() => void load()}
          />
        ) : scope.kind !== "ready" ? (
          <ShopScopeState
            scope={scope}
            what="stock"
            permLabel={["view inventory", "view catalog"]}
            icon={<Boxes className="h-6 w-6" />}
          />
        ) : products.length === 0 ? (
          <Card className="p-0">
            <EmptyState
              icon={<Boxes className="h-6 w-6" />}
              title={filtering ? "Nothing matches" : "No products yet"}
              description={
                filtering
                  ? "Nothing in this shop matches the search or the lens. This was checked against the whole catalog, not just the page."
                  : "Stock appears here once there are products to count."
              }
            />
          </Card>
        ) : (
          products.map((p) => (
            <StockRow
              key={p.id}
              product={p}
              showShop={activeShopId === null}
              shopName={shopById(p.shopId)?.name}
              busy={acting === p.id}
              canAdjust={canInShop(p.shopId, "inventory.adjust")}
              canTrack={canInShop(p.shopId, "catalog.edit")}
              onAdjust={(delta) =>
                void runAction(p.id, () => adjustProductStock(p.shopId, p.id, delta))
              }
              onStartTracking={() =>
                void runAction(p.id, () => updateProduct(p.shopId, p.id, { trackStock: true }))
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function StockRow({
  product: p,
  showShop,
  shopName,
  busy,
  canAdjust,
  canTrack,
  onAdjust,
  onStartTracking,
}: {
  product: SellerProduct;
  showShop: boolean;
  shopName?: string;
  busy: boolean;
  canAdjust: boolean;
  canTrack: boolean;
  onAdjust: (delta: number) => void;
  onStartTracking: () => void;
}) {
  /** The size of one press. A delta is all the endpoint accepts, so this is it. */
  const [step, setStep] = React.useState("1");
  const size = Number(step);
  const validStep = Number.isInteger(size) && size > 0 ? size : 0;

  return (
    <Card className="p-0">
      <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink-900">{p.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-400">
            <span>{p.categoryName ?? "Uncategorised"}</span>
            <span>·</span>
            <span>{p.unit}</span>
            {showShop && shopName && (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <Store className="h-3 w-3" /> {shopName}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!p.isActive && <Badge tone="ink">Hidden</Badge>}
          {p.stockState === "out" && (
            <Badge tone="red" dot>
              Out of stock
            </Badge>
          )}
          {p.stockState === "in" && <Badge tone="green">In stock</Badge>}
          {p.stockState === "untracked" && <Badge tone="ink">Not tracking</Badge>}
        </div>
      </div>

      {p.stockState === "untracked" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
          <p className="max-w-xl text-sm text-ink-500">
            This product doesn’t keep a count, so customers can order it whenever the shop is open.
            The stock endpoint refuses a change until tracking is on.
          </p>
          {canTrack ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={onStartTracking}>
              {busy ? <Spinner /> : <Boxes className="h-4 w-4" />} Start tracking
            </Button>
          ) : (
            <p className="text-xs text-ink-400">
              Turning tracking on needs the “edit products” permission.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-2xl font-bold text-ink-900">
              {num(p.stock)} <span className="text-sm font-medium text-ink-400">in stock</span>
            </p>
            <p className="mt-0.5 text-xs text-ink-400">
              Counted for the whole product, not per variant.
            </p>
          </div>

          {canAdjust ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={busy || validStep === 0 || p.stock === 0}
                onClick={() => onAdjust(-validStep)}
                aria-label={`Remove ${validStep || 1} from ${p.name}`}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50 disabled:opacity-40"
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                value={step}
                inputMode="numeric"
                onChange={(e) => setStep(e.target.value.replace(/[^\d]/g, ""))}
                aria-label="Amount to add or remove"
                className="h-10 w-16 rounded-xl border border-ink-200 text-center text-sm font-semibold outline-none focus:border-crimson-300"
              />
              <button
                type="button"
                disabled={busy || validStep === 0}
                onClick={() => onAdjust(validStep)}
                aria-label={`Add ${validStep || 1} to ${p.name}`}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-900 text-white disabled:opacity-40"
              >
                {busy ? <Spinner /> : <Plus className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            <p className="text-xs text-ink-400">View only</p>
          )}
        </div>
      )}

      {p.variants.length > 0 && (
        <div className="border-t border-ink-100 bg-ink-50/60 px-4 py-3">
          <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
            <Layers className="h-3.5 w-3.5" /> Variant counts
          </p>
          <div className="space-y-1.5">
            {p.variants.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium text-ink-800">
                  {v.name}
                  {v.sku && <span className="ml-1.5 text-xs font-normal text-ink-400">{v.sku}</span>}
                </span>
                <span className="text-xs text-ink-400">{rs(v.price)}</span>
                <span
                  className={cn(
                    "w-20 text-right font-semibold",
                    v.stock === 0 ? "text-[#c02636]" : "text-ink-800",
                  )}
                >
                  {num(v.stock)}
                </span>
                {!v.isActive && <Badge tone="ink">Off</Badge>}
              </div>
            ))}
          </div>
          {/*
            No stepper here: the only route that writes a variant count sets an
            absolute value and carries `catalog.edit`, not `inventory.adjust`.
            Sending it from a screen gated on inventory permissions would put the
            wrong grant behind the wrong control.
          */}
          <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
            Variant counts are set on the Products screen — the stock buttons above only move the
            product total, which is all the stock endpoint can change.
          </p>
        </div>
      )}
    </Card>
  );
}

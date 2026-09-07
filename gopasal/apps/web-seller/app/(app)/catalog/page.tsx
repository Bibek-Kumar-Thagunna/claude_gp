"use client";

import * as React from "react";
import Image from "next/image";
import {
  Package,
  Plus,
  Search,
  Pencil,
  Boxes,
  CheckCircle2,
  EyeOff,
  XCircle,
  Store,
  Trash2,
  RefreshCw,
  Check,
  X,
} from "lucide-react";
import { ApiError, SEARCH_MAX_LENGTH } from "@gopasal/api-client";
import { useAuth } from "@/components/auth-provider";
import { useShops } from "@/components/shop-provider";
import { ShopScopeState, scopeShopIds, useShopScope } from "@/components/ShopScope";
import { PageHeader, Card, Button, Badge, EmptyState, Switch } from "@/components/primitives";
import { StatCard } from "@/components/StatCard";
import { Reveal } from "@/components/Reveal";
import { PermissionGate } from "@/components/PermissionGate";
import { ErrorPanel, InlineError, InlineNotice, SkeletonRows, Spinner } from "@/components/states";
import { rs, num } from "@/lib/format";
import { cn } from "@/lib/cn";
import { useDebounced } from "@/lib/use-debounced";
import { asApiError } from "@/lib/api/client";
import { fetchCategories, listAllShopProducts, deleteProduct, updateProduct } from "@/lib/api/products";
import {
  EMPTY_CATALOG_SUMMARY,
  mergeCatalogSummaries,
  type CatalogSummaryWire,
  type ProductQuery,
  type ProductUpdateBody,
  type ProductWire,
} from "@/lib/api/products";
import type { Category } from "@/lib/api/types";
import {
  categoryIndex,
  categoryQuery,
  statusQuery,
  summaryCategories,
  toSellerProducts,
  type SellerProduct,
} from "@/lib/catalog-view";
import { VariantEditor } from "@/components/catalog/VariantEditor";
import { PhotoManager } from "@/components/catalog/PhotoManager";

/**
 * The product list, read from the API.
 *
 * Three properties of `GET /seller/shops/:shopId/products` shape this screen.
 *
 * It **searches, filters and sorts in SQL** — `q`, `categoryId`, `status` and `sort`
 * all go to the server, so the search box is a claim about the shop rather than
 * about the rows the browser happens to hold. It used to be the other way round:
 * `q` was accepted by the API and dropped, and everything below filtered locally,
 * which meant a seller past the first page could search for a product they owned and
 * be told it was not there.
 *
 * It is **per shop**, so the consolidated view fans out over the shops this account
 * may actually read and concatenates. There is no endpoint that pages across shops,
 * so each is read up to a bounded number of pages and the screen says so when it
 * stopped short — now of the *matching* set, since the filters reached the server.
 *
 * And it returns a **shop-wide `summary`** beside every page. The stat cards and the
 * category chips are drawn from that, not from the visible rows: a count that shrank
 * because someone typed in the search box would read as a fact about the shop, and
 * chips derived from the filtered page would vanish as soon as one was clicked.
 *
 * There is no low-stock count here. `Product` carries `stock` and `trackStock`
 * and no threshold, so "low" would be a line we drew and then attributed to the
 * shop. What the data supports — tracked, none left, not tracked — is what it
 * says.
 *
 * Photos are real now, and they arrive with the rows: every product payload carries
 * `images` (server-minted storage keys) and `imageUrls` (the same list resolved), so
 * a card draws its cover photo instead of the letter tile that used to stand in for
 * one, and the open editor carries a {@link PhotoManager}. The tile is still what a
 * product with no photos looks like — it is not a placeholder for a feature on the
 * way.
 */

export default function CatalogPage() {
  return (
    <PermissionGate perm="catalog.view">
      <CatalogInner />
    </PermissionGate>
  );
}

type StatusFilter = "all" | "active" | "hidden";

function CatalogInner() {
  const { canInShop } = useAuth();
  const { activeShopId, activeShop, shopById } = useShops();

  const [rows, setRows] = React.useState<ProductWire[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [summary, setSummary] = React.useState<CatalogSummaryWire>(EMPTY_CATALOG_SUMMARY);
  const [truncated, setTruncated] = React.useState(false);
  /** Rows matching the current filters across every readable shop, per the server. */
  const [matched, setMatched] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [acting, setActing] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);

  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState<string>("all");
  const [status, setStatus] = React.useState<StatusFilter>("all");

  // The input stays instant; only the settled value becomes a request.
  const debouncedQ = useDebounced(q.trim());

  /**
   * Never fire a request we know would 403 — one missing grant would become a
   * page-wide error. {@link useShopScope} also keeps "the shop list failed" and
   * "this account has no shop" from being reported as a missing permission.
   */
  const scope = useShopScope("catalog.view");
  const readableShopIds = scopeShopIds(scope);
  const idsKey = readableShopIds.join(",");

  /*
    The filters are part of the request, so they are part of what `load` depends on.
    Serialising them into one string keeps the effect below firing on a value change
    rather than on a new object identity every render.
  */
  const queryKey = JSON.stringify({
    q: debouncedQ || undefined,
    categoryId: categoryQuery(category),
    status: statusQuery(status),
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
        setRows(
          pages
            .flatMap((p) => p.products)
            .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
        );
        // Both of these describe the shops, not the page: `matched` is how many rows
        // the filters found server-side, `summary` ignores the filters entirely.
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

  /*
    Category names come from the platform-wide public list. A failure here is not
    a failure of the screen: the products still load, they just show their raw
    category id instead of a name, so it is caught and dropped rather than
    surfaced as an error banner over a working catalog.
  */
  React.useEffect(() => {
    const ctrl = new AbortController();
    fetchCategories(ctrl.signal)
      .then((list) => setCategories(list))
      .catch(() => setCategories([]));
    return () => ctrl.abort();
  }, []);

  const catIndex = React.useMemo(() => categoryIndex(categories), [categories]);
  const products = React.useMemo(() => toSellerProducts(rows, catIndex), [rows, catIndex]);

  /**
   * Every write on this screen answers with a bare product row — no variants —
   * so merging it into the loaded list would blank the variants already drawn.
   * Re-read instead.
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

  const chips = React.useMemo(() => summaryCategories(summary, catIndex), [summary, catIndex]);

  /**
   * Whether the roll-up below is a fact yet.
   *
   * `summary` starts as `EMPTY_CATALOG_SUMMARY` — all zeros — so drawing the cards
   * before the first answer, or after a failed one, states that this shop has no
   * products. It is not a zero, it is a silence, and it is drawn as one.
   */
  const summaryKnown = scope.kind === "ready" && !error && !(loading && rows.length === 0);
  const stat = (value: number) => (summaryKnown ? num(value) : "—");

  /** True when the list is narrowed, which is what makes "nothing matches" the right empty state. */
  const filtering = debouncedQ !== "" || category !== "all" || status !== "all";
  const canCreateAnywhere = readableShopIds.some((id) => canInShop(id, "catalog.create"));

  return (
    <div>
      <PageHeader
        icon={<Boxes className="h-5 w-5" />}
        title="Products"
        subtitle={
          activeShop
            ? [activeShop.name, activeShop.area].filter(Boolean).join(" · ")
            : `Catalog across ${readableShopIds.length} shop${readableShopIds.length === 1 ? "" : "s"}`
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Refresh
            </Button>
            {canCreateAnywhere && (
              <Button href="/catalog/new" size="sm">
                <Plus className="h-4 w-4" /> Add product
              </Button>
            )}
          </div>
        }
      />

      {/*
        Every card is counted over the whole shop by the API and is deliberately
        unaffected by the search box and the chips below. A "Products" figure that
        dropped to 3 because someone typed "oil" would read as a fact about the shop.
      */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
        <Reveal delay={0}>
          <StatCard label="Products" value={stat(summary.total)} icon={Package} tone="crimson" />
        </Reveal>
        <Reveal delay={1}>
          <StatCard label="Visible" value={stat(summary.active)} icon={CheckCircle2} tone="green" />
        </Reveal>
        <Reveal delay={2}>
          <StatCard label="Hidden" value={stat(summary.hidden)} icon={EyeOff} tone="ink" />
        </Reveal>
        <Reveal delay={3}>
          {/* Only products that track stock and hold none. A product with
              tracking off is not "out of stock" — nobody ever said. */}
          <StatCard
            label="Out of stock"
            value={stat(summary.outOfStock)}
            icon={XCircle}
            tone="red"
            hint={
              summaryKnown && summary.untracked > 0
                ? `${num(summary.untracked)} not tracking stock`
                : undefined
            }
          />
        </Reveal>
      </div>

      {/*
        The filters reached the server, so `matched` is the size of the matching set
        and `products.length` is how much of it was read. The old copy said the
        filters applied "to these only", which is no longer true — what is still true
        is that some matching rows were not fetched.
      */}
      {truncated && (
        <InlineNotice
          className="mt-4"
          message={`Showing the ${num(products.length)} most recently updated of ${num(matched)} matching products. Narrow the search or a category to see the rest.`}
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
                aria-label="Search products"
                /* The server's own ceiling on `?q=`, so a long paste is stopped here
                    instead of coming back as a 400 nobody can act on. */
                maxLength={SEARCH_MAX_LENGTH}
                className="h-10 w-full rounded-xl border border-ink-200 pl-9 pr-9 text-sm outline-none focus:border-crimson-300"
              />
              {/* The search is a request now, so say when one is in flight. */}
              {loading && rows.length > 0 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400">
                  <Spinner />
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 rounded-xl bg-ink-100 p-1">
              {(["all", "active", "hidden"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  // The category chips below already say which one is on; this strip
                  // conveyed it by background colour alone.
                  aria-pressed={status === s}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                    status === s
                      ? "bg-white text-ink-900 shadow-sm"
                      : "text-ink-500 hover:text-ink-800",
                  )}
                >
                  {s === "active" ? "Visible" : s}
                </button>
              ))}
            </div>
          </div>
          {/*
            Built from the server's shop-wide roll-up, so the row stays put when one
            is clicked. Each count is the shop's, not the filtered page's.
          */}
          {chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {[{ id: "all", label: "All categories", count: summary.total }, ...chips].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  aria-pressed={category === c.id}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                    category === c.id
                      ? "border-crimson-300 bg-crimson-50 text-crimson-700"
                      : "border-ink-200 text-ink-500 hover:border-ink-300",
                  )}
                >
                  {c.label}
                  <span className="ml-1.5 font-normal text-ink-400">{num(c.count)}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </Reveal>

      {actionError && <InlineError message={actionError} className="mt-4" />}

      <div className="mt-4">
        {loading && rows.length === 0 ? (
          <SkeletonRows rows={4} />
        ) : error ? (
          <ErrorPanel
            title="Couldn’t load your products"
            message={error.message}
            offline={error.offline}
            onRetry={() => void load()}
          />
        ) : scope.kind !== "ready" ? (
          <ShopScopeState scope={scope} what="products" permLabel="view catalog" icon={<Package className="h-6 w-6" />} />
        ) : products.length === 0 ? (
          <Card className="p-0">
            <EmptyState
              icon={<Package className="h-6 w-6" />}
              title={filtering ? "Nothing matches" : "No products yet"}
              description={
                filtering
                  ? "Nothing in this shop matches the search, the category chip or the visibility filter. This was checked against the whole catalog, not just the page."
                  : "Add your first product and it goes on sale straight away."
              }
              action={
                !filtering && canCreateAnywhere ? (
                  <Button href="/catalog/new">
                    <Plus className="h-4 w-4" /> Add product
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                categories={categories}
                showShop={activeShopId === null}
                shopName={shopById(p.shopId)?.name}
                busy={acting === p.id}
                canEdit={canInShop(p.shopId, "catalog.edit")}
                canDelete={canInShop(p.shopId, "catalog.delete")}
                open={editing === p.id}
                confirmingDelete={confirmDelete === p.id}
                onToggleOpen={() => {
                  setEditing((cur) => (cur === p.id ? null : p.id));
                  setConfirmDelete(null);
                }}
                onAskDelete={() => setConfirmDelete(p.id)}
                onCancelDelete={() => setConfirmDelete(null)}
                onPatch={(body) => void runAction(p.id, () => updateProduct(p.shopId, p.id, body))}
                onDelete={() =>
                  void runAction(p.id, async () => {
                    await deleteProduct(p.shopId, p.id);
                    setConfirmDelete(null);
                    setEditing(null);
                  })
                }
                onReload={() => void load()}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- One product */

type Draft = {
  name: string;
  nameNp: string;
  categoryId: string;
  price: string;
  mrp: string;
  unit: string;
  description: string;
};

function draftFrom(p: SellerProduct): Draft {
  return {
    name: p.name,
    nameNp: p.nameNp ?? "",
    categoryId: p.categoryId ?? "",
    price: String(p.price),
    mrp: p.mrp === null ? "" : String(p.mrp),
    unit: p.unit,
    description: p.description ?? "",
  };
}

/**
 * Only what changed, and only what `UpdateProductDto` accepts.
 *
 * The API validates with `whitelist: true, forbidNonWhitelisted: true`, so an
 * unknown key is a 400 rather than a field quietly ignored.
 *
 * **Emptying a nullable field clears it, by sending `null`.** An earlier version of
 * this comment claimed the opposite — that no field accepted `null`, so a
 * description or a category could never be unset. That was wrong about this route:
 * `Product.nameNp`, `description`, `categoryId` and `mrp` are nullable columns, and
 * `products.service.ts` deliberately passes `null` through to Prisma for exactly
 * those four while protecting the non-nullable ones. So a cleared field is sent as
 * `null` ("not set"), never as `""` (which would store an empty string — a
 * different claim) and never dropped (which would report a save that did nothing).
 *
 * `name`, `price` and `unit` are the non-nullable ones, and blanking them is not a
 * change: the field is left out and the stored value stands. `price` in particular
 * must be guarded on the *string*, not the number — `Number("")` is `0`, and an
 * unguarded diff turned an emptied Price box into a live product priced at nothing.
 */
function diffOf(p: SellerProduct, d: Draft): ProductUpdateBody {
  const body: ProductUpdateBody = {};
  const name = d.name.trim();
  if (name && name !== p.name) body.name = name;

  const nameNp = d.nameNp.trim();
  if (nameNp !== (p.nameNp ?? "")) body.nameNp = nameNp === "" ? null : nameNp;

  if (d.categoryId !== (p.categoryId ?? "")) {
    body.categoryId = d.categoryId === "" ? null : d.categoryId;
  }

  // `Number("")` is 0 and `Number.isInteger(0)` is true, so the emptiness test has
  // to happen before the numeric one or clearing the box reprices the product.
  const priceText = d.price.trim();
  const price = Number(priceText);
  if (priceText && Number.isInteger(price) && price >= 0 && price !== p.price) {
    body.price = price;
  }

  const mrpText = d.mrp.trim();
  if (mrpText === "") {
    if (p.mrp !== null) body.mrp = null;
  } else {
    const mrp = Number(mrpText);
    if (Number.isInteger(mrp) && mrp >= 0 && mrp !== p.mrp) body.mrp = mrp;
  }

  const unit = d.unit.trim();
  if (unit && unit !== p.unit) body.unit = unit;

  const description = d.description.trim();
  if (description !== (p.description ?? "")) {
    body.description = description === "" ? null : description;
  }

  return body;
}

const SWATCH = ["bg-crimson-500", "bg-[#0B9E6B]", "bg-[#F6A609]", "bg-[#2563EB]", "bg-ink-500"] as const;
function swatch(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  // A const tuple guarantees index 0; the modulo can only land inside it.
  return SWATCH[h % SWATCH.length] ?? SWATCH[0];
}

const STOCK_TEXT: Record<SellerProduct["stockState"], string> = {
  untracked: "Not tracked",
  out: "None left",
  in: "In stock",
};

/**
 * The product's face: its cover photo, or the letter tile when it has none.
 *
 * The tile is not a placeholder for a photo that is on the way — it is what a
 * product with no photos looks like, here and on the storefront. A photo whose key
 * the API could not resolve falls back to the same tile rather than a broken-image
 * marker, because at 3rem the distinction is not actionable; the editor's
 * {@link PhotoManager} is where an unresolved photo is named and can be removed.
 */
function Thumb({ product: p }: { product: SellerProduct }) {
  const cover = p.photos[0];
  if (cover?.url) {
    return (
      <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-ink-100">
        <Image src={cover.url} alt="" fill sizes="3rem" className="object-cover" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold text-white",
        swatch(p.id),
      )}
      aria-hidden
    >
      {p.name.charAt(0).toUpperCase()}
    </span>
  );
}

type ProductCardProps = {
  product: SellerProduct;
  categories: Category[];
  showShop: boolean;
  shopName: string | undefined;
  busy: boolean;
  canEdit: boolean;
  canDelete: boolean;
  open: boolean;
  confirmingDelete: boolean;
  onToggleOpen: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onPatch: (body: ProductUpdateBody) => void;
  onDelete: () => void;
  onReload: () => void;
};

/**
 * One product.
 *
 * Every button is gated with `canInShop(product.shopId, …)` rather than the
 * ambient `can`, because in the consolidated view the ambient check degrades to
 * "may this seller do it *anywhere*" — which would offer Edit on a shop where
 * the grant does not exist, and the API would refuse a button that had already
 * promised.
 */
function ProductCard({
  product: p,
  categories,
  showShop,
  shopName,
  busy,
  canEdit,
  canDelete,
  open,
  confirmingDelete,
  onToggleOpen,
  onAskDelete,
  onCancelDelete,
  onPatch,
  onDelete,
  onReload,
}: ProductCardProps) {
  const [draft, setDraft] = React.useState<Draft>(() => draftFrom(p));
  React.useEffect(() => {
    setDraft(draftFrom(p));
  }, [p]);

  const body = diffOf(p, draft);
  const dirty = Object.keys(body).length > 0;
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <Thumb product={p} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-ink-900">{p.name}</p>
            {!p.isActive && <Badge tone="ink">Hidden</Badge>}
          </div>
          {p.nameNp && <p className="deva truncate text-sm text-ink-500">{p.nameNp}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-400">
            <span>{p.categoryName ?? "Uncategorised"}</span>
            <span aria-hidden>·</span>
            <span>{p.unit}</span>
            {showShop && shopName && (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1 text-ink-500">
                  <Store className="h-3 w-3" /> {shopName}
                </span>
              </>
            )}
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            aria-label={open ? `Close editor for ${p.name}` : `Edit ${p.name}`}
            aria-expanded={open}
            onClick={onToggleOpen}
            className={cn(
              "rounded-lg p-2 transition-colors",
              open ? "bg-ink-900 text-white" : "text-ink-400 hover:bg-ink-100 hover:text-ink-700",
            )}
          >
            {open ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-xl bg-ink-50 px-3 py-2.5 text-center">
        <div>
          <p className="text-sm font-semibold text-ink-900">{rs(p.price)}</p>
          <p className="text-[11px] text-ink-400">
            {p.mrp !== null && p.mrp > p.price ? `MRP ${rs(p.mrp)}` : "Price"}
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink-900">{num(p.variants.length)}</p>
          <p className="text-[11px] text-ink-400">
            {p.variantPriceRange && p.variantPriceRange.min !== p.variantPriceRange.max
              ? `${rs(p.variantPriceRange.min)}–${rs(p.variantPriceRange.max)}`
              : `Variant${p.variants.length === 1 ? "" : "s"}`}
          </p>
        </div>
        <div>
          <p
            className={cn(
              "text-sm font-semibold",
              p.stockState === "out"
                ? "text-[#c02636]"
                : p.stockState === "untracked"
                  ? "text-ink-400"
                  : "text-ink-900",
            )}
          >
            {p.stockState === "untracked" ? "—" : num(p.stock)}
          </p>
          <p className="text-[11px] text-ink-400">{STOCK_TEXT[p.stockState]}</p>
        </div>
      </div>

      {open && canEdit && (
        <div className="space-y-3 rounded-xl border border-ink-100 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <SmallField label="Name">
              <input value={draft.name} onChange={(e) => set({ name: e.target.value })} className={smallInput} />
            </SmallField>
            <SmallField label="Nepali name">
              <input
                value={draft.nameNp}
                onChange={(e) => set({ nameNp: e.target.value })}
                className={cn(smallInput, "deva")}
              />
            </SmallField>
            <SmallField label="Price (Rs)">
              <input
                value={draft.price}
                inputMode="numeric"
                onChange={(e) => set({ price: e.target.value.replace(/[^\d]/g, "") })}
                className={smallInput}
              />
            </SmallField>
            <SmallField label="MRP (Rs)">
              <input
                value={draft.mrp}
                inputMode="numeric"
                onChange={(e) => set({ mrp: e.target.value.replace(/[^\d]/g, "") })}
                className={smallInput}
              />
            </SmallField>
            <SmallField label="Unit">
              <input value={draft.unit} onChange={(e) => set({ unit: e.target.value })} className={smallInput} />
            </SmallField>
            <SmallField
              label="Category"
              hint={p.categoryId ? "Choose “No category” to clear it" : undefined}
            >
              <select
                value={draft.categoryId}
                onChange={(e) => set({ categoryId: e.target.value })}
                className={cn(smallInput, "appearance-none")}
              >
                {/* The empty value means "no category" in both directions: it is what a
                    product with a null `categoryId` shows, and picking it on a product
                    that has one sends `categoryId: null` and clears the column. It used
                    to be labelled "Keep current", which made clearing unreachable from
                    this screen and matched a comment claiming the API refused it. */}
                <option value="">No category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.en}
                  </option>
                ))}
              </select>
            </SmallField>
          </div>
          <SmallField label="Description">
            <textarea
              value={draft.description}
              onChange={(e) => set({ description: e.target.value })}
              rows={2}
              className={cn(smallInput, "h-auto py-2")}
            />
          </SmallField>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button size="sm" disabled={busy || !dirty} onClick={() => onPatch(body)}>
              {busy ? <Spinner /> : <Check className="h-4 w-4" />} Save changes
            </Button>
            {canDelete &&
              (confirmingDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-500">Delete for good?</span>
                  <Button variant="ghost" size="sm" onClick={onCancelDelete} disabled={busy}>
                    Keep
                  </Button>
                  <Button variant="danger" size="sm" onClick={onDelete} disabled={busy}>
                    {busy ? <Spinner /> : <Trash2 className="h-4 w-4" />} Delete
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={onAskDelete} disabled={busy}>
                  <Trash2 className="h-4 w-4" /> Delete product
                </Button>
              ))}
          </div>
          {confirmingDelete && (
            <p className="text-xs text-ink-500">
              This removes the product and its variants from the database. Hiding it with the switch
              below is reversible; this is not.
            </p>
          )}

          <PhotoManager
            shopId={p.shopId}
            productId={p.id}
            productName={p.name}
            photos={p.photos}
            onChanged={onReload}
          />

          <VariantEditor
            shopId={p.shopId}
            productId={p.id}
            productName={p.name}
            variants={p.variants}
            onChanged={onReload}
          />
        </div>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-ink-100 pt-3">
        <span className="text-xs text-ink-400">
          {p.isActive ? "Visible to customers" : "Hidden from your storefront"}
        </span>
        {canEdit && (
          <Switch
            checked={p.isActive}
            disabled={busy}
            onChange={(next) => onPatch({ isActive: next })}
            label={`${p.isActive ? "Hide" : "Show"} ${p.name}`}
          />
        )}
      </div>
    </Card>
  );
}

const smallInput =
  "h-10 w-full min-w-0 rounded-lg border border-ink-200 px-2.5 text-sm outline-none focus:border-crimson-300";

function SmallField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-600">
        {label}
        {hint && <span className="font-normal text-ink-400">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}



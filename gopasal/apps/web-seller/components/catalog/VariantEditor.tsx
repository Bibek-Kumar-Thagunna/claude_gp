"use client";

import * as React from "react";
import { Plus, Trash2, Check, Layers } from "lucide-react";
import { ApiError } from "@gopasal/api-client";
import { Button } from "@/components/primitives";
import { InlineError, Spinner } from "@/components/states";
import {
  addVariant,
  deleteVariant,
  updateVariant,
  type VariantCreateBody,
  type VariantUpdateBody,
} from "@/lib/api/products";
import type { SellerVariant } from "@/lib/catalog-view";

/**
 * Add, edit and remove a product's variants.
 *
 * All three routes are `catalog.edit` — including delete, which does *not* need
 * `catalog.delete` the way deleting a whole product does. The caller only renders
 * this when the seller holds `catalog.edit` on the owning shop.
 *
 * Two honest notes about the backend behind it:
 *
 * - `stock` here **sets** a count, it does not adjust one. The delta endpoint
 *   (`POST …/products/:id/stock`) only exists at product level, so a variant
 *   count can only be overwritten. The label says "set".
 * - `PATCH …/variants/:variantId` is validated server-side. It once took its body
 *   as `Partial<VariantDto>` — a mapped *type*, whose design-time metadata is
 *   `Object`, so Nest's `ValidationPipe` found no class, skipped the body, and let
 *   an unchecked object through to `prisma.productVariant.update`. It now takes
 *   `UpdateVariantDto`, a class extending `VariantDto`, so whitelisting,
 *   `forbidNonWhitelisted` and every `@IsInt`/`@Min(0)` apply. The parsing and
 *   range checks below are therefore a courtesy — they turn a would-be 400 into an
 *   inline message before the request leaves — and not the only line of defence.
 *
 * Writes answer with the changed variant alone, so rather than merging a row into
 * a product this component asks the caller to re-read (`onChanged`) — the same
 * refetch-never-merge rule the rest of the console follows.
 */

type Draft = { name: string; sku: string; price: string; mrp: string; stock: string };

function draftFrom(v: SellerVariant): Draft {
  return {
    name: v.name,
    sku: v.sku ?? "",
    price: String(v.price),
    mrp: v.mrp === null ? "" : String(v.mrp),
    stock: String(v.stock),
  };
}

const EMPTY: Draft = { name: "", sku: "", price: "", mrp: "", stock: "" };

/** A whole number ≥ 0, or `null` when the text is not one. */
function whole(text: string): number | null {
  if (!text.trim()) return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function diffOf(v: SellerVariant, d: Draft): VariantUpdateBody {
  const body: VariantUpdateBody = {};
  const name = d.name.trim();
  if (name && name !== v.name) body.name = name;
  const sku = d.sku.trim();
  if (sku && sku !== (v.sku ?? "")) body.sku = sku;
  const price = whole(d.price);
  if (price !== null && price !== v.price) body.price = price;
  const mrp = whole(d.mrp);
  if (mrp !== null && mrp !== v.mrp) body.mrp = mrp;
  const stock = whole(d.stock);
  if (stock !== null && stock !== v.stock) body.stock = stock;
  return body;
}

export function VariantEditor({
  shopId,
  productId,
  productName,
  variants,
  onChanged,
}: {
  shopId: string;
  productId: string;
  productName: string;
  variants: SellerVariant[];
  onChanged: () => void;
}) {
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});
  const [fresh, setFresh] = React.useState<Draft>(EMPTY);
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setDrafts(Object.fromEntries(variants.map((v) => [v.id, draftFrom(v)])));
  }, [variants]);

  const run = React.useCallback(
    async (key: string, fn: () => Promise<unknown>) => {
      setBusy(key);
      setError(null);
      try {
        await fn();
        onChanged();
      } catch (err) {
        setError(
          err instanceof ApiError ? err.message : "That didn’t go through. Please try again.",
        );
      } finally {
        setBusy(null);
      }
    },
    [onChanged],
  );

  const freshPrice = whole(fresh.price);
  const canAdd = fresh.name.trim().length > 0 && freshPrice !== null && freshPrice > 0;

  return (
    <div className="rounded-xl bg-ink-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
          <Layers className="h-3.5 w-3.5" /> Variants
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setAdding((v) => !v);
            setFresh(EMPTY);
          }}
        >
          <Plus className="h-4 w-4" /> {adding ? "Cancel" : "Add variant"}
        </Button>
      </div>

      {error && <InlineError message={error} className="mb-2" />}

      {variants.length === 0 && !adding && (
        <p className="text-xs text-ink-500">
          No variants. Customers buy {productName} at its single price of{" "}
          <span className="font-semibold text-ink-700">the product price above</span>.
        </p>
      )}

      <div className="space-y-2">
        {variants.map((v) => {
          const d = drafts[v.id] ?? draftFrom(v);
          const body = diffOf(v, d);
          const dirty = Object.keys(body).length > 0;
          const rowBusy = busy === v.id;
          return (
            <div
              key={v.id}
              className="grid grid-cols-2 gap-1.5 rounded-lg bg-white p-2 ring-1 ring-ink-100 sm:grid-cols-[1.3fr_1fr_1fr_0.9fr_1.1fr_auto_auto]"
            >
              {/*
                A switched-off variant is marked here as well as on /inventory, so the
                two screens agree. `isActive` is a real column and the PATCH route
                accepts it, but nothing in this console writes it — so the honest thing
                is to show the state and say plainly that there is no control for it,
                rather than leave a seller wondering why a row looks normal here and
                reads "Off" there.
              */}
              <div className="flex min-w-0 items-center gap-1.5">
                <input
                  value={d.name}
                  onChange={(e) =>
                    setDrafts((s) => ({ ...s, [v.id]: { ...d, name: e.target.value } }))
                  }
                  placeholder="Label"
                  aria-label="Variant label"
                  className={field}
                />
                {!v.isActive && (
                  <span
                    title="Switched off, so customers cannot buy this variant. This console has no control for it."
                    className="shrink-0 rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-600"
                  >
                    Off
                  </span>
                )}
              </div>
              <input
                value={d.price}
                inputMode="numeric"
                onChange={(e) =>
                  setDrafts((s) => ({ ...s, [v.id]: { ...d, price: e.target.value.replace(/[^\d]/g, "") } }))
                }
                placeholder="Price"
                aria-label="Variant price"
                className={field}
              />
              <input
                value={d.mrp}
                inputMode="numeric"
                onChange={(e) =>
                  setDrafts((s) => ({ ...s, [v.id]: { ...d, mrp: e.target.value.replace(/[^\d]/g, "") } }))
                }
                placeholder="MRP"
                aria-label="Variant MRP"
                className={field}
              />
              <input
                value={d.stock}
                inputMode="numeric"
                onChange={(e) =>
                  setDrafts((s) => ({ ...s, [v.id]: { ...d, stock: e.target.value.replace(/[^\d]/g, "") } }))
                }
                placeholder="Set stock"
                aria-label="Set variant stock"
                className={field}
              />
              <input
                value={d.sku}
                onChange={(e) => setDrafts((s) => ({ ...s, [v.id]: { ...d, sku: e.target.value } }))}
                placeholder="SKU"
                aria-label="Variant SKU"
                className={field}
              />
              <button
                type="button"
                disabled={rowBusy || !dirty}
                onClick={() => void run(v.id, () => updateVariant(shopId, v.id, body))}
                aria-label={`Save ${v.name}`}
                className="flex items-center justify-center rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-800 disabled:opacity-40"
              >
                {rowBusy ? <Spinner /> : <Check className="h-4 w-4" />}
              </button>
              <button
                type="button"
                disabled={rowBusy}
                onClick={() => void run(v.id, () => deleteVariant(shopId, v.id))}
                aria-label={`Delete ${v.name}`}
                className="flex items-center justify-center rounded-lg p-2 text-ink-400 hover:bg-red-50 hover:text-[#c02636] disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>

      {adding && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-lg bg-white p-2 ring-1 ring-crimson-100 sm:grid-cols-[1.3fr_1fr_1fr_0.9fr_1.1fr_auto]">
          <input
            value={fresh.name}
            onChange={(e) => setFresh((f) => ({ ...f, name: e.target.value }))}
            placeholder="Label (1 kg)"
            aria-label="New variant label"
            className={field}
          />
          <input
            value={fresh.price}
            inputMode="numeric"
            onChange={(e) => setFresh((f) => ({ ...f, price: e.target.value.replace(/[^\d]/g, "") }))}
            placeholder="Price"
            aria-label="New variant price"
            className={field}
          />
          <input
            value={fresh.mrp}
            inputMode="numeric"
            onChange={(e) => setFresh((f) => ({ ...f, mrp: e.target.value.replace(/[^\d]/g, "") }))}
            placeholder="MRP"
            aria-label="New variant MRP"
            className={field}
          />
          <input
            value={fresh.stock}
            inputMode="numeric"
            onChange={(e) => setFresh((f) => ({ ...f, stock: e.target.value.replace(/[^\d]/g, "") }))}
            placeholder="Stock"
            aria-label="New variant stock"
            className={field}
          />
          <input
            value={fresh.sku}
            onChange={(e) => setFresh((f) => ({ ...f, sku: e.target.value }))}
            placeholder="SKU"
            aria-label="New variant SKU"
            className={field}
          />
          <button
            type="button"
            disabled={!canAdd || busy === "new"}
            onClick={() => {
              const price = whole(fresh.price);
              if (price === null) return;
              const body: VariantCreateBody = { name: fresh.name.trim(), price };
              const mrp = whole(fresh.mrp);
              if (mrp !== null) body.mrp = mrp;
              const stock = whole(fresh.stock);
              if (stock !== null) body.stock = stock;
              const sku = fresh.sku.trim();
              if (sku) body.sku = sku;
              void run("new", async () => {
                await addVariant(shopId, productId, body);
                setFresh(EMPTY);
                setAdding(false);
              });
            }}
            aria-label="Save new variant"
            className="flex items-center justify-center rounded-lg bg-ink-900 p-2 text-white disabled:opacity-40"
          >
            {busy === "new" ? <Spinner /> : <Check className="h-4 w-4" />}
          </button>
        </div>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
        Stock here <span className="font-semibold">sets</span> the count for one variant. The
        plus/minus on the Inventory screen works on the product total instead — that is the only
        thing the stock endpoint can change.
      </p>
    </div>
  );
}

const field =
  "h-9 w-full min-w-0 rounded-lg border border-ink-200 px-2 text-sm outline-none focus:border-crimson-300";

"use client";

import * as React from "react";
import {
  ArrowLeft,
  Plus,
  Trash2,
  PackagePlus,
  CheckCircle2,
  Store,
  Info,
  AlertTriangle,
} from "lucide-react";
import { ApiError } from "@gopasal/api-client";
import { useAuth } from "@/components/auth-provider";
import { useShops } from "@/components/shop-provider";
import { ShopScopeState, useShopScope } from "@/components/ShopScope";
import { PageHeader, Card, Button, Switch } from "@/components/primitives";
import { PermissionGate } from "@/components/PermissionGate";
import { Reveal } from "@/components/Reveal";
import { InlineError, InlineNotice, Spinner } from "@/components/states";
import { rs } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  addVariant,
  createProduct,
  fetchCategories,
  updateProduct,
  type ProductCreateBody,
  type ProductRowWire,
  type VariantCreateBody,
} from "@/lib/api/products";
import type { Category } from "@/lib/api/types";

/**
 * Add a product, on the real API.
 *
 * `POST /seller/shops/:shopId/products` takes `CreateProductDto` and nothing
 * else — the pipe runs `forbidNonWhitelisted`, so an extra key is a 400. Three
 * consequences shape this form:
 *
 * - **A variant cannot be created with the product.** `POST …/variants` is a
 *   separate route needing `catalog.edit`, so variants are added one at a time
 *   after the product exists, and a variant that fails is reported by name
 *   instead of quietly dropped.
 * - **There is no `isActive` on create.** A new product is visible immediately
 *   (`isActive` defaults true in Prisma). Saving it hidden means a follow-up
 *   PATCH, which is `catalog.edit` — so that option only appears for a seller who
 *   holds it, rather than a switch that silently does nothing.
 * - **Photos come after the row exists.** `CreateProductDto` has no `images`
 *   field, and adding one back would be a 400 under `forbidNonWhitelisted` — the
 *   image routes take bytes and mint their own storage keys, and they need a
 *   product id to hang them on. So this form has no photo control and points at
 *   the editor on the Products page, which is where the upload lives.
 *
 * Stock behaves as the backend does: `trackStock` off means the stock number is
 * meaningless and the adjust endpoint refuses the product, so the opening-count
 * input only appears once tracking is on.
 */

export default function NewProductPage() {
  return (
    <PermissionGate perm="catalog.create">
      <NewProductInner />
    </PermissionGate>
  );
}

type VariantDraft = {
  key: string;
  name: string;
  price: string;
  mrp: string;
  stock: string;
  sku: string;
};

let keySeq = 0;
const emptyVariant = (): VariantDraft => ({
  key: `vd-${++keySeq}`,
  name: "",
  price: "",
  mrp: "",
  stock: "",
  sku: "",
});

/** A whole number ≥ 0, or `null` when the text is not one. */
function whole(text: string): number | null {
  if (!text.trim()) return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

type Result = {
  product: ProductRowWire;
  shopName: string;
  variantsAdded: number;
  variantErrors: string[];
  hiddenRequested: boolean;
  hidden: boolean;
};

function NewProductInner() {
  const { canInShop } = useAuth();
  const { shops, activeShop, activeShopId } = useShops();

  const [categories, setCategories] = React.useState<Category[]>([]);
  const [name, setName] = React.useState("");
  const [nameNp, setNameNp] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [mrp, setMrp] = React.useState("");
  const [unit, setUnit] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [tags, setTags] = React.useState("");
  const [trackStock, setTrackStock] = React.useState(false);
  const [stock, setStock] = React.useState("");
  const [startHidden, setStartHidden] = React.useState(false);
  const [variants, setVariants] = React.useState<VariantDraft[]>([]);
  const [shopId, setShopId] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<Result | null>(null);

  /** Only shops this account may actually create in — the API would refuse the rest. */
  const targets = React.useMemo(
    () => shops.filter((s) => canInShop(s.id, "catalog.create")),
    [shops, canInShop],
  );

  /**
   * Why there is nowhere to save, when there is nowhere to save.
   *
   * `targets` is empty in four different situations, and until now all four were
   * reported as the last one — including the first paint of a healthy account,
   * where the shop list simply had not answered yet, and a *failed* read, where
   * the seller was told they lack a permission the server never got to report.
   * {@link useShopScope} names which case it is; the "denied" wording below stays
   * this page's own, because an empty `targets` means no shop on the account
   * grants the permission, which is a wider statement than the shared copy makes.
   */
  const scope = useShopScope("catalog.create");

  /*
    The shop list arrives after first paint, so the target cannot be settled
    during render. Keep the seller's pick while it is still a shop they may
    create in; otherwise fall back to the shop in scope, then the first one.
  */
  React.useEffect(() => {
    setShopId((prev) => {
      if (prev && targets.some((s) => s.id === prev)) return prev;
      if (activeShopId && targets.some((s) => s.id === activeShopId)) return activeShopId;
      return targets[0]?.id ?? "";
    });
  }, [targets, activeShopId]);

  React.useEffect(() => {
    const ctrl = new AbortController();
    fetchCategories(ctrl.signal)
      .then(setCategories)
      .catch(() => setCategories([]));
    return () => ctrl.abort();
  }, []);

  const canHideAfterCreate = shopId ? canInShop(shopId, "catalog.edit") : false;
  const canAddVariants = shopId ? canInShop(shopId, "catalog.edit") : false;

  const priceValue = whole(price);
  const validVariants = variants.filter((v) => {
    const p = whole(v.price);
    return v.name.trim().length > 0 && p !== null && p > 0;
  });
  const canSubmit =
    name.trim().length > 0 && priceValue !== null && priceValue > 0 && shopId.length > 0 && !saving;

  const previewPrices = validVariants.map((v) => whole(v.price) ?? 0);
  const range =
    previewPrices.length > 0
      ? { min: Math.min(...previewPrices), max: Math.max(...previewPrices) }
      : null;

  function updateVariant(key: string, patch: Partial<VariantDraft>) {
    setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  }

  function reset() {
    setName("");
    setNameNp("");
    setCategoryId("");
    setPrice("");
    setMrp("");
    setUnit("");
    setDescription("");
    setTags("");
    setTrackStock(false);
    setStock("");
    setStartHidden(false);
    setVariants([]);
    setError(null);
    setResult(null);
  }

  /**
   * Create the product, then its variants, then hide it if that was asked for.
   *
   * Three separate writes, because the API has three separate routes. They are
   * run in that order and each failure is reported for what it is: if the product
   * saved and a variant did not, the product still exists and saying otherwise
   * would send the seller looking for something that is already in their catalog.
   */
  async function submit() {
    if (!canSubmit || priceValue === null) return;
    setSaving(true);
    setError(null);
    try {
      const body: ProductCreateBody = { name: name.trim(), price: priceValue };
      const np = nameNp.trim();
      if (np) body.nameNp = np;
      const desc = description.trim();
      if (desc) body.description = desc;
      if (categoryId) body.categoryId = categoryId;
      const mrpValue = whole(mrp);
      if (mrpValue !== null) body.mrp = mrpValue;
      const unitValue = unit.trim();
      if (unitValue) body.unit = unitValue;
      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      if (tagList.length > 0) body.tags = tagList;
      if (trackStock) {
        body.trackStock = true;
        const opening = whole(stock);
        if (opening !== null) body.stock = opening;
      }

      const product = await createProduct(shopId, body);

      const variantErrors: string[] = [];
      let variantsAdded = 0;
      if (canAddVariants) {
        for (const v of validVariants) {
          const vPrice = whole(v.price);
          if (vPrice === null) continue;
          const vBody: VariantCreateBody = { name: v.name.trim(), price: vPrice };
          const vMrp = whole(v.mrp);
          if (vMrp !== null) vBody.mrp = vMrp;
          const vStock = whole(v.stock);
          if (vStock !== null) vBody.stock = vStock;
          const vSku = v.sku.trim();
          if (vSku) vBody.sku = vSku;
          try {
            await addVariant(shopId, product.id, vBody);
            variantsAdded++;
          } catch (err) {
            variantErrors.push(
              `${vBody.name}: ${err instanceof ApiError ? err.message : "could not be saved"}`,
            );
          }
        }
      }

      let hidden = false;
      if (startHidden && canHideAfterCreate) {
        try {
          await updateProduct(shopId, product.id, { isActive: false });
          hidden = true;
        } catch {
          hidden = false;
        }
      }

      setResult({
        product,
        shopName: shops.find((s) => s.id === shopId)?.name ?? "your shop",
        variantsAdded,
        variantErrors,
        hiddenRequested: startHidden && canHideAfterCreate,
        hidden,
      });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "The product couldn’t be saved. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    return (
      <div>
        <BackLink />
        <Reveal>
          <Card className="mx-auto max-w-lg p-8 text-center">
            <span className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[#EAF7EF] text-[#0B7E58]">
              <CheckCircle2 className="h-8 w-8" />
            </span>
            <h2 className="text-xl font-bold text-ink-900">Product saved</h2>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
              <span className="font-semibold text-ink-700">{result.product.name}</span> is in{" "}
              {result.shopName}
              {result.variantsAdded > 0 &&
                ` with ${result.variantsAdded} variant${result.variantsAdded === 1 ? "" : "s"}`}
              .{" "}
              {result.hidden
                ? "It’s hidden from your storefront until you switch it on."
                : "It’s visible to customers now."}
            </p>
            {result.hiddenRequested && !result.hidden && (
              <InlineError
                className="mt-4 text-left"
                message="The product saved but couldn’t be hidden. It is live — use the switch on the Products page to hide it."
              />
            )}
            {result.variantErrors.length > 0 && (
              <div className="mt-4 rounded-xl bg-[#FFF6E5] px-4 py-3 text-left">
                <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#8a5a00]">
                  <AlertTriangle className="h-4 w-4" /> Some variants didn’t save
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-[#8a5a00]">
                  {result.variantErrors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
                <p className="mt-1.5 text-xs text-[#8a5a00]">
                  The product itself is saved — add the rest from the Products page.
                </p>
              </div>
            )}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              <Button onClick={reset}>
                <Plus className="h-4 w-4" /> Add another
              </Button>
              <Button href="/catalog" variant="outline">
                Back to products
              </Button>
            </div>
          </Card>
        </Reveal>
      </div>
    );
  }


  return (
    <div>
      <BackLink />
      <PageHeader
        icon={<PackagePlus className="h-5 w-5" />}
        title="Add product"
        subtitle="Saved straight to your shop. Nothing is stored until you press save."
      />

      {targets.length === 0 ? (
        scope.kind === "loading" || scope.kind === "failed" || scope.kind === "no-shops" ? (
          <ShopScopeState
            scope={scope}
            what="products"
            permLabel="add products"
            icon={<PackagePlus className="h-6 w-6" />}
          />
        ) : (
          <Card className="p-6">
            <p className="text-sm text-ink-600">
              You don’t have the “add products” permission on any of your shops, so there’s nowhere
              to save this. Ask an owner to grant{" "}
              <span className="font-semibold">catalog.create</span> on the shop you need.
            </p>
          </Card>
        )
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="grid gap-4 lg:grid-cols-[1fr_320px]"
        >
          <div className="space-y-4">
            <Reveal>
              <Card className="space-y-4 p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">
                  Details
                </h2>

                {targets.length > 1 && activeShopId === null ? (
                  <Field label="Which shop?" hint="A product belongs to one shop.">
                    <div className="relative">
                      <Store className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                      <select
                        value={shopId}
                        onChange={(e) => setShopId(e.target.value)}
                        className="h-11 w-full appearance-none rounded-xl border border-ink-200 pl-9 pr-3 text-sm outline-none focus:border-crimson-300"
                      >
                        {targets.map((s) => (
                          <option key={s.id} value={s.id}>
                            {[s.name, s.area ?? s.statusLabel].filter(Boolean).join(" · ")}
                          </option>
                        ))}
                      </select>
                    </div>
                  </Field>
                ) : (
                  <Field label="Shop">
                    <div className="flex h-11 items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 text-sm text-ink-700">
                      <Store className="h-4 w-4 text-ink-400" />
                      {targets.find((s) => s.id === shopId)?.name ??
                        activeShop?.name ??
                        "Your shop"}
                    </div>
                  </Field>
                )}

                {/*
                  The shop in scope is not always the shop this can be saved to:
                  `targets` spans every shop the account may create in, and the
                  picker above appears only when nothing is in scope. The field
                  already names the real destination, but a seller who switched to
                  one shop and is writing to another deserves to be told why.
                */}
                {activeShopId !== null && shopId !== "" && shopId !== activeShopId && (
                  <InlineNotice
                    message={`${activeShop?.name ?? "The shop in scope"} doesn’t have the “add products” permission, so this will be saved to ${targets.find((s) => s.id === shopId)?.name ?? "another shop on your account"} instead.`}
                  />
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Product name" required>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Basmati Rice"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Nepali name" hint="Optional">
                    <input
                      value={nameNp}
                      onChange={(e) => setNameNp(e.target.value)}
                      placeholder="बासमती चामल"
                      className={cn(inputCls, "deva")}
                    />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Price (Rs)" required hint="Whole rupees">
                    <input
                      value={price}
                      inputMode="numeric"
                      onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder="0"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="MRP (Rs)" hint="Optional — shown struck through">
                    <input
                      value={mrp}
                      inputMode="numeric"
                      onChange={(e) => setMrp(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder="0"
                      className={inputCls}
                    />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Category" hint={categories.length === 0 ? "List unavailable" : "Optional"}>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      disabled={categories.length === 0}
                      className={cn(inputCls, "appearance-none disabled:bg-ink-50")}
                    >
                      <option value="">No category</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.en}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Unit" hint="Defaults to “1 pc”">
                    <input
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      placeholder="e.g. per kg"
                      className={inputCls}
                    />
                  </Field>
                </div>

                <Field label="Description" hint="Optional">
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Short description customers will see…"
                    className={cn(inputCls, "h-auto py-2.5")}
                  />
                </Field>

                <Field label="Tags" hint="Comma separated — used for search">
                  <input
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="rice, staples, bulk"
                    className={inputCls}
                  />
                </Field>
              </Card>
            </Reveal>

            <Reveal delay={1}>
              <Card className="p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-400">
                      Variants
                    </h2>
                    <p className="mt-0.5 text-xs text-ink-400">
                      Optional. Sizes or packs with their own price — the product price above is
                      what applies when there are none.
                    </p>
                  </div>
                  {canAddVariants && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setVariants((prev) => [...prev, emptyVariant()])}
                    >
                      <Plus className="h-4 w-4" /> Add variant
                    </Button>
                  )}
                </div>

                {!canAddVariants ? (
                  <p className="text-sm text-ink-500">
                    Adding a variant needs the “edit products” permission, which this account doesn’t
                    have on the selected shop. The product itself will still save.
                  </p>
                ) : variants.length === 0 ? (
                  <p className="text-sm text-ink-500">No variants — the product sells at one price.</p>
                ) : (
                  <div className="space-y-3">
                    {variants.map((v) => (
                      <div
                        key={v.key}
                        className="grid grid-cols-2 gap-2 rounded-xl border border-ink-100 p-3 sm:grid-cols-[1.2fr_1fr_1fr_0.9fr_1.1fr_auto]"
                      >
                        <input
                          value={v.name}
                          onChange={(e) => updateVariant(v.key, { name: e.target.value })}
                          placeholder="Label (1 kg)"
                          aria-label="Variant label"
                          className={smallInput}
                        />
                        <input
                          value={v.price}
                          inputMode="numeric"
                          onChange={(e) =>
                            updateVariant(v.key, { price: e.target.value.replace(/[^\d]/g, "") })
                          }
                          placeholder="Price"
                          aria-label="Variant price"
                          className={smallInput}
                        />
                        <input
                          value={v.mrp}
                          inputMode="numeric"
                          onChange={(e) =>
                            updateVariant(v.key, { mrp: e.target.value.replace(/[^\d]/g, "") })
                          }
                          placeholder="MRP"
                          aria-label="Variant MRP"
                          className={smallInput}
                        />
                        <input
                          value={v.stock}
                          inputMode="numeric"
                          onChange={(e) =>
                            updateVariant(v.key, { stock: e.target.value.replace(/[^\d]/g, "") })
                          }
                          placeholder="Stock"
                          aria-label="Variant stock"
                          className={smallInput}
                        />
                        <input
                          value={v.sku}
                          onChange={(e) => updateVariant(v.key, { sku: e.target.value })}
                          placeholder="SKU"
                          aria-label="Variant SKU"
                          className={smallInput}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setVariants((prev) => prev.filter((x) => x.key !== v.key))
                          }
                          aria-label="Remove variant"
                          className="flex items-center justify-center rounded-lg p-2 text-ink-400 hover:bg-red-50 hover:text-[#c02636]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {range && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">
                    <Info className="h-4 w-4 text-ink-400" />
                    Variant prices:{" "}
                    <span className="font-semibold text-ink-900">
                      {range.min === range.max ? rs(range.min) : `${rs(range.min)}–${rs(range.max)}`}
                    </span>
                  </div>
                )}
              </Card>
            </Reveal>

          </div>

          <div className="space-y-4">
            <Reveal delay={1}>
              <Card className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink-800">Track stock</p>
                    <p className="text-xs text-ink-400">
                      Off means quantities are never counted — and the stock adjust button stays
                      disabled for this product.
                    </p>
                  </div>
                  <Switch checked={trackStock} onChange={setTrackStock} label="Track stock" />
                </div>

                {trackStock && (
                  <Field label="Opening stock" hint="Whole units">
                    <input
                      value={stock}
                      inputMode="numeric"
                      onChange={(e) => setStock(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder="0"
                      className={inputCls}
                    />
                  </Field>
                )}

                {canHideAfterCreate ? (
                  <div className="flex items-start justify-between gap-3 border-t border-ink-100 pt-4">
                    <div>
                      <p className="text-sm font-semibold text-ink-800">Save hidden</p>
                      <p className="text-xs text-ink-400">
                        The API always creates a product visible, so this saves it and then hides it
                        in a second step.
                      </p>
                    </div>
                    <Switch checked={startHidden} onChange={setStartHidden} label="Save hidden" />
                  </div>
                ) : (
                  <p className="border-t border-ink-100 pt-4 text-xs text-ink-400">
                    New products go live as soon as they’re saved. Hiding one needs the “edit
                    products” permission.
                  </p>
                )}
              </Card>
            </Reveal>

            {/*
              No photo control here, because the upload route needs a product id:
              photos are posted as bytes to `…/products/:id/images`, which cannot
              exist before the row does. Saying where they go is honest; a picker
              that held files in memory and uploaded them after the create would
              hide a half-failure behind a success screen.
            */}
            <Reveal delay={2}>
              <InlineNotice message="Photos are added after saving. Open the product on the Products page and use Add photo — up to 8, and the first one becomes the cover." />
            </Reveal>

            {error && <InlineError message={error} />}

            <Reveal delay={2}>
              <Card className="p-5">
                <Button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full justify-center"
                >
                  {saving ? <Spinner /> : null} Save product
                </Button>
                {!canSubmit && !saving && (
                  <p className="mt-2 text-center text-xs text-ink-400">
                    A name and a price above zero are required.
                  </p>
                )}
              </Card>
            </Reveal>
          </div>

        </form>
      )}
    </div>
  );
}

const inputCls =
  "h-11 w-full rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-crimson-300";
const smallInput =
  "h-10 w-full min-w-0 rounded-lg border border-ink-200 px-2.5 text-sm outline-none focus:border-crimson-300";

function BackLink() {
  return (
    <a
      href="/catalog"
      className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"
    >
      <ArrowLeft className="h-4 w-4" /> Back to products
    </a>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-sm font-medium text-ink-700">
        {label}
        {required && <span className="text-[#c02636]">*</span>}
        {hint && <span className="font-normal text-ink-400">· {hint}</span>}
      </span>
      {children}
    </label>
  );
}


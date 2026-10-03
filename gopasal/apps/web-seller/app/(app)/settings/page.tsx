"use client";

/**
 * Shop settings — a real form over `PATCH /seller/shops/:shopId`.
 *
 * This screen used to be a record with a line at the top admitting the console
 * could not change any of it. That was honest but incomplete: the endpoint existed
 * the whole time. It is `PATCH /api/v1/seller/shops/:shopId`, guarded by
 * `settings.manage`, and `UpdateShopDto` accepts fifteen columns of the shop row.
 * Fourteen of them are on this screen and editable. Everything else a shop knows
 * about itself is read-only *because no request body in any scope accepts it* —
 * a different sentence from "not wired yet", and said differently below.
 *
 * Three properties of the endpoint shape this file:
 *
 *  - **It is a true partial PATCH.** `ShopsService.update` hands the validated body
 *    straight to `prisma.shop.update` as `data`, so an omitted key leaves its column
 *    untouched. This form therefore submits a *diff* — only what the seller actually
 *    changed — rather than a full snapshot that would rewrite every column.
 *  - **`null` is not a value.** Every DTO field is `@ValidateIf(v !== undefined)`, so
 *    `null` is answered with a 400 rather than treated as "clear this". A nullable
 *    text column is cleared with `""`; `categoryId` can be changed but not emptied.
 *    The shop pin is outside this PATCH and changes only through an on-premises
 *    phone capture.
 *  - **The response is a bare `Shop` row** — no `myRole`, no `_count`. It cannot be
 *    merged into the console's shop list, so a successful save awaits
 *    `useShops().reload()` and the form is re-seeded from the refetched row. What is
 *    on screen after a save is what the server has, not what was typed.
 *
 * Authorization is per shop and read from `/auth/me`, never inferred: the save is
 * gated on `canInShop(shop.id, "settings.manage")` and the read on
 * `canInShop(shop.id, "settings.view")`, with no ambient "permission somewhere"
 * fallback and no owner bypass — the browser holds no concept of shop ownership.
 * Because `/auth/me` reports *effective* permissions (`RbacService.describe` filters
 * each shop's keys through the lifecycle policy), a SUSPENDED shop already answers
 * false for `settings.manage`, so this screen turns read-only for it without knowing
 * the lifecycle rule itself.
 *
 * Which shop is shown is this screen's own state rather than the console's: a seller
 * managing four shops can edit one shop's details without changing what the rest of
 * the console is scoped to. The `ALL_SHOPS` sentinel is never involved — the
 * selector only ever holds a real shop id, which is the only thing the API accepts.
 */

import * as React from "react";
import {
  Settings as SettingsIcon,
  Store,
  Clock,
  Wallet,
  Bike,
  Info,
  CheckCircle2,
  Eye,
  EyeOff,
  Save,
} from "lucide-react";
import { ApiError } from "@gopasal/api-client";
import { useAuth } from "@/components/auth-provider";
import { useShops } from "@/components/shop-provider";
import { PageHeader, Card, Badge, Button, EmptyState, Switch } from "@/components/primitives";
import { PermissionGate } from "@/components/PermissionGate";
import { InlineError, InlineNotice, Spinner } from "@/components/states";
import { cn } from "@/lib/cn";
import { rs } from "@/lib/format";
import { fetchCategories } from "@/lib/api/products";
import { updateShop, type ShopUpdateBody } from "@/lib/api/shops";
import type { Category } from "@/lib/api/types";
import type { SellerShop } from "@/lib/shop-view";
import { ShopLocationCapture } from "@/components/location/ShopLocationCapture";

/*
  The server's own bounds, mirrored as field limits so a seller is stopped at the
  input rather than by a 400. `apps/api/src/modules/catalog/dto/catalog.dto.ts` is
  the enforcing copy — these numbers exist to make the form honest, not to replace
  the validation.
*/
const LIMITS = {
  name: { min: 2, max: 120 },
  nameNp: 120,
  description: 1000,
  phone: 20,
  area: 160,
  fullAddress: 300,
  hours: 120,
  emoji: 16,
  radius: { min: 0.5, max: 20 },
  /**
   * `SHOP_MIN_ORDER_MAX` — the `integer` column's ceiling, not a business rule.
   * Mirrored for the same reason as the rest: the form said it checked this field
   * and then let anything above two billion through to a server 400.
   */
  minOrder: { max: 2_147_483_647 },
} as const;

export default function SettingsPage() {
  return (
    <PermissionGate perm="settings.view">
      <SettingsInner />
    </PermissionGate>
  );
}

function SettingsInner() {
  const { canInShop } = useAuth();
  const { shops, activeShopId, loading, reload } = useShops();

  // Only the shops whose settings this account may read. `canInShop` and not the
  // ambient `can`: on the consolidated view the ambient answer is "somewhere",
  // which would list a shop this seller cannot open.
  const readable = React.useMemo(
    () => shops.filter((s) => canInShop(s.id, "settings.view")),
    [shops, canInShop],
  );

  // Which shop is on screen. It starts from whatever is in scope and is
  // re-validated whenever the list changes, so it can never name a shop that has
  // left the account or that the seller may not read.
  const [shopId, setShopId] = React.useState<string>(activeShopId ?? "");
  React.useEffect(() => {
    setShopId((prev) => {
      if (prev && readable.some((s) => s.id === prev)) return prev;
      if (activeShopId && readable.some((s) => s.id === activeShopId)) return activeShopId;
      return readable[0]?.id ?? "";
    });
  }, [readable, activeShopId]);

  // The category list is only needed to show a name instead of a cuid. When it
  // cannot be read the field goes read-only rather than offering a blind choice.
  // `null` is "no answer yet", which is why it is not seeded with `[]`: an empty
  // array is a statement that there are no categories, and the field's hint reads
  // it as one.
  const [categories, setCategories] = React.useState<Category[] | null>(null);
  React.useEffect(() => {
    const ctrl = new AbortController();
    fetchCategories(ctrl.signal)
      .then((rows) => {
        if (!ctrl.signal.aborted) setCategories(rows);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setCategories([]);
      });
    return () => ctrl.abort();
  }, []);

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /** The shop name the server answered with, set only once a save has resolved. */
  const [saved, setSaved] = React.useState<string | null>(null);
  /** Bumped after a save so the form re-seeds from the refetched shop. */
  const [revision, setRevision] = React.useState(0);

  const shop = readable.find((s) => s.id === shopId);
  const editable = shop ? canInShop(shop.id, "settings.manage") : false;

  // Switching shops must not carry one shop's notices onto another's screen.
  React.useEffect(() => {
    setError(null);
    setSaved(null);
  }, [shopId]);

  /**
   * Save the diff, then read the shop back.
   *
   * `saving` is checked before anything else and the submit button is disabled
   * while it is true, so a second press cannot start a second PATCH. Nothing is
   * announced until `updateShop` *and* the refetch have both resolved: the success
   * line names the shop as the server returned it, which is the only value that
   * proves the write landed. On failure `revision` is untouched, so the form is not
   * re-seeded and every unsaved value the seller typed is still on screen next to
   * the API's own message.
   */
  async function save(target: string, body: ShopUpdateBody) {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const row = await updateShop(target, body);
      await reload();
      setSaved(row.name);
      setRevision((r) => r + 1);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "That didn’t save. Check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!shop) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={<Info className="h-6 w-6" />}
          title={loading ? "Loading your shops" : "No shop to show"}
          description={
            loading
              ? "One moment — reading the shops on your account."
              : "Once a shop is approved on your account, its details appear here."
          }
        />
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        icon={<SettingsIcon className="h-5 w-5" />}
        title="Settings"
        subtitle={
          editable
            ? "Your shop’s profile, hours and coverage. Nothing changes until you press save."
            : "Your shop’s profile, delivery coverage and payment options, as GoPasal has them."
        }
        actions={
          readable.length > 1 ? (
            <label className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm">
              <Store className="h-4 w-4 text-ink-400" />
              <span className="sr-only">Shop to show</span>
              <select
                value={shopId}
                onChange={(e) => setShopId(e.target.value)}
                className="bg-transparent font-medium text-ink-800 outline-none"
              >
                {readable.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null
        }
      />

      {/*
        Said once, before any value is read, and only when it is true: this seller
        cannot save this shop. When the shop's own lifecycle is the reason the API
        already has a sentence for it (`restrictionReason`), and that sentence is
        used verbatim rather than reworded here.
      */}
      {!editable && (
        <InlineNotice
          className="mb-4"
          message={
            shop.restricted && shop.restrictionReason
              ? shop.restrictionReason
              : "You can read these settings but not change them. Editing needs the “settings.manage” permission on this shop — an owner can grant it from Team."
          }
        />
      )}

      <Card className="mb-4 p-5">
        <div className="flex items-start gap-3">
          <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${shop.storefrontVisible ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {shop.storefrontVisible ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-ink-900">Customer visibility</h2>
              <Badge tone={shop.storefrontVisible ? "green" : "marigold"}>
                {shop.storefrontVisible ? "Visible to customers" : "Private until ready"}
              </Badge>
            </div>
            {shop.storefrontVisible ? (
              <p className="mt-1 text-sm text-ink-500">
                This shop has a verified pin and {shop.deliverableProductCount} orderable {shop.deliverableProductCount === 1 ? "product" : "products"}.
              </p>
            ) : (
              <div className="mt-2 text-sm text-ink-600">
                <p>Approval creates your seller dashboard, but customers only see the shop after every item below is complete:</p>
                <ul className="mt-2 space-y-1.5">
                  <ReadinessItem done={!shop.storefrontBlockers.includes("APPROVAL")} label="Shop approved and verified by GoPasal" />
                  <ReadinessItem done={!shop.storefrontBlockers.includes("VERIFIED_LOCATION")} label="Verified shop pin captured from a phone inside the shop" />
                  <ReadinessItem done={!shop.storefrontBlockers.includes("DELIVERABLE_PRODUCT")} label="At least one active product is in stock or does not track stock" />
                </ul>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/*
        `key` carries the revision, so a successful save remounts the form and its
        draft is seeded again from the shop the refetch returned. A failure leaves
        the key alone, which is what keeps unsaved edits on screen.
      */}
      <ShopSettingsForm
        key={`${shop.id}:${revision}`}
        shop={shop}
        categories={categories}
        editable={editable}
        saving={saving}
        error={error}
        saved={saved}
        onEdit={() => {
          setSaved(null);
          setError(null);
        }}
        onSave={(body) => {
          void save(shop.id, body);
        }}
        onLocationCaptured={async () => {
          await reload();
          setSaved(shop.name);
          setRevision((r) => r + 1);
        }}
      />
    </div>
  );
}

function ReadinessItem({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2">
      <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${done ? "text-emerald-600" : "text-ink-300"}`} />
      <span className={done ? "text-ink-500 line-through" : "font-medium text-ink-700"}>{label}</span>
    </li>
  );
}

/* ── the draft ────────────────────────────────────────────────────────────── */

/**
 * The form's own state: every field a string or boolean, never a `null`.
 *
 * Numbers are held as text because a half-typed number is not a number, and an
 * input that reformats what is being typed is worse than one that validates on
 * save. `null` becomes `""` here and is turned back into "omit this key" by
 * `review` below, so a nullable column that was already empty is never rewritten
 * as `""`.
 */
type Draft = {
  name: string;
  nameNp: string;
  description: string;
  categoryId: string;
  phone: string;
  area: string;
  fullAddress: string;
  deliveryRadiusKm: string;
  hours: string;
  emoji: string;
  isOpen: boolean;
  minOrder: string;
  soloMode: boolean;
};

function draftOf(shop: SellerShop): Draft {
  return {
    name: shop.name,
    nameNp: shop.nameNp ?? "",
    description: shop.description ?? "",
    categoryId: shop.categoryId ?? "",
    phone: shop.phone ?? "",
    area: shop.area ?? "",
    fullAddress: shop.fullAddress ?? "",
    deliveryRadiusKm: String(shop.deliveryRadiusKm),
    hours: shop.hours ?? "",
    emoji: shop.emoji ?? "",
    isOpen: shop.isOpen,
    minOrder: String(shop.minOrder),
    soloMode: shop.soloMode,
  };
}

/** The nullable text columns, all of which clear with `""`. */
const TEXT_FIELDS = [
  "nameNp",
  "description",
  "phone",
  "area",
  "fullAddress",
  "hours",
  "emoji",
] as const;

type Problems = Partial<Record<keyof Draft, string>>;

/**
 * What this draft would send, and what it cannot send yet.
 *
 * The body is a diff against the shop as the API last returned it: a field the
 * seller did not touch is absent, which is how the PATCH is told to leave that
 * column alone. `problems` is the other half — a field whose text the API is known
 * to refuse, reported at the field instead of being sent and answered with a 400.
 * Both are recomputed on every render, so the save button's state is always the
 * truth about the current text.
 */
function review(shop: SellerShop, draft: Draft): { body: ShopUpdateBody; problems: Problems } {
  const body: ShopUpdateBody = {};
  const problems: Problems = {};

  const name = draft.name.trim();
  if (name.length < LIMITS.name.min) {
    problems.name = `A shop name needs at least ${LIMITS.name.min} characters.`;
  } else if (name !== shop.name) {
    body.name = name;
  }

  for (const key of TEXT_FIELDS) {
    const next = draft[key].trim();
    if (next !== (shop[key] ?? "")) body[key] = next;
  }

  // Change-only: the API has no spelling for "no category", so the empty option is
  // offered only while the shop has not chosen one (see the field below).
  if (draft.categoryId && draft.categoryId !== (shop.categoryId ?? "")) {
    body.categoryId = draft.categoryId;
  }

  // `Number("")` is 0, so the empty case is tested before the value is read.
  const radiusText = draft.deliveryRadiusKm.trim();
  const radius = Number(radiusText);
  if (
    !radiusText ||
    !Number.isFinite(radius) ||
    radius < LIMITS.radius.min ||
    radius > LIMITS.radius.max
  ) {
    problems.deliveryRadiusKm = `Coverage must be between ${LIMITS.radius.min} and ${LIMITS.radius.max} km.`;
  } else if (radius !== shop.deliveryRadiusKm) {
    body.deliveryRadiusKm = radius;
  }

  const minText = draft.minOrder.trim();
  const minOrder = Number(minText);
  if (!minText || !Number.isInteger(minOrder) || minOrder < 0) {
    problems.minOrder = "A minimum order is a whole number of rupees — 0 for none.";
  } else if (minOrder > LIMITS.minOrder.max) {
    problems.minOrder = "That is more than the field can hold. Enter a smaller amount.";
  } else if (minOrder !== shop.minOrder) {
    body.minOrder = minOrder;
  }

  if (draft.isOpen !== shop.isOpen) body.isOpen = draft.isOpen;
  if (draft.soloMode !== shop.soloMode) body.soloMode = draft.soloMode;

  return { body, problems };
}

/* ── the form ─────────────────────────────────────────────────────────────── */

function ShopSettingsForm({
  shop,
  categories,
  editable,
  saving,
  error,
  saved,
  onEdit,
  onSave,
  onLocationCaptured,
}: {
  shop: SellerShop;
  /** `null` until the category request answers; `[]` once it has failed or is empty. */
  categories: Category[] | null;
  editable: boolean;
  saving: boolean;
  error: string | null;
  saved: string | null;
  onEdit: () => void;
  onSave: (body: ShopUpdateBody) => void;
  onLocationCaptured: () => Promise<void>;
}) {
  // Seeded from the live shop exactly once per mount. The parent remounts this
  // component after a successful save, so a re-seed always comes from a refetched
  // row and never from what was typed.
  const [draft, setDraft] = React.useState<Draft>(() => draftOf(shop));

  const { body, problems } = review(shop, draft);
  const changed = Object.keys(body).length;
  const blocked = Object.keys(problems).length > 0;

  function patch(next: Partial<Draft>) {
    onEdit();
    setDraft((prev) => ({ ...prev, ...next }));
  }

  const categoryList = categories ?? [];
  const chooseCategory = editable && categoryList.length > 0;
  const categoryName = categoryList.find((c) => c.id === shop.categoryId)?.en ?? null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!editable || saving || blocked || changed === 0) return;
        onSave(body);
      }}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionTitle icon={<Store className="h-4 w-4" />} title="Shop profile" />

          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={shop.status === "ACTIVE" ? "green" : "marigold"}>
                {shop.statusLabel}
              </Badge>
              {shop.verified && <Badge tone="blue">Verified</Badge>}
              {shop.restricted && <Badge tone="ink">Limited access</Badge>}
            </div>
            {shop.restricted && shop.restrictionReason && (
              <p className="rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-500">
                {shop.restrictionReason}
              </p>
            )}
            {shop.statusReason && !shop.restricted && (
              <p className="rounded-xl bg-ink-50 px-3 py-2 text-xs text-ink-500">
                {shop.statusReason}
              </p>
            )}
          </div>

          <div className="mt-4 space-y-4">
            <TextField
              label="Shop name"
              required
              editable={editable}
              value={draft.name}
              onChange={(v) => patch({ name: v })}
              maxLength={LIMITS.name.max}
              problem={problems.name}
              placeholder="The name customers search for"
            />

            <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
              <TextField
                label="Name in Nepali"
                hint="Optional"
                deva
                editable={editable}
                value={draft.nameNp}
                onChange={(v) => patch({ nameNp: v })}
                maxLength={LIMITS.nameNp}
                placeholder="पसलको नाम"
              />
              <TextField
                label="Emoji"
                hint="Optional"
                editable={editable}
                value={draft.emoji}
                onChange={(v) => patch({ emoji: v })}
                maxLength={LIMITS.emoji}
                className="text-center"
                placeholder="🛒"
              />
            </div>

            <TextField
              label="Description"
              hint="Shown on your shop page"
              rows={3}
              editable={editable}
              value={draft.description}
              onChange={(v) => patch({ description: v })}
              maxLength={LIMITS.description}
              placeholder="A line or two about what you sell…"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Phone"
                hint="How customers reach you"
                editable={editable}
                value={draft.phone}
                onChange={(v) => patch({ phone: v })}
                maxLength={LIMITS.phone}
                placeholder="98…"
              />
              <TextField
                label="Area"
                hint="Your neighbourhood"
                editable={editable}
                value={draft.area}
                onChange={(v) => patch({ area: v })}
                maxLength={LIMITS.area}
                placeholder="e.g. Jhamsikhel"
              />
            </div>

            <TextField
              label="Address"
              editable={editable}
              value={draft.fullAddress}
              onChange={(v) => patch({ fullAddress: v })}
              maxLength={LIMITS.fullAddress}
              placeholder="Street, landmark, city"
            />

            <FieldShell
              label="Category"
              editable={chooseCategory}
              hint={
                categories === null
                  ? "Reading the category list…"
                  : categoryList.length === 0
                    ? "Category list unavailable"
                    : shop.categoryId
                      ? "Can be changed, not removed"
                      : "Optional"
              }
            >
              {chooseCategory ? (
                <select
                  value={draft.categoryId}
                  onChange={(e) => patch({ categoryId: e.target.value })}
                  className={cn(inputCls, "appearance-none")}
                >
                  {/*
                    "No category" exists only while the shop has none. `categoryId`
                    is a nullable column whose DTO field refuses `null` and has no
                    empty-string meaning, so once a category is set the API has no
                    way to unset it — and an option that cannot work should not be
                    in the list.
                  */}
                  {shop.categoryId === null && <option value="">No category</option>}
                  {categoryList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.en}
                    </option>
                  ))}
                  {shop.categoryId !== null &&
                    !categoryList.some((c) => c.id === shop.categoryId) && (
                      <option value={shop.categoryId}>Current category</option>
                    )}
                </select>
              ) : (
                <ReadValue value={categoryName ?? (shop.categoryId ? "Set" : "")} />
              )}
            </FieldShell>

            <div className="border-t border-ink-100 pt-4">
              <BoolField
                label="Taking orders"
                hint="Turn this off and customers can browse but not order."
                editable={editable}
                checked={draft.isOpen}
                onChange={(v) => patch({ isOpen: v })}
                onLabel="Open"
                offLabel="Closed"
              />
            </div>

            <FieldShell label="Your role here" editable={false} hint="Set by your shop’s owner">
              <ReadValue value={shop.roleName} />
            </FieldShell>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={<Clock className="h-4 w-4" />} title="Opening hours" />
          <div className="mt-4">
            <TextField
              label="Hours as customers see them"
              hint="One line, in your own words"
              editable={editable}
              value={draft.hours}
              onChange={(v) => patch({ hours: v })}
              maxLength={LIMITS.hours}
              placeholder="e.g. 6:30am – 9pm, closed Saturday"
            />
          </div>
          <p className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-500">
            This is free text on your shop, not a schedule GoPasal acts on — nothing opens or closes
            your shop automatically. “Taking orders” above is the switch that does.
          </p>
        </Card>

        <Card className="p-5">
          <SectionTitle icon={<Bike className="h-4 w-4" />} title="Delivery &amp; coverage" />
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Coverage radius"
                hint={`${LIMITS.radius.min}–${LIMITS.radius.max} km`}
                editable={editable}
                value={draft.deliveryRadiusKm}
                onChange={(v) => patch({ deliveryRadiusKm: v })}
                problem={problems.deliveryRadiusKm}
                readValue={`${shop.deliveryRadiusKm} km`}
              />
              <NumberField
                label="Minimum order"
                hint="Rupees — 0 for none"
                editable={editable}
                value={draft.minOrder}
                onChange={(v) => patch({ minOrder: v })}
                problem={problems.minOrder}
                readValue={shop.minOrder > 0 ? rs(shop.minOrder) : "No minimum"}
              />
            </div>

            <BoolField
              label="Solo mode"
              hint="You accept and personally deliver every order."
              editable={editable}
              checked={draft.soloMode}
              onChange={(v) => patch({ soloMode: v })}
              onLabel="On"
              offLabel="Off"
            />

            <div className="border-t border-ink-100 pt-4">
              <ShopLocationCapture
                target={{ kind: "shop", id: shop.id }}
                current={{
                  lat: shop.lat,
                  lng: shop.lng,
                  accuracyM: shop.locationAccuracyM,
                  capturedAt: shop.locationCapturedAt,
                }}
                editable={editable}
                onCaptured={onLocationCaptured}
              />
            </div>
          </div>

          <p className="mt-3 text-xs text-ink-400">
            You only receive orders from customers inside your coverage radius, measured from this
            pin.
          </p>
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-crimson-50/70 px-3.5 py-3 text-xs text-crimson-800">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              GoPasal never promises customers a fixed delivery time on your behalf. You set the pace
              and share an honest handoff window with each customer directly.
            </span>
          </div>
        </Card>

        {/*
          Everything on this card is read-only for the same reason and it is not
          "not wired yet": `codEnabled` and `onlinePaymentEnabled` are columns that
          appear in no request body in any scope, and GoPasal has no route at all
          that accepts shop artwork. There is deliberately no payout account,
          balance or settlement figure either — none of it is in what the API
          returns, the finance side of the platform is not built, and an invented
          payout account is the one placeholder a shopkeeper could act on and lose
          money over.
        */}
        <Card className="p-5">
          <SectionTitle icon={<Wallet className="h-4 w-4" />} title="Payments" />
          <div className="mt-4 space-y-4">
            <FieldShell label="Cash on delivery" editable={false} hint="Set with your approval">
              <StateChip on={shop.codEnabled} onLabel="Accepted" offLabel="Not accepted" />
            </FieldShell>
            <FieldShell label="Online payment" editable={false} hint="Set with your approval">
              <StateChip on={shop.onlinePaymentEnabled} onLabel="Accepted" offLabel="Not accepted" />
            </FieldShell>
          </div>
          <p className="mt-4 text-xs text-ink-400">
            Which payment methods your shop offers travels with your approval — no seller request
            accepts these two, so there is nothing this screen could save. Ask your GoPasal contact to
            change them.
          </p>
          <p className="mt-2 text-xs text-ink-400">
            Your logo and cover picture are the same: GoPasal has no route that accepts shop artwork,
            so there is no picker here rather than one that could not save.
          </p>
          <p className="mt-2 text-xs text-ink-400">
            Your verified payout destination comes from the approved registration application. See
            Finance for escrow, COD commission, refund adjustments and settlement references.
          </p>
        </Card>
      </div>

      {editable && (
        <div className="sticky bottom-4 z-10 mt-4">
          <Card className="flex flex-wrap items-center justify-between gap-3 p-4 shadow-lg">
            <div className="min-w-0 flex-1 text-sm">
              {error ? (
                <InlineError message={error} />
              ) : saved ? (
                <p className="inline-flex items-center gap-1.5 font-medium text-[#0B7E58]">
                  <CheckCircle2 className="h-4 w-4" /> Saved. GoPasal now has these details for{" "}
                  {saved}.
                </p>
              ) : blocked ? (
                <p className="font-medium text-[#c02636]">
                  One field can’t be saved as it is — see the note under it.
                </p>
              ) : changed === 0 ? (
                <p className="text-ink-400">Nothing changed yet.</p>
              ) : (
                <p className="text-ink-600">
                  {changed} change{changed === 1 ? "" : "s"} ready to save.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={saving || changed === 0}
                onClick={() => {
                  onEdit();
                  setDraft(draftOf(shop));
                }}
              >
                Discard
              </Button>
              <Button type="submit" disabled={saving || blocked || changed === 0}>
                {saving ? <Spinner /> : <Save className="h-4 w-4" />} Save changes
              </Button>
            </div>
          </Card>
        </div>
      )}
    </form>
  );
}

/* ── field plumbing ───────────────────────────────────────────────────────── */

const inputCls =
  "h-11 w-full rounded-xl border border-ink-200 px-3 text-sm outline-none focus:border-crimson-300";

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-crimson-50 text-crimson-600">
        {icon}
      </span>
      <h2 className="font-semibold text-ink-900">{title}</h2>
    </div>
  );
}

/**
 * One field, editable or not.
 *
 * The wrapper is a `<label>` only when there is a control inside it to label; a
 * read-only value gets a `<div>`, because a label pointing at nothing is a lie to a
 * screen reader. The `hint` is where a read-only field says *why* — "Set with your
 * approval" reads differently from a greyed-out input, which always implies that
 * some permission would unlock it.
 */
function FieldShell({
  label,
  hint,
  problem,
  editable,
  required,
  children,
}: {
  label: string;
  hint?: string;
  problem?: string;
  editable: boolean;
  required?: boolean;
  children: React.ReactNode;
}) {
  const Tag = editable ? "label" : "div";
  return (
    <Tag className="block">
      <span className="mb-1 flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink-700">
        {label}
        {required && editable && <span className="text-[#c02636]">*</span>}
        {hint && <span className="font-normal text-ink-400">· {hint}</span>}
      </span>
      {children}
      {problem && <span className="mt-1 block text-xs font-medium text-[#c02636]">{problem}</span>}
    </Tag>
  );
}

/**
 * A value with nothing to type into.
 *
 * An empty value reads "Not set" in muted type rather than as a blank gap: the
 * difference between "we don't have this" and "the row failed to render" has to be
 * visible on a screen whose whole job is showing what GoPasal holds.
 */
function ReadValue({ value }: { value: React.ReactNode }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <span className={empty ? "block text-sm text-ink-300" : "block text-sm font-medium text-ink-800"}>
      {empty ? "Not set" : value}
    </span>
  );
}

function TextField({
  label,
  hint,
  value,
  onChange,
  editable,
  placeholder,
  maxLength,
  problem,
  rows,
  required,
  deva,
  className,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  editable: boolean;
  placeholder?: string;
  /** The server's `@MaxLength`, mirrored so the field simply stops accepting more. */
  maxLength: number;
  problem?: string;
  rows?: number;
  required?: boolean;
  deva?: boolean;
  className?: string;
}) {
  return (
    <FieldShell
      label={label}
      hint={hint}
      problem={problem}
      editable={editable}
      required={required}
    >
      {editable ? (
        rows ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            maxLength={maxLength}
            placeholder={placeholder}
            className={cn(inputCls, "h-auto py-2.5", deva && "deva", className)}
          />
        ) : (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            maxLength={maxLength}
            placeholder={placeholder}
            className={cn(inputCls, deva && "deva", className)}
          />
        )
      ) : (
        <ReadValue value={value} />
      )}
    </FieldShell>
  );
}

/**
 * A number held as text.
 *
 * The body validation runs without implicit conversion, so `"27.7"` is a 400 —
 * `review` is what turns this text into a real `number`. Keystrokes are filtered to
 * the characters a number can contain rather than reformatted, because an input that
 * rewrites what is being typed is impossible to type into.
 */
function NumberField({
  label,
  hint,
  value,
  onChange,
  editable,
  problem,
  readValue,
  signed,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  editable: boolean;
  problem?: string;
  /** How the value reads when it cannot be edited — with its unit, where it has one. */
  readValue: React.ReactNode;
  signed?: boolean;
}) {
  return (
    <FieldShell label={label} hint={hint} problem={problem} editable={editable}>
      {editable ? (
        <input
          value={value}
          inputMode="decimal"
          onChange={(e) => onChange(e.target.value.replace(signed ? /[^\d.-]/g : /[^\d.]/g, ""))}
          className={inputCls}
        />
      ) : (
        <ReadValue value={readValue} />
      )}
    </FieldShell>
  );
}

function BoolField({
  label,
  hint,
  checked,
  onChange,
  editable,
  onLabel,
  offLabel,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  editable: boolean;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-700">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-ink-400">{hint}</p>}
      </div>
      {editable ? (
        <Switch checked={checked} onChange={onChange} label={label} />
      ) : (
        <StateChip on={checked} onLabel={onLabel} offLabel={offLabel} />
      )}
    </div>
  );
}

/**
 * A boolean nobody on this screen can change.
 *
 * A chip rather than a disabled switch: at 50% opacity a toggle is both harder to
 * read and a promise that the right permission would unlock it, which is false for
 * a column no request body accepts.
 */
function StateChip({ on, onLabel, offLabel }: { on: boolean; onLabel: string; offLabel: string }) {
  return <Badge tone={on ? "green" : "ink"}>{on ? onLabel : offLabel}</Badge>;
}

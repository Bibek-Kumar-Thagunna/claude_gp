"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Coins,
  LockKeyhole,
  Minus,
  Package,
  Plus,
  Send,
  Share2,
  Trash2,
  UsersRound,
  Wallet,
} from "lucide-react";
import { Button, Container } from "@/components/primitives";
import { useAuth } from "@/components/providers";
import {
  customerApi,
  getShop,
  type Address,
  type CheckoutQuoteWire,
  type CouponOfferWire,
  type GroupDraftItemWire,
  type GroupOrderWire,
  type PaymentMethodWire,
} from "@/lib/api/customer";
import type { Store } from "@/lib/data";
import { rs } from "@/lib/format";
import { continuePayment } from "@/lib/payment-action";

type Candidate = {
  key: string;
  productId: string;
  variantId: string | null;
  name: string;
  option: string;
  price: number;
};

function candidates(store: Store): Candidate[] {
  return store.products.flatMap<Candidate>((product): Candidate[] =>
    product.variants.length
      ? product.variants.map((variant) => ({
          key: `${product.id}:${variant.id}`,
          productId: product.id,
          variantId: variant.id,
          name: product.name,
          option: variant.name,
          price: variant.price,
        }))
      : [
          {
            key: `${product.id}:`,
            productId: product.id,
            variantId: null,
            name: product.name,
            option: product.unit,
            price: product.price,
          },
        ],
  );
}

function itemKey(item: Pick<GroupDraftItemWire, "productId" | "variantId">) {
  return `${item.productId}:${item.variantId ?? ""}`;
}

function readError(cause: unknown) {
  return cause instanceof Error ? cause.message : "Something went wrong";
}

export function GroupOrderRoom({ id }: { id: string }) {
  const auth = useAuth();
  const router = useRouter();
  const [group, setGroup] = React.useState<GroupOrderWire | null>(null);
  const [store, setStore] = React.useState<Store | null>(null);
  const [draft, setDraft] = React.useState<Record<string, number>>({});
  const [dirty, setDirty] = React.useState(false);
  const dirtyRef = React.useRef(false);
  const [addresses, setAddresses] = React.useState<Address[]>([]);
  const [addressId, setAddressId] = React.useState("");
  const [paymentMethods, setPaymentMethods] = React.useState<PaymentMethodWire[]>([]);
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethodWire["id"]>("COD");
  const [offers, setOffers] = React.useState<CouponOfferWire[]>([]);
  const [couponCode, setCouponCode] = React.useState("");
  const [couponApplied, setCouponApplied] = React.useState(false);
  const [useGoCoins, setUseGoCoins] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [quote, setQuote] = React.useState<CheckoutQuoteWire | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [quoteBusy, setQuoteBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const quoteGroupId = group?.id;
  const quoteGroupStatus = group?.status;
  const quoteHostId = group?.hostId;

  React.useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const syncDraft = React.useCallback(
    (nextGroup: GroupOrderWire) => {
      if (dirtyRef.current || !auth.user) return;
      const mine = nextGroup.participants.find((row) => row.userId === auth.user?.id);
      setDraft(Object.fromEntries((mine?.items ?? []).map((item) => [itemKey(item), item.qty])));
    },
    [auth.user],
  );

  const loadGroup = React.useCallback(async () => {
    const next = await customerApi.groupOrder(id);
    setGroup(next);
    syncDraft(next);
    return next;
  }, [id, syncDraft]);

  React.useEffect(() => {
    if (auth.status === "anonymous") {
      router.replace(`/login?next=${encodeURIComponent(`/group-orders/${id}`)}`);
      return;
    }
    if (auth.status !== "authenticated") return;
    let active = true;
    void loadGroup()
      .then(async (next) => {
        const [shop, addressRows, methods, couponRows] = await Promise.all([
          getShop(next.shop.slug),
          customerApi.addresses(),
          customerApi.paymentMethods(next.shop.id),
          customerApi.customerCoupons(next.shop.slug),
        ]);
        if (!active) return;
        setStore(shop);
        setAddresses(addressRows);
        setAddressId(addressRows.find((row) => row.isDefault)?.id ?? addressRows[0]?.id ?? "");
        setPaymentMethods(methods);
        setPaymentMethod(methods[0]?.id ?? "COD");
        setOffers(couponRows);
      })
      .catch((cause) => active && setError(readError(cause)))
      .finally(() => active && setLoading(false));
    const timer = window.setInterval(() => void loadGroup().catch(() => undefined), 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [auth.status, id, loadGroup, router]);

  React.useEffect(() => {
    if (
      !quoteGroupId ||
      quoteGroupStatus !== "LOCKED" ||
      !addressId ||
      quoteHostId !== auth.user?.id
    ) {
      setQuote(null);
      return;
    }
    const controller = new AbortController();
    setQuoteBusy(true);
    void customerApi
      .groupOrderQuote(
        quoteGroupId,
        {
          addressId,
          couponCode: couponApplied && couponCode.trim() ? couponCode.trim() : undefined,
          useGoCoins,
        },
        controller.signal,
      )
      .then((result) => {
        setQuote(result);
        setError(null);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        const message = readError(cause);
        setQuote(null);
        if (/coupon already used/i.test(message)) {
          const attemptedCode = couponCode.trim().toUpperCase();
          setOffers((current) => current.filter((offer) => offer.code !== attemptedCode));
          setCouponCode("");
          setCouponApplied(false);
          setError(
            "You have already used this offer. It has been removed from your available offers.",
          );
        } else {
          setError(message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setQuoteBusy(false);
      });
    return () => controller.abort();
  }, [
    addressId,
    auth.user?.id,
    couponApplied,
    couponCode,
    quoteGroupId,
    quoteGroupStatus,
    quoteHostId,
    useGoCoins,
  ]);

  if (auth.status !== "authenticated" || loading) {
    return <Container className="py-16 text-ink-500">Opening the group order…</Container>;
  }
  if (!group || !store) {
    return (
      <Container className="py-16">
        <h1 className="text-2xl font-bold text-ink-900">Group order unavailable</h1>
        <p className="mt-2 text-ink-600">{error ?? "This group could not be found."}</p>
        <Button href="/group-orders" className="mt-6">
          Back to group orders
        </Button>
      </Container>
    );
  }

  const allCandidates = candidates(store);
  const byKey = new Map(allCandidates.map((row) => [row.key, row]));
  const isHost = group.hostId === auth.user?.id;
  const canEdit = group.status === "OPEN";
  const expires = group.expiresAt ? new Date(group.expiresAt) : null;
  const expired = expires ? expires.getTime() <= Date.now() : false;
  const combined = group.participants.flatMap((person) => person.items);
  const combinedSubtotal = combined.reduce(
    (sum, item) => sum + (byKey.get(itemKey(item))?.price ?? 0) * item.qty,
    0,
  );

  const setQuantity = (key: string, qty: number) => {
    setDraft((current) => {
      const next = { ...current };
      if (qty <= 0) delete next[key];
      else next[key] = Math.min(99, qty);
      return next;
    });
    setDirty(true);
  };

  const saveItems = async () => {
    setBusy(true);
    try {
      const items = Object.entries(draft).flatMap(([key, qty]) => {
        const row = byKey.get(key);
        return row ? [{ productId: row.productId, variantId: row.variantId, qty }] : [];
      });
      const next = await customerApi.setGroupItems(group.id, items);
      setGroup(next);
      setDirty(false);
      dirtyRef.current = false;
      setError(null);
    } catch (cause) {
      setError(readError(cause));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/group-orders?code=${encodeURIComponent(group.code)}`;
    const text = `Join my GoPasal order from ${group.shop.name}. Code: ${group.code}`;
    if (navigator.share) await navigator.share({ title: "Join my GoPasal order", text, url });
    else {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
    }
  };

  const action = async (kind: "lock" | "cancel" | "leave") => {
    setBusy(true);
    try {
      if (kind === "lock") setGroup(await customerApi.lockGroupOrder(group.id));
      else if (kind === "cancel") setGroup(await customerApi.cancelGroupOrder(group.id));
      else {
        await customerApi.leaveGroupOrder(group.id);
        router.push("/group-orders");
      }
      setError(null);
    } catch (cause) {
      setError(readError(cause));
    } finally {
      setBusy(false);
    }
  };

  const place = async () => {
    if (!addressId || !quote) return;
    setBusy(true);
    try {
      const order = await customerApi.placeGroupOrder(group.id, {
        addressId,
        paymentMethod,
        couponCode: couponApplied && couponCode.trim() ? couponCode.trim() : undefined,
        note: note.trim() || undefined,
        useGoCoins,
      });
      if (order.payment && continuePayment(order.payment)) return;
      router.push(`/orders/${order.id}`);
    } catch (cause) {
      setError(readError(cause));
      setBusy(false);
    }
  };

  return (
    <main className="min-h-[75vh] bg-gradient-to-b from-paper/60 to-white py-6 sm:py-10">
      <Container>
        <Link
          href="/group-orders"
          className="inline-flex items-center gap-2 text-sm font-bold text-ink-600 hover:text-crimson-600"
        >
          <ArrowLeft className="h-4 w-4" /> All group orders
        </Link>
        <div className="mt-5 rounded-3xl bg-ink-900 p-5 text-white shadow-card sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold">
                  {group.status}
                </span>
                {isHost && (
                  <span className="rounded-full bg-crimson-500 px-2.5 py-1 text-xs font-bold">
                    You’re the host
                  </span>
                )}
              </div>
              <h1 className="mt-3 text-2xl font-extrabold sm:text-3xl">
                Order together from {group.shop.name}
              </h1>
              <p className="mt-2 text-sm text-white/65">
                {group.participants.length} participant{group.participants.length === 1 ? "" : "s"}
                {expires
                  ? ` · ${expired ? "Invite expired" : `Open until ${expires.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}`
                  : ""}
              </p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4 sm:min-w-64">
              <span className="text-xs font-bold uppercase tracking-wider text-white/50">
                Private invite code
              </span>
              <strong className="mt-1 block font-mono text-2xl tracking-widest">
                {group.code}
              </strong>
              <button
                type="button"
                onClick={() => void share()}
                className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-white"
              >
                <Share2 className="h-4 w-4" /> {copied ? "Copied" : "Share invite"}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        {group.status === "PLACED" && group.order ? (
          <section className="mt-6 rounded-3xl border border-green-100 bg-[#EAF7EF] p-7 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-[#0B7E58]" />
            <h2 className="mt-3 text-2xl font-bold text-ink-900">Combined order placed</h2>
            <p className="mt-1 text-ink-600">
              Order {group.order.code} now follows the normal shop and delivery workflow.
            </p>
            <Button href={`/orders/${group.order.id}`} className="mt-5">
              Track the order
            </Button>
          </section>
        ) : group.status === "CANCELLED" ? (
          <section className="mt-6 rounded-3xl border border-ink-200 bg-white p-8 text-center">
            <h2 className="text-xl font-bold text-ink-900">This group was cancelled</h2>
            <Button href="/shops" variant="outline" className="mt-5">
              Browse shops
            </Button>
          </section>
        ) : (
          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.75fr)]">
            <div className="space-y-6">
              <section className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-ink-900">Your items</h2>
                    <p className="mt-1 text-sm text-ink-500">
                      Only you can edit this part of the shared basket.
                    </p>
                  </div>
                  {dirty && (
                    <span className="text-xs font-bold text-amber-700">Unsaved changes</span>
                  )}
                </div>
                <div className="mt-5 divide-y divide-ink-100">
                  {allCandidates.map((item) => {
                    const qty = draft[item.key] ?? 0;
                    return (
                      <div key={item.key} className="flex items-center gap-3 py-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-paper text-crimson-500">
                          <Package className="h-5 w-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <strong className="block truncate text-sm text-ink-900">
                            {item.name}
                          </strong>
                          <span className="text-xs text-ink-500">
                            {item.option} · {rs(item.price)}
                          </span>
                        </div>
                        <div className="flex h-10 items-center rounded-full border border-ink-200">
                          <button
                            type="button"
                            disabled={!canEdit || qty === 0}
                            onClick={() => setQuantity(item.key, qty - 1)}
                            aria-label={`Remove one ${item.name}`}
                            className="grid h-10 w-9 place-items-center disabled:opacity-30"
                          >
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="w-7 text-center text-sm font-bold">{qty}</span>
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => setQuantity(item.key, qty + 1)}
                            aria-label={`Add one ${item.name}`}
                            className="grid h-10 w-9 place-items-center rounded-r-full bg-crimson-50 text-crimson-700 disabled:opacity-30"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {canEdit && (
                  <Button
                    disabled={busy || !dirty}
                    onClick={() => void saveItems()}
                    className="mt-5 w-full sm:w-auto"
                  >
                    {busy ? "Saving…" : "Save my items"} <Check className="h-4 w-4" />
                  </Button>
                )}
                {!canEdit && (
                  <p className="mt-5 rounded-xl bg-ink-100 p-3 text-sm font-semibold text-ink-600">
                    <LockKeyhole className="mr-2 inline h-4 w-4" />
                    The host locked this basket, so items can no longer change.
                  </p>
                )}
              </section>

              {isHost && group.status === "LOCKED" && (
                <CheckoutPanel
                  addresses={addresses}
                  addressId={addressId}
                  setAddressId={setAddressId}
                  paymentMethods={paymentMethods}
                  paymentMethod={paymentMethod}
                  setPaymentMethod={setPaymentMethod}
                  offers={offers}
                  couponCode={couponCode}
                  setCouponCode={(value) => {
                    setCouponCode(value);
                    setCouponApplied(false);
                  }}
                  couponApplied={couponApplied}
                  setCouponApplied={setCouponApplied}
                  useGoCoins={useGoCoins}
                  setUseGoCoins={setUseGoCoins}
                  note={note}
                  setNote={setNote}
                  quote={quote}
                  quoteBusy={quoteBusy}
                  busy={busy}
                  place={place}
                />
              )}
            </div>

            <aside className="space-y-5">
              <section className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card">
                <h2 className="flex items-center gap-2 font-bold text-ink-900">
                  <UsersRound className="h-5 w-5 text-crimson-500" /> People & baskets
                </h2>
                <ul className="mt-4 divide-y divide-ink-100">
                  {group.participants.map((person) => {
                    const total = person.items.reduce(
                      (sum, item) => sum + (byKey.get(itemKey(item))?.price ?? 0) * item.qty,
                      0,
                    );
                    return (
                      <li key={person.id} className="flex items-center justify-between gap-3 py-3">
                        <div>
                          <strong className="block text-sm text-ink-900">
                            {person.userId === auth.user?.id
                              ? "You"
                              : (person.user.name ?? "Participant")}
                            {person.userId === group.hostId ? " · Host" : ""}
                          </strong>
                          <span className="text-xs text-ink-500">
                            {person.items.reduce((sum, item) => sum + item.qty, 0)} items
                          </span>
                        </div>
                        <strong className="text-sm text-ink-900">{rs(total)}</strong>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4 flex justify-between border-t border-dashed border-ink-200 pt-4">
                  <span className="font-bold text-ink-900">Combined subtotal</span>
                  <strong className="text-lg text-ink-900">{rs(combinedSubtotal)}</strong>
                </div>
              </section>
              <section className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card">
                <h2 className="font-bold text-ink-900">Group controls</h2>
                <div className="mt-4 grid gap-2">
                  {isHost && group.status === "OPEN" && (
                    <Button
                      disabled={busy || dirty || combined.length === 0 || expired}
                      onClick={() => void action("lock")}
                    >
                      <LockKeyhole className="h-4 w-4" /> Lock and review checkout
                    </Button>
                  )}
                  {isHost && (
                    <Button variant="outline" disabled={busy} onClick={() => void action("cancel")}>
                      <Trash2 className="h-4 w-4" /> Cancel group
                    </Button>
                  )}
                  {!isHost && group.status === "OPEN" && (
                    <Button variant="outline" disabled={busy} onClick={() => void action("leave")}>
                      Leave group
                    </Button>
                  )}
                </div>
                {isHost && dirty && (
                  <p className="mt-3 text-xs text-amber-700">
                    Save your item changes before locking.
                  </p>
                )}
              </section>
            </aside>
          </div>
        )}
      </Container>
    </main>
  );
}

function CheckoutPanel(props: {
  addresses: Address[];
  addressId: string;
  setAddressId: (id: string) => void;
  paymentMethods: PaymentMethodWire[];
  paymentMethod: PaymentMethodWire["id"];
  setPaymentMethod: (id: PaymentMethodWire["id"]) => void;
  offers: CouponOfferWire[];
  couponCode: string;
  setCouponCode: (code: string) => void;
  couponApplied: boolean;
  setCouponApplied: (value: boolean) => void;
  useGoCoins: boolean;
  setUseGoCoins: (value: boolean) => void;
  note: string;
  setNote: (value: string) => void;
  quote: CheckoutQuoteWire | null;
  quoteBusy: boolean;
  busy: boolean;
  place: () => Promise<void>;
}) {
  return (
    <section className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-crimson-50 text-crimson-600">
          <Wallet className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-xl font-bold text-ink-900">Host checkout</h2>
          <p className="text-sm text-ink-500">
            Choose one delivery address and payment method for the combined order.
          </p>
        </div>
      </div>
      {props.addresses.length === 0 ? (
        <div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
          Add a pinned delivery address before placing the order.{" "}
          <Link href="/account" className="font-bold underline">
            Manage addresses
          </Link>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {props.addresses.map((address) => (
            <label
              key={address.id}
              className={`cursor-pointer rounded-2xl border p-4 ${props.addressId === address.id ? "border-crimson-400 bg-crimson-50" : "border-ink-200"}`}
            >
              <input
                type="radio"
                className="sr-only"
                checked={props.addressId === address.id}
                onChange={() => props.setAddressId(address.id)}
              />
              <strong className="block text-sm text-ink-900">{address.label}</strong>
              <span className="mt-1 block text-xs text-ink-500">
                {address.fullAddress} · {address.area}
              </span>
            </label>
          ))}
        </div>
      )}
      <h3 className="mt-6 text-sm font-bold text-ink-900">Payment</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {props.paymentMethods.map((method) => (
          <label
            key={method.id}
            className={`cursor-pointer rounded-2xl border p-4 ${props.paymentMethod === method.id ? "border-crimson-400 bg-crimson-50" : "border-ink-200"}`}
          >
            <input
              type="radio"
              className="sr-only"
              checked={props.paymentMethod === method.id}
              onChange={() => props.setPaymentMethod(method.id)}
            />
            <strong className="block text-sm text-ink-900">{method.label}</strong>
            <span className="mt-1 block text-xs text-ink-500">{method.description}</span>
          </label>
        ))}
      </div>
      {props.offers.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-bold text-ink-900">Available offers</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {props.offers.map((offer) => (
              <button
                key={offer.code}
                type="button"
                onClick={() => {
                  props.setCouponCode(offer.code);
                  props.setCouponApplied(true);
                }}
                className="rounded-full border border-crimson-200 px-3 py-2 text-xs font-bold text-crimson-700"
              >
                {offer.title || offer.code}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <input
          value={props.couponCode}
          onChange={(event) => props.setCouponCode(event.target.value.toUpperCase())}
          placeholder="Coupon code"
          maxLength={64}
          className="min-w-0 flex-1 rounded-xl border border-ink-200 px-4 py-3 text-sm uppercase outline-none focus:border-crimson-400"
        />
        <Button
          variant="outline"
          onClick={() => props.setCouponApplied(Boolean(props.couponCode.trim()))}
        >
          {props.couponApplied ? "Applied" : "Apply"}
        </Button>
      </div>
      <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl bg-amber-50 p-4">
        <input
          type="checkbox"
          checked={props.useGoCoins}
          onChange={(event) => props.setUseGoCoins(event.target.checked)}
          className="h-4 w-4 accent-crimson-500"
        />
        <Coins className="h-5 w-5 text-amber-700" />
        <span className="text-sm font-semibold text-ink-800">Use eligible GoCoins</span>
      </label>
      <label className="mt-4 block text-sm font-bold text-ink-900">
        Note for the shop <span className="font-normal text-ink-400">(optional)</span>
        <textarea
          value={props.note}
          onChange={(event) => props.setNote(event.target.value)}
          maxLength={280}
          rows={3}
          className="mt-2 w-full resize-none rounded-xl border border-ink-200 p-3 text-sm font-normal outline-none focus:border-crimson-400"
        />
      </label>
      <div className="mt-5 rounded-2xl bg-paper p-4">
        <div className="flex justify-between text-sm text-ink-600">
          <span>Items</span>
          <strong>{props.quote ? rs(props.quote.subtotal) : "—"}</strong>
        </div>
        {props.quote && (
          <>
            <div className="mt-2 flex justify-between text-sm text-ink-600">
              <span>Delivery</span>
              <strong>{rs(props.quote.deliveryFee)}</strong>
            </div>
            {props.quote.discount > 0 && (
              <div className="mt-2 flex justify-between text-sm text-[#0B7E58]">
                <span>Offer</span>
                <strong>− {rs(props.quote.discount)}</strong>
              </div>
            )}
            {props.quote.loyaltyDiscount > 0 && (
              <div className="mt-2 flex justify-between text-sm text-[#0B7E58]">
                <span>GoCoins</span>
                <strong>− {rs(props.quote.loyaltyDiscount)}</strong>
              </div>
            )}
            <div className="mt-3 flex justify-between border-t border-dashed border-ink-200 pt-3 text-base">
              <span className="font-bold">Total</span>
              <strong className="text-xl">{rs(props.quote.total)}</strong>
            </div>
          </>
        )}
      </div>
      <Button
        disabled={
          props.busy ||
          props.quoteBusy ||
          !props.quote ||
          !props.quote.meetsMinOrder ||
          !props.addressId ||
          props.paymentMethods.length === 0
        }
        onClick={() => void props.place()}
        className="mt-5 w-full"
      >
        {props.busy ? "Placing…" : props.quoteBusy ? "Checking total…" : "Place combined order"}{" "}
        <Send className="h-4 w-4" />
      </Button>
    </section>
  );
}

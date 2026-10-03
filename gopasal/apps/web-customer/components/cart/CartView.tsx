"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  BadgePercent,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  LocateFixed,
  MapPin,
  Minus,
  Package,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trash2,
  Truck,
  Wallet,
} from "lucide-react";
import { useAuth, useCart } from "@/components/providers";
import { Button } from "@/components/primitives";
import {
  customerApi,
  type Address,
  type CheckoutQuoteWire,
  type CouponOfferWire,
  type OrderWire,
  type PaymentMethodWire,
} from "@/lib/api/customer";
import { rs } from "@/lib/format";
import { continuePayment } from "@/lib/payment-action";

type Step = "cart" | "checkout" | "done";

export function CartView() {
  const auth = useAuth();
  const cart = useCart();
  const [step, setStep] = React.useState<Step>("cart");
  const [addresses, setAddresses] = React.useState<Address[]>([]);
  const [addressId, setAddressId] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethodWire["id"]>("COD");
  const [paymentMethods, setPaymentMethods] = React.useState<PaymentMethodWire[]>([]);
  const [offers, setOffers] = React.useState<CouponOfferWire[]>([]);
  const [couponCode, setCouponCode] = React.useState("");
  const [couponDiscount, setCouponDiscount] = React.useState<number | null>(null);
  const [couponBusy, setCouponBusy] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [useGoCoins, setUseGoCoins] = React.useState(false);
  const [order, setOrder] = React.useState<OrderWire | null>(null);
  const [quote, setQuote] = React.useState<CheckoutQuoteWire | null>(null);
  const [quoteBusy, setQuoteBusy] = React.useState(false);
  const [quoteError, setQuoteError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const shopId = cart.store?.id;
  const shopSlug = cart.store?.slug;

  React.useEffect(() => {
    if (auth.status !== "authenticated") return;
    void customerApi
      .addresses()
      .then((rows) => {
        setAddresses(rows);
        setAddressId(rows.find((row) => row.isDefault)?.id ?? rows[0]?.id ?? "");
      })
      .catch((cause: unknown) => setError(readError(cause)));
  }, [auth.status]);

  React.useEffect(() => {
    if (auth.status !== "authenticated" || !shopId || !shopSlug) return;
    void Promise.all([customerApi.paymentMethods(shopId), customerApi.customerCoupons(shopSlug)])
      .then(([methods, nextOffers]) => {
        setPaymentMethods(methods);
        setOffers(nextOffers);
        setPaymentMethod((current) =>
          methods.some((method) => method.id === current) ? current : (methods[0]?.id ?? "COD"),
        );
      })
      .catch((cause: unknown) => setError(readError(cause)));
  }, [auth.status, shopId, shopSlug]);

  React.useEffect(() => {
    if (step !== "checkout" || !addressId || !shopId) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    const controller = new AbortController();
    setQuoteBusy(true);
    setQuoteError(null);
    void customerApi
      .checkoutQuote(
        {
          addressId,
          couponCode: couponDiscount != null && couponCode.trim() ? couponCode.trim() : undefined,
          useGoCoins,
        },
        controller.signal,
      )
      .then(setQuote)
      .catch((cause: unknown) => {
        const message = readError(cause);
        setQuote(null);
        if (/coupon already used/i.test(message)) {
          const attemptedCode = couponCode.trim().toUpperCase();
          setOffers((current) => current.filter((offer) => offer.code !== attemptedCode));
          setCouponCode("");
          setCouponDiscount(null);
          setQuoteError(null);
          setError(
            "You have already used this offer. It has been removed from your available offers.",
          );
        } else {
          setQuoteError(message);
        }
      })
      .finally(() => setQuoteBusy(false));
    return () => controller.abort();
  }, [addressId, couponCode, couponDiscount, shopId, step, useGoCoins]);

  async function applyCoupon(code = couponCode) {
    if (!code.trim()) return;
    setCouponBusy(true);
    setError(null);
    try {
      const quote = await customerApi.previewCoupon(code.trim().toUpperCase());
      setCouponCode(quote.code);
      setCouponDiscount(quote.discount);
    } catch (cause) {
      const message = readError(cause);
      setCouponDiscount(null);
      if (/coupon already used/i.test(message)) {
        const attemptedCode = code.trim().toUpperCase();
        setOffers((current) => current.filter((offer) => offer.code !== attemptedCode));
        setCouponCode("");
        setError(
          "You have already used this offer. It has been removed from your available offers.",
        );
      } else {
        setError(message);
      }
    } finally {
      setCouponBusy(false);
    }
  }

  async function placeOrder() {
    if (!addressId) {
      setError("Choose or add a delivery address first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const placed = await customerApi.checkout({
        addressId,
        paymentMethod,
        couponCode:
          couponDiscount != null && couponCode.trim() ? couponCode.trim() : undefined,
        note: note.trim() || undefined,
        useGoCoins,
      });
      setOrder(placed);
      setStep("done");
      await cart.reload();
      if (placed.payment && continuePayment(placed.payment)) return;
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) {
      setError(readError(cause));
    } finally {
      setBusy(false);
    }
  }

  if (auth.status === "loading")
    return <div className="gp-container py-16 text-ink-500">Loading your cart…</div>;
  if (auth.status === "anonymous")
    return (
      <Empty
        title="Sign in to use your cart"
        body="Your cart and orders stay safely connected to your account on every device."
        action="Sign in"
        href="/login?next=/cart"
      />
    );
  if (cart.count === 0 && step !== "done")
    return (
      <Empty
        title="Your cart is ready for something good"
        body="Add essentials from a verified local shop and they will appear here."
        action="Browse local shops"
        href="/shops"
      />
    );
  if (step === "done" && order) return <OrderPlaced order={order} />;

  const estimatedTotal =
    step === "checkout" && quote ? quote.total : Math.max(0, cart.subtotal - (couponDiscount ?? 0));
  const activeStep: "cart" | "checkout" = step === "cart" ? "cart" : "checkout";
  return (
    <div className="min-h-[70vh] bg-gradient-to-b from-paper/65 to-white pb-28 pt-6 sm:pb-16 sm:pt-10">
      <div className="gp-container">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href={cart.store ? `/store/${cart.store.slug}` : "/shops"}
              className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 transition hover:text-crimson-600"
            >
              <ArrowLeft className="h-4 w-4" /> Continue shopping
            </Link>
            <h1 className="font-display text-3xl font-extrabold text-ink-900 sm:text-4xl">
              {activeStep === "cart" ? "Your cart" : "Secure checkout"}
            </h1>
            {cart.store && (
              <p className="mt-1.5 flex items-center gap-2 text-sm text-ink-600">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-crimson-50 text-crimson-600">
                  <Truck className="h-4 w-4" />
                </span>{" "}
                Ordering from{" "}
                <Link
                  href={`/store/${cart.store.slug}`}
                  className="font-bold text-ink-900 hover:text-crimson-600"
                >
                  {cart.store.name}
                </Link>
              </p>
            )}
          </div>
          <CheckoutSteps current={activeStep} />
        </div>
        <div className="mt-7 grid items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,.75fr)]">
          <div>
            {activeStep === "cart" ? (
              <CartLines />
            ) : (
              <CheckoutForm
                subtotal={cart.subtotal}
                addresses={addresses}
                addressId={addressId}
                setAddressId={setAddressId}
                setAddresses={setAddresses}
                paymentMethods={paymentMethods}
                paymentMethod={paymentMethod}
                setPaymentMethod={setPaymentMethod}
                offers={offers}
                couponCode={couponCode}
                setCouponCode={(value) => {
                  setCouponCode(value);
                  setCouponDiscount(null);
                }}
                couponDiscount={couponDiscount}
                couponBusy={couponBusy}
                applyCoupon={applyCoupon}
                quote={quote}
                useGoCoins={useGoCoins}
                setUseGoCoins={setUseGoCoins}
                note={note}
                setNote={setNote}
              />
            )}
          </div>
          <Summary
            step={activeStep}
            count={cart.count}
            subtotal={cart.subtotal}
            estimatedTotal={estimatedTotal}
            discount={couponDiscount}
            quote={quote}
            quoteBusy={quoteBusy}
            meetsMinOrder={cart.meetsMinOrder}
            minOrder={cart.store?.minOrder ?? 0}
            busy={busy}
            addressReady={Boolean(addressId)}
            paymentReady={paymentMethods.length > 0}
            error={error ?? quoteError}
            next={() => {
              setStep("checkout");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            place={placeOrder}
          />
        </div>
        <div className="fixed inset-x-0 bottom-0 z-[75] border-t border-ink-100 bg-white/95 px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-12px_35px_rgba(30,23,27,.12)] backdrop-blur-md lg:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <div className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                Estimated total
              </span>
              <strong className="text-lg text-ink-900">{rs(estimatedTotal)}</strong>
            </div>
            {activeStep === "cart" ? (
              <Button
                disabled={!cart.meetsMinOrder}
                onClick={() => {
                  setStep("checkout");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Checkout <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                disabled={
                  busy ||
                  quoteBusy ||
                  !quote ||
                  !quote.meetsMinOrder ||
                  !addressId ||
                  paymentMethods.length === 0
                }
                onClick={() => void placeOrder()}
              >
                {busy ? "Placing…" : "Place order"} <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckoutSteps({ current }: { current: "cart" | "checkout" }) {
  const cartDone = current === "checkout";
  return (
    <ol className="flex w-full max-w-sm items-center sm:w-auto" aria-label="Checkout progress">
      {[
        { label: "Bag", done: true },
        { label: "Delivery & pay", done: cartDone },
        { label: "Confirmation", done: false },
      ].map((item, index) => (
        <React.Fragment key={item.label}>
          <li className="flex items-center gap-2">
            <span
              className={`grid h-7 w-7 place-items-center rounded-full text-xs font-black ${item.done ? "bg-crimson-500 text-white" : "bg-ink-100 text-ink-400"}`}
            >
              {item.done && index < (cartDone ? 2 : 1) ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                index + 1
              )}
            </span>
            <span
              className={`hidden text-xs font-bold xs:block ${item.done ? "text-ink-800" : "text-ink-400"}`}
            >
              {item.label}
            </span>
          </li>
          {index < 2 && (
            <span
              className={`mx-2 h-px min-w-6 flex-1 sm:w-8 ${cartDone && index === 0 ? "bg-crimson-300" : "bg-ink-200"}`}
            />
          )}
        </React.Fragment>
      ))}
    </ol>
  );
}

function CartLines() {
  const cart = useCart();
  return (
    <section className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card">
      <div className="flex items-center justify-between border-b border-ink-100 px-4 py-4 sm:px-6">
        <div>
          <h2 className="font-bold text-ink-900">Items in your bag</h2>
          <p className="text-xs text-ink-500">Quantities update immediately</p>
        </div>
        <button
          onClick={() => void cart.clear()}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold text-ink-500 transition hover:bg-crimson-50 hover:text-crimson-600"
        >
          <Trash2 className="h-3.5 w-3.5" /> Clear cart
        </button>
      </div>
      <ul className="divide-y divide-ink-100">
        {cart.lines.map((line) => (
          <li
            key={line.id}
            className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 p-4 sm:grid-cols-[76px_minmax(0,1fr)_auto] sm:items-center sm:gap-5 sm:p-6"
          >
            <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-crimson-50 to-paper text-crimson-500 sm:h-[76px] sm:w-[76px]">
              {line.image ? (
                <Image
                  src={line.image}
                  alt=""
                  width={76}
                  height={76}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : (
                <Package className="h-7 w-7" />
              )}
            </span>
            <div className="min-w-0">
              <h3 className="line-clamp-2 font-bold text-ink-900">{line.product.name}</h3>
              <p className="mt-1 text-sm text-ink-500">
                {line.variantName ?? line.product.unit} · {rs(line.product.price)} each
              </p>
              <strong className="mt-2 block text-base text-ink-900 sm:hidden">
                {rs(line.lineTotal)}
              </strong>
            </div>
            <div className="col-span-2 flex items-center justify-between sm:col-span-1 sm:gap-8">
              <div className="flex h-11 items-center rounded-full border border-ink-200 bg-white p-1 shadow-sm">
                <button
                  disabled={cart.loading}
                  onClick={() => void cart.setQuantity(line.id, line.qty - 1)}
                  className="grid h-9 w-9 place-items-center rounded-full text-ink-600 transition hover:bg-ink-100"
                  aria-label={
                    line.qty === 1 ? `Remove ${line.product.name}` : `Decrease ${line.product.name}`
                  }
                >
                  {line.qty === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                </button>
                <span className="w-9 text-center text-sm font-extrabold" aria-live="polite">
                  {line.qty}
                </span>
                <button
                  disabled={cart.loading}
                  onClick={() => void cart.setQuantity(line.id, line.qty + 1)}
                  className="grid h-9 w-9 place-items-center rounded-full bg-crimson-50 text-crimson-700 transition hover:bg-crimson-100"
                  aria-label={`Increase ${line.product.name}`}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <strong className="hidden min-w-20 text-right text-lg text-ink-900 sm:block">
                {rs(line.lineTotal)}
              </strong>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-start gap-3 bg-paper/70 px-4 py-4 text-sm text-ink-600 sm:px-6">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#0B7E58]" />
        <p>
          <strong className="text-ink-800">Prices are verified at checkout.</strong> Your shop
          receives the exact items and quantities shown here.
        </p>
      </div>
    </section>
  );
}

function Summary(props: {
  step: "cart" | "checkout";
  count: number;
  subtotal: number;
  estimatedTotal: number;
  discount: number | null;
  quote: CheckoutQuoteWire | null;
  quoteBusy: boolean;
  meetsMinOrder: boolean;
  minOrder: number;
  busy: boolean;
  addressReady: boolean;
  paymentReady: boolean;
  error: string | null;
  next: () => void;
  place: () => Promise<void>;
}) {
  return (
    <aside className="overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-card xl:sticky xl:top-24">
      <div className="p-5 sm:p-6">
        <h2 className="text-lg font-extrabold text-ink-900">Order summary</h2>
        <div className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between text-ink-600">
            <span>Items ({props.count})</span>
            <strong className="text-ink-900">{rs(props.subtotal)}</strong>
          </div>
          {props.discount != null && (
            <div className="flex justify-between font-semibold text-[#0B7E58]">
              <span>Offer savings</span>
              <strong>− {rs(props.discount)}</strong>
            </div>
          )}
          {props.quote && props.quote.loyaltyDiscount > 0 && (
            <div className="flex justify-between font-semibold text-[#0B7E58]">
              <span>GoCoins</span>
              <strong>− {rs(props.quote.loyaltyDiscount)}</strong>
            </div>
          )}
          {props.step === "checkout" && props.quote && (
            <div className="flex justify-between text-ink-600">
              <span>Delivery ({(props.quote.distanceMeters / 1000).toFixed(1)} km)</span>
              <strong className="text-ink-900">
                {props.quote.deliveryFee === 0 ? "Free" : rs(props.quote.deliveryFee)}
              </strong>
            </div>
          )}
          <div className="flex justify-between border-t border-dashed border-ink-200 pt-4 text-base">
            <span className="font-bold text-ink-900">Estimated total</span>
            <strong className="text-xl text-ink-900">
              {props.quoteBusy ? "Checking…" : rs(props.estimatedTotal)}
            </strong>
          </div>
        </div>
        <p className="mt-2 text-xs leading-5 text-ink-500">
          {props.step === "checkout" && props.quote
            ? "This total is server-confirmed for the selected address. It is checked again when you place the order."
            : "Select an address at checkout to confirm serviceability and the exact delivery fee."}
        </p>
        {!props.meetsMinOrder && (
          <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            Add {rs(Math.max(0, props.minOrder - props.subtotal))} more to reach this shop&apos;s
            minimum order.
          </div>
        )}
        {props.error && (
          <p role="alert" className="mt-4 rounded-xl bg-crimson-50 p-3 text-sm text-crimson-700">
            {props.error}
          </p>
        )}
        {props.step === "cart" ? (
          <Button disabled={!props.meetsMinOrder} className="mt-5 w-full" onClick={props.next}>
            Checkout securely <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            disabled={
              props.busy ||
              props.quoteBusy ||
              !props.quote ||
              !props.quote.meetsMinOrder ||
              !props.addressReady ||
              !props.paymentReady
            }
            className="mt-5 w-full"
            onClick={() => void props.place()}
          >
            {props.busy ? "Placing your order…" : "Place order securely"}{" "}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-ink-100 bg-paper/60 px-5 py-3 text-xs font-semibold text-ink-600">
        <ShieldCheck className="h-4 w-4 text-[#0B7E58]" /> Protected checkout · server-verified
        totals
      </div>
    </aside>
  );
}

function CheckoutForm(props: {
  subtotal: number;
  addresses: Address[];
  addressId: string;
  setAddressId: (id: string) => void;
  setAddresses: React.Dispatch<React.SetStateAction<Address[]>>;
  paymentMethods: PaymentMethodWire[];
  paymentMethod: PaymentMethodWire["id"];
  setPaymentMethod: (method: PaymentMethodWire["id"]) => void;
  offers: CouponOfferWire[];
  couponCode: string;
  setCouponCode: (value: string) => void;
  couponDiscount: number | null;
  couponBusy: boolean;
  applyCoupon: (code?: string) => Promise<void>;
  quote: CheckoutQuoteWire | null;
  useGoCoins: boolean;
  setUseGoCoins: (value: boolean) => void;
  note: string;
  setNote: (value: string) => void;
}) {
  const [showNew, setShowNew] = React.useState(false);
  const [showCode, setShowCode] = React.useState(false);
  const [locating, setLocating] = React.useState(false);
  const [draft, setDraft] = React.useState({
    recipientName: "",
    phone: "",
    area: "",
    landmark: "",
    fullAddress: "",
    lat: "27.698",
    lng: "85.3455",
  });
  const [localError, setLocalError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (props.addresses.length === 0) setShowNew(true);
  }, [props.addresses.length]);
  async function createAddress() {
    try {
      const row = await customerApi.createAddress({
        label: "Home",
        recipientName: draft.recipientName,
        phone: draft.phone,
        area: draft.area,
        landmark: draft.landmark || null,
        fullAddress: draft.fullAddress,
        lat: Number(draft.lat),
        lng: Number(draft.lng),
        isDefault: props.addresses.length === 0,
      });
      props.setAddresses((current) => [...current, row]);
      props.setAddressId(row.id);
      setShowNew(false);
      setLocalError(null);
    } catch (cause) {
      setLocalError(readError(cause));
    }
  }
  function locate() {
    if (!navigator.geolocation) {
      setLocalError("Location is not supported by this browser.");
      return;
    }
    setLocating(true);
    setLocalError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft((current) => ({
          ...current,
          lat: String(position.coords.latitude),
          lng: String(position.coords.longitude),
        }));
        setLocating(false);
      },
      () => {
        setLocalError(
          "We could not access your location. You can still enter the address manually.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12_000 },
    );
  }
  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6">
        <SectionTitle
          number="1"
          icon={MapPin}
          title="Where should we deliver?"
          detail="Choose a saved address or add a new one"
        />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {props.addresses.map((address) => (
            <label
              key={address.id}
              className={`relative flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${props.addressId === address.id ? "border-crimson-400 bg-crimson-50/70 shadow-sm" : "border-ink-200 hover:border-crimson-200"}`}
            >
              <input
                className="sr-only"
                type="radio"
                checked={props.addressId === address.id}
                onChange={() => props.setAddressId(address.id)}
              />
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${props.addressId === address.id ? "bg-crimson-500 text-white" : "bg-paper text-ink-500"}`}
              >
                <MapPin className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <strong className="block text-ink-900">
                  {address.label}
                  {address.isDefault && (
                    <small className="ml-2 rounded-full bg-[#EAF7EF] px-2 py-0.5 text-[10px] font-bold text-[#0B7E58]">
                      DEFAULT
                    </small>
                  )}
                </strong>
                <small className="mt-1 block leading-5 text-ink-500">
                  {address.fullAddress}
                  <br />
                  {address.area}
                  {address.landmark ? ` · Landmark: ${address.landmark}` : ""}
                </small>
              </span>
              {props.addressId === address.id && (
                <Check className="absolute right-3 top-3 h-4 w-4 text-crimson-600" />
              )}
            </label>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowNew((value) => !value)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-crimson-200 px-4 py-2 text-sm font-bold text-crimson-700 transition hover:bg-crimson-50"
        >
          {showNew ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showNew ? "Close address form" : "Add a new address"}
        </button>
        {showNew && (
          <div className="mt-5 rounded-2xl bg-paper/70 p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Recipient name"
                value={draft.recipientName}
                update={(value) => setDraft({ ...draft, recipientName: value })}
                placeholder="Who will receive the order?"
              />
              <Field
                label="Mobile number"
                value={draft.phone}
                update={(value) => setDraft({ ...draft, phone: value })}
                placeholder="98XXXXXXXX"
                inputMode="tel"
              />
              <Field
                label="Area or neighbourhood"
                value={draft.area}
                update={(value) => setDraft({ ...draft, area: value })}
                placeholder="e.g. Baneshwor"
              />
              <Field
                label="Nearby landmark (optional)"
                value={draft.landmark}
                update={(value) => setDraft({ ...draft, landmark: value })}
                placeholder="e.g. Near Everest Hotel"
              />
              <div className="sm:col-span-2">
                <Field
                  label="Complete delivery address"
                  value={draft.fullAddress}
                  update={(value) => setDraft({ ...draft, fullAddress: value })}
                  placeholder="House, street, ward and municipality"
                />
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-ink-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2">
                <LocateFixed className="mt-0.5 h-4 w-4 shrink-0 text-crimson-500" />
                <p className="text-xs leading-5 text-ink-500">
                  <strong className="block text-ink-800">Pin your current delivery location</strong>
                  Use this while standing where the rider should arrive.
                </p>
              </div>
              <button
                type="button"
                disabled={locating}
                onClick={locate}
                className="shrink-0 rounded-full bg-ink-900 px-4 py-2 text-xs font-bold text-white"
              >
                {locating ? "Locating…" : "Use my location"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => void createAddress()}
              className="gp-btn gp-btn-primary mt-4 w-full px-4 py-2.5 text-sm"
            >
              Save and use this address
            </button>
            {localError && <p className="mt-3 text-sm text-crimson-600">{localError}</p>}
          </div>
        )}
      </section>
      <section className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6">
        <SectionTitle
          number="2"
          icon={Wallet}
          title="How would you like to pay?"
          detail="Online funds are protected until delivery; cash is paid on arrival"
        />
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {props.paymentMethods.map((method) => (
            <label
              key={method.id}
              className={`relative flex cursor-pointer gap-3 rounded-2xl border p-4 transition ${props.paymentMethod === method.id ? "border-crimson-400 bg-crimson-50/70 shadow-sm" : "border-ink-200 hover:border-crimson-200"}`}
            >
              <input
                className="sr-only"
                type="radio"
                checked={props.paymentMethod === method.id}
                onChange={() => props.setPaymentMethod(method.id)}
              />
              <span
                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${method.online ? "bg-[#EAF1FE] text-[#1D4ED8]" : "bg-[#EAF7EF] text-[#0B7E58]"}`}
              >
                <Wallet className="h-5 w-5" />
              </span>
              <span>
                <strong className="block text-sm text-ink-900">{method.label}</strong>
                <small className="mt-1 block leading-5 text-ink-500">{method.description}</small>
              </span>
              {props.paymentMethod === method.id && (
                <Check className="absolute right-3 top-3 h-4 w-4 text-crimson-600" />
              )}
            </label>
          ))}
        </div>
        {props.paymentMethods.length === 0 && (
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            This shop has no payment method available right now.
          </p>
        )}
      </section>
      <section className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-6">
        <SectionTitle
          number="3"
          icon={BadgePercent}
          title="Save with an offer"
          detail={
            props.offers.length
              ? `${props.offers.length} offer${props.offers.length === 1 ? "" : "s"} available for this order`
              : "No offers are available for this order yet"
          }
        />
        {props.offers.length > 0 && (
          <div className="mt-5 grid gap-3">
            {props.offers.map((offer) => {
              const selected = props.couponCode === offer.code && props.couponDiscount != null;
              const eligible = props.subtotal >= offer.minOrder;
              return (
                <button
                  type="button"
                  key={offer.code}
                  disabled={props.couponBusy || !eligible}
                  onClick={() => void props.applyCoupon(offer.code)}
                  className={`group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed ${selected ? "border-[#0B7E58] bg-[#EAF7EF]" : eligible ? "border-ink-200 hover:border-crimson-300 hover:bg-crimson-50/40" : "border-ink-100 bg-ink-50 opacity-70"}`}
                >
                  <span
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${selected ? "bg-[#0B7E58] text-white" : "bg-crimson-50 text-crimson-600"}`}
                  >
                    {selected ? <Check className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-ink-900">{offer.title}</strong>
                    <small className="mt-0.5 block leading-5 text-ink-500">
                      {offer.detail} · {offer.scope === "SHOP" ? "From this shop" : "From GoPasal"}
                    </small>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold ${selected ? "bg-white text-[#0B7E58]" : eligible ? "bg-ink-900 text-white group-hover:bg-crimson-600" : "bg-ink-200 text-ink-600"}`}
                  >
                    {selected
                      ? `Saved ${rs(props.couponDiscount ?? 0)}`
                      : eligible
                        ? "Apply"
                        : `Add ${rs(offer.minOrder - props.subtotal)} more`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowCode((value) => !value)}
          className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-crimson-600"
        >
          <CircleHelp className="h-4 w-4" /> Have a different coupon?{" "}
          <ChevronDown className={`h-4 w-4 transition ${showCode ? "rotate-180" : ""}`} />
        </button>
        {showCode && (
          <div className="mt-3 flex gap-2">
            <input
              aria-label="Coupon code"
              value={props.couponCode}
              onChange={(event) => props.setCouponCode(event.target.value.toUpperCase())}
              placeholder="Enter coupon code"
              className="h-11 min-w-0 flex-1 rounded-xl border border-ink-200 px-3 text-sm uppercase outline-none focus:border-crimson-400"
            />
            <Button
              type="button"
              variant="outline"
              disabled={props.couponBusy || !props.couponCode.trim()}
              onClick={() => void props.applyCoupon()}
            >
              {props.couponBusy ? "Checking…" : "Apply"}
            </Button>
          </div>
        )}
        {props.quote && props.quote.availableGoCoins > 0 && (
          <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <input
              type="checkbox"
              checked={props.useGoCoins}
              disabled={props.quote.eligibleGoCoins === 0}
              onChange={(event) => props.setUseGoCoins(event.target.checked)}
              className="h-5 w-5 accent-crimson-500"
            />
            <span className="min-w-0 flex-1">
              <strong className="block text-ink-900">
                Use GoCoins · {props.quote.availableGoCoins} available
              </strong>
              <small className="mt-0.5 block text-ink-600">
                {props.quote.eligibleGoCoins > 0
                  ? `Use ${props.quote.eligibleGoCoins} coins to save ${rs(props.quote.eligibleGoCoinsValue)} on this order.`
                  : "Your balance is below the minimum redeemable amount for this order."}
              </small>
            </span>
          </label>
        )}
      </section>
      <label className="block rounded-3xl border border-ink-100 bg-white p-5 text-sm font-bold shadow-card sm:p-6">
        Anything the shop should know? <span className="font-normal text-ink-400">Optional</span>
        <textarea
          rows={3}
          value={props.note}
          maxLength={300}
          onChange={(event) => props.setNote(event.target.value)}
          placeholder="Packing preference, substitute instructions or delivery note"
          className="mt-3 w-full resize-none rounded-2xl border border-ink-200 p-4 font-normal outline-none focus:border-crimson-400 focus:ring-4 focus:ring-crimson-50"
        />
        <span className="mt-1 block text-right text-xs font-normal text-ink-400">
          {props.note.length}/300
        </span>
      </label>
    </div>
  );
}

function SectionTitle({
  number,
  icon: Icon,
  title,
  detail,
}: {
  number: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-crimson-50 text-crimson-600">
        <Icon className="h-5 w-5" />
        <small className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink-900 text-[10px] font-black text-white">
          {number}
        </small>
      </span>
      <span>
        <h2 className="font-extrabold text-ink-900">{title}</h2>
        <p className="mt-0.5 text-xs leading-5 text-ink-500">{detail}</p>
      </span>
    </div>
  );
}
function Field({
  label,
  value,
  update,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  update: (value: string) => void;
  placeholder: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-ink-700">{label}</span>
      <input
        required
        value={value}
        onChange={(event) => update(event.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="mt-1.5 h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm outline-none focus:border-crimson-400 focus:ring-4 focus:ring-crimson-50"
      />
    </label>
  );
}

function OrderPlaced({ order }: { order: OrderWire }) {
  return (
    <div className="gp-container grid min-h-[70vh] place-items-center py-12 sm:py-16">
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-float">
        <div className="bg-gradient-to-br from-[#EAF7EF] to-white p-7 text-center sm:p-10">
          <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-[#0B7E58] text-white shadow-lg">
            <CheckCircle2 className="h-10 w-10" />
          </span>
          <p className="mt-5 text-xs font-black uppercase tracking-[.18em] text-[#0B7E58]">
            Order confirmed
          </p>
          <h1 className="mt-2 text-2xl font-extrabold text-ink-900 sm:text-3xl">
            Your order is on its way to the shop
          </h1>
          <p className="mt-3 text-ink-600">
            Order <strong>#{order.code}</strong> · {rs(order.total)} · Payment{" "}
            {order.paymentStatus.toLowerCase()}
          </p>
        </div>
        <div className="flex flex-col gap-2 border-t border-ink-100 p-5 sm:flex-row sm:p-6">
          <Button href={`/orders/${order.id}`} className="flex-1">
            Track this order <ArrowRight className="h-4 w-4" />
          </Button>
          <Button href="/shops" variant="outline" className="flex-1">
            Continue shopping
          </Button>
        </div>
      </div>
    </div>
  );
}
function Empty({
  title,
  body,
  action,
  href,
}: {
  title: string;
  body: string;
  action: string;
  href: string;
}) {
  return (
    <div className="gp-container grid min-h-[65vh] place-items-center py-16">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-crimson-50 text-crimson-500">
          <ShoppingBag className="h-9 w-9" />
        </span>
        <h1 className="mt-6 text-2xl font-extrabold text-ink-900 sm:text-3xl">{title}</h1>
        <p className="mt-2 leading-7 text-ink-600">{body}</p>
        <Button href={href} className="mt-6">
          {action} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
const readError = (cause: unknown) =>
  cause instanceof Error ? cause.message : "Request failed. Please try again.";

export default CartView;

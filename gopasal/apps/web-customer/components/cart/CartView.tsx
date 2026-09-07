"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Minus,
  Plus,
  Trash2,
  ShoppingBag,
  Wallet,
  Truck,
  MapPin,
  CheckCircle2,
  MessageCircle,
} from "lucide-react";
import { useCart } from "@/components/providers";
import { storeBySlug } from "@/lib/data";
import { rs } from "@/lib/format";
import { Button } from "@/components/primitives";

type Step = "cart" | "checkout" | "done";

export function CartView() {
  const { lines, subtotal, count, add, remove, clear } = useCart();
  const [step, setStep] = React.useState<Step>("cart");
  const [orderId, setOrderId] = React.useState("");

  const store = lines[0] ? storeBySlug(lines[0].storeSlug) : undefined;
  const deliveryFee = store ? (subtotal >= 500 ? 0 : 40) : 0;
  const total = subtotal + deliveryFee;

  const placeOrder = () => {
    setOrderId("GP" + Math.floor(100000 + Math.random() * 900000));
    setStep("done");
    clear();
  };

  if (count === 0 && step !== "done") {
    return (
      <div className="gp-container grid min-h-[60vh] place-items-center py-16">
        <div className="text-center">
          <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-crimson-50 text-crimson-500">
            <ShoppingBag className="h-9 w-9" />
          </span>
          <h1 className="mt-6 text-2xl font-bold text-ink-900">Your cart is empty</h1>
          <p className="mt-2 text-ink-600">Find something from a shop near you.</p>
          <Button href="/shops" className="mt-6">Browse shops</Button>
        </div>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="gp-container grid min-h-[60vh] place-items-center py-16">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md text-center"
        >
          <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-[#EAF7EF] text-[#0B7E58]">
            <CheckCircle2 className="h-10 w-10" />
          </span>
          <h1 className="mt-6 text-2xl font-bold text-ink-900">Order placed!</h1>
          <p className="mt-2 text-ink-600">
            Your order <span className="font-bold text-ink-900">#{orderId}</span> has been sent to the
            shop. They’ll confirm and arrange delivery in your area.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button href="/orders">Track order</Button>
            <Link href="/shops" className="gp-btn border border-ink-200 bg-white px-5 py-2.5 text-ink-800 hover:bg-ink-100">
              Continue shopping
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="gp-container py-10">
      <h1 className="text-3xl font-bold text-ink-900">
        {step === "cart" ? "Your cart" : "Checkout"}
      </h1>
      {store && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-600">
          <Truck className="h-4 w-4 text-crimson-500" /> From{" "}
          <Link href={`/store/${store.slug}`} className="font-semibold text-crimson-600 hover:underline">
            {store.name}
          </Link>
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <div>
          {step === "cart" ? (
            <ul className="space-y-3">
              <AnimatePresence initial={false}>
                {lines.map((l) => (
                  <motion.li
                    key={l.product.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-4 rounded-2xl border border-ink-100 bg-white p-4"
                  >
                    <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-ink-50 text-2xl">
                      {store?.emoji ?? "🛍️"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-ink-900">{l.product.name}</p>
                      <p className="text-sm text-ink-500">{rs(l.product.price)} · {l.product.unit}</p>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-ink-200 p-1">
                      <button
                        onClick={() => remove(l.product.id)}
                        aria-label="Decrease"
                        className="grid h-8 w-8 place-items-center rounded-full text-ink-700 hover:bg-ink-100"
                      >
                        {l.qty === 1 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                      </button>
                      <span className="w-6 text-center font-semibold">{l.qty}</span>
                      <button
                        onClick={() => store && add(l.product, store)}
                        aria-label="Increase"
                        className="grid h-8 w-8 place-items-center rounded-full bg-crimson-50 text-crimson-600 hover:bg-crimson-500 hover:text-white"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="w-20 text-right font-display font-bold text-ink-900">
                      {rs(l.product.price * l.qty)}
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          ) : (
            <CheckoutForm />
          )}
        </div>

        {/* summary */}
        <aside className="h-fit rounded-3xl border border-ink-100 bg-white p-6 lg:sticky lg:top-24">
          <h2 className="text-lg font-bold text-ink-900">Order summary</h2>
          <dl className="mt-4 space-y-2.5 text-sm">
            <Row label={`Subtotal (${count} items)`} value={rs(subtotal)} />
            <Row
              label="Delivery (by shop)"
              value={deliveryFee === 0 ? "Free" : rs(deliveryFee)}
            />
            <div className="my-3 border-t border-ink-100" />
            <div className="flex items-center justify-between">
              <dt className="font-bold text-ink-900">Total</dt>
              <dd className="font-display text-xl font-extrabold text-ink-900">{rs(total)}</dd>
            </div>
          </dl>

          <div className="mt-4 flex items-center gap-2 rounded-xl bg-paper px-3 py-2.5 text-sm text-ink-600">
            <Wallet className="h-4 w-4 text-[#0E9F6E]" /> Cash on delivery available
          </div>

          {step === "cart" ? (
            <Button className="mt-5 w-full" onClick={() => setStep("checkout")}>
              Proceed to checkout
            </Button>
          ) : (
            <Button className="mt-5 w-full" onClick={placeOrder}>
              Place order · {rs(total)}
            </Button>
          )}

          <p className="mt-3 text-center text-xs text-ink-400">
            Delivery timing is set by the shop. You can{" "}
            <span className="inline-flex items-center gap-1 font-medium text-ink-600">
              <MessageCircle className="h-3 w-3" /> contact them
            </span>{" "}
            anytime.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-ink-600">
      <dt>{label}</dt>
      <dd className="font-medium text-ink-900">{value}</dd>
    </div>
  );
}

function CheckoutForm() {
  return (
    <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
      <fieldset className="rounded-2xl border border-ink-100 bg-white p-5">
        <legend className="flex items-center gap-2 px-2 font-bold text-ink-900">
          <MapPin className="h-4 w-4 text-crimson-500" /> Delivery address
        </legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Full name" placeholder="Sita Sharma" />
          <Field label="Phone" placeholder="98•• ••• •••" type="tel" />
          <Field label="Area / Tole" placeholder="New Baneshwor" />
          <Field label="Landmark" placeholder="Near Shankhamul bridge" />
          <div className="sm:col-span-2">
            <Field label="Full address" placeholder="House no., street, ward" />
          </div>
        </div>
      </fieldset>

      <fieldset className="rounded-2xl border border-ink-100 bg-white p-5">
        <legend className="flex items-center gap-2 px-2 font-bold text-ink-900">
          <Wallet className="h-4 w-4 text-crimson-500" /> Payment
        </legend>
        <div className="mt-3 space-y-3">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-crimson-400 bg-crimson-50 p-4">
            <input type="radio" name="pay" defaultChecked className="accent-crimson-500" />
            <span>
              <span className="block font-semibold text-ink-900">Cash on delivery</span>
              <span className="block text-sm text-ink-500">Pay the shop when your order arrives</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-ink-200 p-4 opacity-70">
            <input type="radio" name="pay" className="accent-crimson-500" />
            <span>
              <span className="block font-semibold text-ink-900">Online payment (eSewa / Khalti)</span>
              <span className="block text-sm text-ink-500">Coming soon</span>
            </span>
          </label>
        </div>
      </fieldset>
    </form>
  );
}

function Field({
  label,
  placeholder,
  type = "text",
}: {
  label: string;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink-700">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-sm outline-none focus:border-crimson-300 focus:ring-4 focus:ring-crimson-50"
      />
    </label>
  );
}

export default CartView;

"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  MapPin,
  Star,
  Plus,
  Check,
  Wallet,
  Landmark,
  Home,
  Briefcase,
  ShoppingBag,
  Truck,
  PackageCheck,
  Phone,
  MessageCircle,
} from "lucide-react";
import { Logo } from "@gopasal/ui";

/**
 * PhoneMockup — a 3D-tilted device that plays a full, scripted "screen
 * recording" of a GoPasal order, looping forever: splash → search & type →
 * add items (tap + cart count) → cart → pick saved address → choose payment →
 * placing spinner → order placed → live tracking → delivered → rate. Every
 * scene animates its own contents with tap ripples and micro-interactions so
 * it reads like a real person using the app, not a slideshow.
 */

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const SCENES = [
  { id: "splash", ms: 1700 },
  { id: "search", ms: 3200 },
  { id: "shop", ms: 3400 },
  { id: "cart", ms: 2600 },
  { id: "address", ms: 2700 },
  { id: "payment", ms: 2700 },
  { id: "placing", ms: 1600 },
  { id: "placed", ms: 2000 },
  { id: "track", ms: 3400 },
  { id: "delivered", ms: 2200 },
  { id: "rate", ms: 3000 },
] as const;

export function PhoneMockup() {
  const [i, setI] = React.useState(0);

  // SCENES is a const tuple, so index 0 is always present — falling back to it
  // keeps the loop honest without asserting anything away.
  const current = SCENES[i] ?? SCENES[0];

  // advance through the scripted scenes on each scene's own duration, forever
  React.useEffect(() => {
    const id = window.setTimeout(
      () => setI((n) => (n + 1) % SCENES.length),
      current.ms,
    );
    return () => window.clearTimeout(id);
  }, [current]);

  const scene = current.id;

  return (
    <div
      className="relative mx-auto w-[300px] max-w-full"
      style={{ perspective: "1600px" }}
    >
      {/* ambient light — pure radial glows that fade fully to transparent, so
          there is no visible circle edge or line anywhere around the device */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-2xl [background:radial-gradient(circle,rgba(225,25,69,0.20)_0%,rgba(225,25,69,0.07)_42%,rgba(225,25,69,0)_70%)]" />
      <div className="pointer-events-none absolute right-0 top-6 -z-10 h-64 w-64 rounded-full blur-2xl [background:radial-gradient(circle,rgba(246,166,9,0.16)_0%,rgba(246,166,9,0)_68%)]" />
      {/* soft contact shadow — diffuse crimson-tinted ellipse that fades fully
          to transparent well within its own box, so no hard edge remains even
          where the section boundary is near */}
      <div className="pointer-events-none absolute bottom-4 left-1/2 -z-10 h-14 w-56 -translate-x-1/2 rounded-[50%] blur-2xl [background:radial-gradient(ellipse,rgba(110,10,32,0.18)_0%,rgba(110,10,32,0)_60%)]" />

      {/* 3D floating device */}
      <motion.div
        initial={{ opacity: 0, y: 26, rotateY: -20, rotateX: 8 }}
        animate={{ opacity: 1, y: [0, -10, 0], rotateY: -13, rotateX: 5 }}
        transition={{
          opacity: { duration: 0.6 },
          rotateY: { duration: 1.1, ease: EASE },
          rotateX: { duration: 1.1, ease: EASE },
          y: { duration: 6, repeat: Infinity, ease: "easeInOut" },
        }}
        className="[transform-style:preserve-3d] will-change-transform"
      >
        <div className="relative rounded-[2.9rem] bg-gradient-to-b from-ink-700 via-ink-900 to-black p-[11px] shadow-[0_50px_100px_-30px_rgba(110,10,32,0.7)] ring-1 ring-white/10">
          <div className="pointer-events-none absolute inset-0 rounded-[2.9rem] ring-1 ring-inset ring-white/10" />
          <span className="absolute -left-[3px] top-28 h-16 w-[3px] rounded-l bg-ink-600" />
          <span className="absolute -right-[3px] top-24 h-9 w-[3px] rounded-r bg-ink-600" />
          <span className="absolute -right-[3px] top-36 h-16 w-[3px] rounded-r bg-ink-600" />

          <div className="relative aspect-[300/620] overflow-hidden rounded-[2.3rem] bg-paper">
            <div className="absolute left-1/2 top-2.5 z-30 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />
            <StatusBar dark={scene === "splash"} />

            <div className="absolute inset-x-0 bottom-0 top-9 overflow-hidden">
              <AnimatePresence initial={false}>
                <motion.div
                  key={scene}
                  className="absolute inset-0 flex flex-col"
                  initial={{ opacity: 0, x: 34 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -34 }}
                  transition={{ duration: 0.45, ease: EASE }}
                >
                  <Scene id={scene} />
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="pointer-events-none absolute inset-0 z-20 rounded-[2.3rem] bg-gradient-to-tr from-white/0 via-white/[0.08] to-white/0" />
            <div className="absolute bottom-2 left-1/2 z-30 h-1 w-24 -translate-x-1/2 rounded-full bg-black/25" />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Scene({ id }: { id: string }) {
  switch (id) {
    case "splash":
      return <SplashScene />;
    case "search":
      return <SearchScene />;
    case "shop":
      return <ShopScene />;
    case "cart":
      return <CartScene />;
    case "address":
      return <AddressScene />;
    case "payment":
      return <PaymentScene />;
    case "placing":
      return <PlacingScene />;
    case "placed":
      return <PlacedScene />;
    case "track":
      return <TrackScene />;
    case "delivered":
      return <DeliveredScene />;
    default:
      return <RateScene />;
  }
}

function StatusBar({ dark }: { dark?: boolean }) {
  const tone = dark ? "text-white" : "text-ink-800";
  const fill = dark ? "bg-white/90" : "bg-ink-800/80";
  const ring = dark ? "border-white/80" : "border-ink-800/70";
  return (
    <div
      className={
        "absolute inset-x-0 top-0 z-30 flex h-9 items-center justify-between px-6 pt-1.5 text-[10px] font-semibold " +
        tone
      }
    >
      <span>9:41</span>
      <span className="flex items-center gap-1">
        <span className={"h-2 w-3 rounded-[2px] " + fill} />
        <span className={"h-2 w-2 rounded-full " + fill} />
        <span className={"h-2.5 w-4 rounded-[3px] border " + ring} />
      </span>
    </div>
  );
}

function AppBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gradient-to-br from-crimson-500 to-crimson-700 px-4 pb-4 pt-3 text-white">
      {children}
    </div>
  );
}

/* a finger-tap ripple placed over a control to imply a real tap */
function Tap({ className, delay = 0.5 }: { className?: string; delay?: number }) {
  return (
    <motion.span
      aria-hidden
      className={"pointer-events-none absolute z-20 " + (className ?? "")}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.1, times: [0, 0.15, 0.6, 1], delay, ease: "easeOut" }}
    >
      <span className="relative flex h-9 w-9 items-center justify-center">
        <motion.span
          className="absolute inset-0 rounded-full border-2 border-crimson-500/70"
          initial={{ scale: 0.4, opacity: 0.8 }}
          animate={{ scale: 1.8, opacity: 0 }}
          transition={{ duration: 0.9, delay, ease: "easeOut" }}
        />
        <span className="h-6 w-6 rounded-full bg-crimson-500/25 ring-2 ring-crimson-500/60" />
      </span>
    </motion.span>
  );
}

/* types a string out, char by char, after an optional delay */
function Typer({ text, delay = 0.3 }: { text: string; delay?: number }) {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    let id: number;
    const start = window.setTimeout(() => {
      id = window.setInterval(() => {
        setN((c) => {
          if (c >= text.length) {
            window.clearInterval(id);
            return c;
          }
          return c + 1;
        });
      }, 95);
    }, delay * 1000);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(id);
    };
  }, [text, delay]);
  return (
    <span className="text-ink-800">
      {text.slice(0, n)}
      <span className="ml-[1px] inline-block h-3 w-[1.5px] -translate-y-[1px] animate-pulse bg-crimson-500 align-middle" />
    </span>
  );
}

/* ---- Splash ---- */
function SplashScene() {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-crimson-500 via-crimson-600 to-crimson-700 text-white">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-8 h-44 w-44 rounded-full bg-[#F6A609]/20 blur-2xl" />
      <motion.div
        initial={{ scale: 0.5, opacity: 0, rotate: -8 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ duration: 0.7, ease: EASE }}
        className="flex h-20 w-20 items-center justify-center rounded-[1.4rem] bg-white shadow-lg"
      >
        {/* real GoPasal Aankhijhyal mark */}
        <Logo variant="mark" tone="brand" height={44} />
      </motion.div>
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.35, ease: EASE }}
        className="mt-4"
      >
        <Logo variant="wordmark" tone="onDark" height={24} />
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.5 }}
        className="deva mt-1 text-[11px] text-white/85"
      >
        नेपालको आफ्नै पसल
      </motion.div>
      <div className="absolute bottom-8 flex gap-1.5">
        {[0, 1, 2].map((d) => (
          <motion.span
            key={d}
            className="h-1.5 w-1.5 rounded-full bg-white/80"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1, repeat: Infinity, delay: d * 0.18 }}
          />
        ))}
      </div>
    </div>
  );
}

/* ---- Search & type ---- */
function SearchScene() {
  const results = [
    { emoji: "🛒", name: "Namaste Kirana", meta: "0.6 km · Basmati Rice 5kg" },
    { emoji: "🥬", name: "Fresh Vegetables", meta: "0.4 km · Daily groceries" },
    { emoji: "🍞", name: "Sunrise Bakery", meta: "0.9 km · Breads & more" },
  ];
  return (
    <>
      <AppBar>
        <div className="flex items-center gap-1 text-[11px] text-white/85">
          <MapPin className="h-3.5 w-3.5" /> Baneshwor, KTM
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-[11px] shadow-sm">
          <Search className="h-3.5 w-3.5 shrink-0 text-crimson-500" />
          <Typer text="Basmati rice" delay={0.4} />
        </div>
      </AppBar>
      <div className="relative flex-1 space-y-2 px-3 py-3">
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.7 }}
          className="px-1 text-[10px] font-bold uppercase tracking-wide text-ink-400"
        >
          Shops with this item
        </motion.p>
        {results.map((r, idx) => (
          <motion.div
            key={r.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.75 + idx * 0.14, duration: 0.4, ease: EASE }}
            className={
              "flex items-center gap-3 rounded-2xl border bg-white p-2.5 " +
              (idx === 0 ? "border-crimson-200 ring-1 ring-crimson-100" : "border-ink-100")
            }
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-crimson-50 text-base">
              {r.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-bold text-ink-900">{r.name}</div>
              <div className="truncate text-[10px] text-ink-500">{r.meta}</div>
            </div>
          </motion.div>
        ))}
        <Tap className="left-6 top-16" delay={2.5} />
      </div>
    </>
  );
}

/* ---- Shop: add items ---- */
function ShopScene() {
  return (
    <>
      <AppBar>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/95 text-base">
            🛒
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-extrabold">Namaste Kirana</div>
            <div className="flex items-center gap-1 text-[10px] text-white/85">
              <Star className="h-3 w-3 fill-[#F6A609] text-[#F6A609]" /> 4.8 · Delivered by the shop
            </div>
          </div>
        </div>
      </AppBar>
      <div className="relative flex-1 px-3 py-3">
        <div className="space-y-2">
          <ShopProduct img="🍚" name="Basmati Rice · 5kg" price="Rs. 720" addAt={0.9} />
          <ShopProduct img="🍜" name="Wai Wai Noodles ×5" price="Rs. 150" addAt={2.0} />
          <ShopProduct img="🍵" name="Tokla Tea · 400g" price="Rs. 210" />
          <ShopProduct img="🧈" name="Dashain Special Ghee" price="Rs. 480" />
        </div>
        <Tap className="right-3 top-3" delay={0.55} />
        <Tap className="right-3 top-[4.4rem]" delay={1.65} />
        <CartFab />
      </div>
    </>
  );
}

function ShopProduct({
  img,
  name,
  price,
  addAt,
}: {
  img: string;
  name: string;
  price: string;
  addAt?: number;
}) {
  const [added, setAdded] = React.useState(false);
  React.useEffect(() => {
    if (addAt == null) return;
    const id = window.setTimeout(() => setAdded(true), addAt * 1000);
    return () => window.clearTimeout(id);
  }, [addAt]);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-2.5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-crimson-50 to-[#F6A609]/10 text-xl">
        {img}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-semibold text-ink-900">{name}</div>
        <div className="text-[12px] font-bold text-crimson-600">{price}</div>
      </div>
      {added ? (
        <motion.span
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="inline-flex items-center gap-1 rounded-full bg-crimson-500 px-2.5 py-1 text-[10px] font-bold text-white"
        >
          <Check className="h-3 w-3" /> Added
        </motion.span>
      ) : (
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-crimson-200 text-crimson-600">
          <Plus className="h-4 w-4" />
        </span>
      )}
    </div>
  );
}

function CartFab() {
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    const a = window.setTimeout(() => setCount(1), 950);
    const b = window.setTimeout(() => setCount(2), 2050);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, []);
  return (
    <div className="absolute bottom-2 right-3">
      <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-crimson-500 to-crimson-700 text-white shadow-crimson">
        <ShoppingBag className="h-5 w-5" />
        {count > 0 && (
          <motion.span
            key={count}
            initial={{ scale: 0.3 }}
            animate={{ scale: [0.3, 1.35, 1] }}
            transition={{ duration: 0.45, ease: EASE }}
            className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#F6A609] text-[10px] font-extrabold text-white ring-2 ring-paper"
          >
            {count}
          </motion.span>
        )}
      </div>
    </div>
  );
}

/* ---- Cart ---- */
function CartScene() {
  return (
    <>
      <AppBar>
        <div className="flex items-center gap-2 text-[13px] font-extrabold">
          <ShoppingBag className="h-4 w-4" /> Your cart · Namaste Kirana
        </div>
      </AppBar>
      <div className="relative flex flex-1 flex-col px-3 py-3">
        <div className="space-y-2">
          <CartLine img="🍚" name="Basmati Rice · 5kg" qty="1" price="Rs. 720" />
          <CartLine img="🍜" name="Wai Wai Noodles ×5" qty="2" price="Rs. 300" />
        </div>
        <div className="mt-auto">
          <div className="flex items-center justify-between border-t border-dashed border-ink-200 pt-2 text-[13px] font-extrabold text-ink-900">
            <span>Subtotal</span>
            <span>Rs. 1,020</span>
          </div>
          <div className="relative mt-2 w-full rounded-xl bg-gradient-to-br from-crimson-500 to-crimson-700 py-2.5 text-center text-[12px] font-bold text-white shadow-crimson">
            Proceed to checkout
            <Tap className="right-6 -top-1" delay={1.2} />
          </div>
        </div>
      </div>
    </>
  );
}

function CartLine({ img, name, qty, price }: { img: string; name: string; qty: string; price: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-crimson-50 to-[#F6A609]/10 text-base">
        {img}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11.5px] font-semibold text-ink-900">{name}</div>
        <div className="text-[10px] text-ink-500">Qty {qty}</div>
      </div>
      <div className="text-[11.5px] font-bold text-ink-800">{price}</div>
    </div>
  );
}

/* ---- Address ---- */
function AddressScene() {
  const [sel, setSel] = React.useState(-1);
  React.useEffect(() => {
    const id = window.setTimeout(() => setSel(0), 1000);
    return () => window.clearTimeout(id);
  }, []);
  const rows = [
    { icon: Home, label: "Home", line: "Baneshwor, Kathmandu · near Chowk" },
    { icon: Briefcase, label: "Work", line: "Putalisadak, Kathmandu" },
  ];
  return (
    <>
      <AppBar>
        <div className="flex items-center gap-2 text-[13px] font-extrabold">
          <MapPin className="h-4 w-4" /> Delivery address
        </div>
      </AppBar>
      <div className="relative flex flex-1 flex-col px-3 py-3">
        <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-ink-400">
          Saved addresses
        </p>
        <div className="space-y-2">
          {rows.map((r, idx) => {
            const active = sel === idx;
            return (
              <div
                key={r.label}
                className={
                  "flex items-center gap-3 rounded-2xl border bg-white p-3 transition-colors " +
                  (active ? "border-crimson-400 ring-2 ring-crimson-100" : "border-ink-100")
                }
              >
                <span
                  className={
                    "flex h-9 w-9 items-center justify-center rounded-xl " +
                    (active ? "bg-crimson-500 text-white" : "bg-crimson-50 text-crimson-600")
                  }
                >
                  <r.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold text-ink-900">{r.label}</div>
                  <div className="truncate text-[10px] text-ink-500">{r.line}</div>
                </div>
                {active && (
                  <motion.span
                    initial={{ scale: 0.4, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.3, ease: EASE }}
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-crimson-500 text-white"
                  >
                    <Check className="h-3 w-3" />
                  </motion.span>
                )}
              </div>
            );
          })}
        </div>
        <Tap className="left-8 top-14" delay={0.6} />
        <div className="mt-auto w-full rounded-xl bg-gradient-to-br from-crimson-500 to-crimson-700 py-2.5 text-center text-[12px] font-bold text-white shadow-crimson">
          Deliver here
        </div>
      </div>
    </>
  );
}

/* ---- Payment ---- */
function PaymentScene() {
  const [sel, setSel] = React.useState(-1);
  React.useEffect(() => {
    const id = window.setTimeout(() => setSel(0), 1000);
    return () => window.clearTimeout(id);
  }, []);
  const rows = [
    { icon: Wallet, label: "Cash on delivery", note: "Pay the shop when it arrives", tint: "#0E9F6E" },
    { icon: Landmark, label: "Online payment", note: "eSewa · Khalti · bank", tint: "#5B2A9E" },
  ];
  return (
    <>
      <AppBar>
        <div className="flex items-center gap-2 text-[13px] font-extrabold">
          <Wallet className="h-4 w-4" /> Payment
        </div>
      </AppBar>
      <div className="relative flex flex-1 flex-col px-3 py-3">
        <div className="space-y-2">
          {rows.map((r, idx) => {
            const active = sel === idx;
            return (
              <div
                key={r.label}
                className={
                  "flex items-center gap-3 rounded-2xl border bg-white p-3 transition-colors " +
                  (active ? "border-crimson-400 ring-2 ring-crimson-100" : "border-ink-100")
                }
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ backgroundColor: r.tint + "1A", color: r.tint }}
                >
                  <r.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-bold text-ink-900">{r.label}</div>
                  <div className="truncate text-[10px] text-ink-500">{r.note}</div>
                </div>
                <span
                  className={
                    "flex h-5 w-5 items-center justify-center rounded-full border " +
                    (active ? "border-crimson-500 bg-crimson-500 text-white" : "border-ink-300")
                  }
                >
                  {active && <Check className="h-3 w-3" />}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 rounded-lg bg-crimson-50 px-2 py-1.5 text-[9.5px] leading-snug text-crimson-700">
          The shop confirms the delivery time — no rushed promises.
        </p>
        <Tap className="left-8 top-14" delay={0.6} />
        <div className="relative mt-auto w-full rounded-xl bg-gradient-to-br from-crimson-500 to-crimson-700 py-2.5 text-center text-[12px] font-bold text-white shadow-crimson">
          Place order · Rs. 1,020
          <Tap className="right-8 -top-1" delay={1.8} />
        </div>
      </div>
    </>
  );
}

/* ---- Placing spinner ---- */
function PlacingScene() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-paper">
      <motion.span
        className="h-12 w-12 rounded-full border-[3px] border-crimson-100 border-t-crimson-500"
        animate={{ rotate: 360 }}
        transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
      />
      <div className="text-[12px] font-semibold text-ink-600">Placing your order…</div>
    </div>
  );
}

/* ---- Order placed ---- */
function PlacedScene() {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-3 overflow-hidden bg-paper">
      {[...Array(10)].map((_, k) => (
        <motion.span
          key={k}
          className="absolute h-1.5 w-1.5 rounded-sm"
          style={{
            left: `${12 + k * 8}%`,
            backgroundColor: k % 2 ? "#E11945" : "#F6A609",
          }}
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: [-10, 120], opacity: [1, 1, 0] }}
          transition={{ duration: 1.4, delay: 0.2 + (k % 5) * 0.08, ease: "easeIn" }}
        />
      ))}
      <motion.span
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: [0.3, 1.15, 1], opacity: 1 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0E9F6E] text-white shadow-lg"
      >
        <Check className="h-8 w-8" strokeWidth={3} />
      </motion.span>
      <div className="text-[15px] font-extrabold text-ink-900">Order placed!</div>
      <div className="text-[11px] text-ink-500">#GP-2043 · Namaste Kirana</div>
    </div>
  );
}

/* ---- Track ---- */
function TrackScene() {
  const [p, setP] = React.useState(0);
  React.useEffect(() => {
    const ts = [
      window.setTimeout(() => setP(1), 600),
      window.setTimeout(() => setP(2), 1500),
      window.setTimeout(() => setP(3), 2500),
    ];
    return () => ts.forEach((t) => window.clearTimeout(t));
  }, []);
  const steps = ["Placed", "Accepted by shop", "Packing your order", "Out for delivery"];
  return (
    <>
      <AppBar>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-crimson-600">
            <Truck className="h-4 w-4" />
          </span>
          <div>
            <div className="text-[13px] font-extrabold">Tracking your order</div>
            <div className="text-[10px] text-white/85">#GP-2043 · Namaste Kirana</div>
          </div>
        </div>
      </AppBar>
      <div className="flex flex-1 flex-col px-3 py-3">
        <div className="rounded-2xl border border-ink-100 bg-white p-3">
          {steps.map((label, idx) => (
            <TrackStep
              key={label}
              label={label}
              done={idx < p}
              active={idx === p}
              last={idx === steps.length - 1}
            />
          ))}
          <p className="mt-1 rounded-lg bg-crimson-50 px-2 py-1.5 text-[9.5px] leading-snug text-crimson-700">
            Namaste Kirana sets the delivery time and keeps you posted.
          </p>
        </div>
        <div className="mt-auto flex items-center gap-2.5 rounded-2xl border border-crimson-200 bg-white p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-crimson-500 text-[12px] font-bold text-white">
            R
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[12px] font-bold text-ink-900">Ramesh · Shopkeeper</div>
            <div className="text-[10px] text-ink-500">Usually replies quickly</div>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-crimson-500 text-white">
            <Phone className="h-4 w-4" />
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-crimson-200 text-crimson-700">
            <MessageCircle className="h-4 w-4" />
          </span>
        </div>
      </div>
    </>
  );
}

function TrackStep({
  label,
  done,
  active,
  last,
}: {
  label: string;
  done?: boolean;
  active?: boolean;
  last?: boolean;
}) {
  return (
    <div className="flex gap-2.5">
      <div className="flex flex-col items-center">
        <span
          className={
            "flex h-4 w-4 items-center justify-center rounded-full transition-colors " +
            (done
              ? "bg-[#0E9F6E] text-white"
              : active
                ? "bg-crimson-500 text-white"
                : "border-2 border-ink-200 bg-white")
          }
        >
          {done ? (
            <Check className="h-2.5 w-2.5" />
          ) : active ? (
            <motion.span
              className="h-1.5 w-1.5 rounded-full bg-white"
              animate={{ scale: [1, 1.6, 1], opacity: [1, 0.6, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : null}
        </span>
        {!last && (
          <span
            className={"my-0.5 w-0.5 flex-1 transition-colors " + (done ? "bg-[#0E9F6E]" : "bg-ink-200")}
            style={{ minHeight: 14 }}
          />
        )}
      </div>
      <span
        className={
          "pb-2 text-[11px] transition-colors " +
          (active
            ? "font-bold text-ink-900"
            : done
              ? "font-medium text-ink-700"
              : "text-ink-400")
        }
      >
        {label}
      </span>
    </div>
  );
}

/* ---- Delivered ---- */
function DeliveredScene() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-paper px-6 text-center">
      <motion.span
        initial={{ scale: 0.3, opacity: 0, rotate: -10 }}
        animate={{ scale: [0.3, 1.12, 1], opacity: 1, rotate: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0E9F6E] text-white shadow-lg"
      >
        <PackageCheck className="h-8 w-8" strokeWidth={2.2} />
      </motion.span>
      <div className="text-[15px] font-extrabold text-ink-900">Delivered!</div>
      <div className="text-[11px] leading-snug text-ink-500">
        Your order from Namaste Kirana has arrived. Enjoy!
      </div>
    </div>
  );
}

/* ---- Rate ---- */
function RateScene() {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    const ts = [1, 2, 3, 4, 5].map((v) =>
      window.setTimeout(() => setN(v), 500 + v * 320),
    );
    return () => ts.forEach((t) => window.clearTimeout(t));
  }, []);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-paper px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-crimson-50 text-2xl">
        🛒
      </span>
      <div className="text-[13px] font-extrabold text-ink-900">How was your order?</div>
      <div className="text-[10px] text-ink-500">Namaste Kirana · #GP-2043</div>
      <div className="relative mt-1 flex gap-1.5">
        {[0, 1, 2, 3, 4].map((idx) => {
          const on = idx < n;
          return (
            <motion.span
              key={idx}
              animate={on ? { scale: [1, 1.4, 1] } : { scale: 1 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <Star
                className={"h-7 w-7 " + (on ? "fill-[#F6A609] text-[#F6A609]" : "text-ink-200")}
              />
            </motion.span>
          );
        })}
        <Tap className="-top-1 left-0" delay={0.5} />
      </div>
      {n >= 5 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="mt-1 rounded-full bg-crimson-500 px-4 py-1.5 text-[11px] font-bold text-white shadow-crimson"
        >
          Thanks for rating! 🙏
        </motion.div>
      )}
    </div>
  );
}

export default PhoneMockup;

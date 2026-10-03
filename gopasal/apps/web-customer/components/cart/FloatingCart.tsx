"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/providers";
import { rs } from "@/lib/format";

type CartEvent = CustomEvent<{ name: string; x: number; y: number }>;

export function FloatingCart() {
  const { count, subtotal } = useCart();
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const targetRef = React.useRef<HTMLAnchorElement>(null);
  const [flight, setFlight] = React.useState<{ id: number; x: number; y: number; tx: number; ty: number } | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let messageTimer = 0;
    const added = (event: Event) => {
      const detail = (event as CartEvent).detail;
      const target = targetRef.current?.getBoundingClientRect();
      if (target && !reduceMotion) {
        setFlight({ id: Date.now(), x: detail.x, y: detail.y, tx: target.left + target.width / 2, ty: target.top + target.height / 2 });
        window.setTimeout(() => setFlight(null), 720);
      }
      setMessage(`${detail.name} added to your cart`);
      window.clearTimeout(messageTimer);
      messageTimer = window.setTimeout(() => setMessage(null), 2400);
    };
    window.addEventListener("gopasal:cart-added", added);
    return () => { window.removeEventListener("gopasal:cart-added", added); window.clearTimeout(messageTimer); };
  }, [reduceMotion]);

  const cartSuppressed = pathname === "/cart" || pathname === "/messages";

  return (
    <>
      <AnimatePresence>
        {flight && <motion.span key={flight.id} className="pointer-events-none fixed z-[120] grid h-10 w-10 place-items-center rounded-full bg-crimson-500 text-white shadow-float" initial={{ left: flight.x - 20, top: flight.y - 20, scale: 1, opacity: 1 }} animate={{ left: flight.tx - 20, top: flight.ty - 20, scale: 0.45, opacity: 0.2, rotate: 22 }} exit={{ opacity: 0 }} transition={{ duration: 0.68, ease: [0.22, 1, 0.36, 1] }}><ShoppingBag className="h-5 w-5" /></motion.span>}
      </AnimatePresence>

      <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[80] flex justify-center px-4 sm:inset-x-auto sm:right-5 sm:justify-end sm:px-0">
        <AnimatePresence>
          {message && !cartSuppressed && <motion.div role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="pointer-events-none absolute bottom-[4.5rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-ink-100 bg-white px-4 py-2.5 text-sm font-semibold text-ink-800 shadow-float sm:right-0 sm:w-max">{message}</motion.div>}
        </AnimatePresence>
        <motion.div animate={{ scale: count > 0 && !cartSuppressed ? 1 : 0.72, opacity: count > 0 && !cartSuppressed ? 1 : 0 }} className={count > 0 && !cartSuppressed ? "pointer-events-auto" : "pointer-events-none"}>
          <Link ref={targetRef} href="/cart" aria-label={`Open cart with ${count} items`} className="flex min-h-14 items-center gap-3 rounded-2xl bg-ink-900 px-3 py-2.5 text-white shadow-float transition hover:-translate-y-0.5 hover:bg-ink-800 sm:min-w-[260px]">
            <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-crimson-500"><ShoppingBag className="h-5 w-5" /><span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-marigold-400 px-1 text-[11px] font-black text-ink-900">{count}</span></span>
            <span className="min-w-0 flex-1"><span className="block text-xs text-white/65">Your cart</span><strong className="block text-sm">{count} {count === 1 ? "item" : "items"} · {rs(subtotal)}</strong></span>
            <span className="inline-flex items-center gap-1 text-sm font-bold">View <ArrowRight className="h-4 w-4" /></span>
          </Link>
        </motion.div>
      </div>
    </>
  );
}

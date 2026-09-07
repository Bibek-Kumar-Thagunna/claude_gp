"use client";

import * as React from "react";
import type { Lang } from "@/lib/i18n";
import type { Product, Store } from "@/lib/data";

/* ------------------------------- Language -------------------------------- */

type LangCtx = { lang: Lang; setLang: (l: Lang) => void; toggle: () => void };
const LanguageContext = React.createContext<LangCtx | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>("en");

  React.useEffect(() => {
    const saved = (typeof window !== "undefined" && window.localStorage.getItem("gp-lang")) as
      | Lang
      | null;
    if (saved === "en" || saved === "np") setLangState(saved);
  }, []);

  const setLang = React.useCallback((l: Lang) => {
    setLangState(l);
    document.documentElement.lang = l === "np" ? "ne" : "en";
    try {
      window.localStorage.setItem("gp-lang", l);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = React.useCallback(() => setLang(lang === "en" ? "np" : "en"), [lang, setLang]);

  const value = React.useMemo(() => ({ lang, setLang, toggle }), [lang, setLang, toggle]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  const ctx = React.useContext(LanguageContext);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
}

/* --------------------------------- Cart ---------------------------------- */

export type CartLine = { product: Product; storeSlug: string; qty: number };
type CartCtx = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (product: Product, store: Store) => void;
  remove: (id: string) => void;
  clear: () => void;
};
const CartContext = React.createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = React.useState<CartLine[]>([]);

  const add = React.useCallback((product: Product, store: Store) => {
    setLines((prev) => {
      // Single-store cart rule: switching stores replaces the cart.
      const differentStore = prev.length > 0 && prev[0]!.storeSlug !== store.slug;
      const base = differentStore ? [] : prev;
      const existing = base.find((l) => l.product.id === product.id);
      if (existing) {
        return base.map((l) =>
          l.product.id === product.id ? { ...l, qty: l.qty + 1 } : l,
        );
      }
      return [...base, { product, storeSlug: store.slug, qty: 1 }];
    });
  }, []);

  const remove = React.useCallback((id: string) => {
    setLines((prev) =>
      prev
        .map((l) => (l.product.id === id ? { ...l, qty: l.qty - 1 } : l))
        .filter((l) => l.qty > 0),
    );
  }, []);

  const clear = React.useCallback(() => setLines([]), []);

  const count = lines.reduce((n, l) => n + l.qty, 0);
  const subtotal = lines.reduce((n, l) => n + l.qty * l.product.price, 0);

  const value = React.useMemo(
    () => ({ lines, count, subtotal, add, remove, clear }),
    [lines, count, subtotal, add, remove, clear],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = React.useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

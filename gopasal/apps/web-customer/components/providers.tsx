"use client";

import * as React from "react";
import { ApiError, type ApiUser, type Session, type TokenPair } from "@gopasal/api-client";
import type { Lang } from "@/lib/i18n";
import type { Product, Store } from "@/lib/data";
import { customerApi, type CartWire } from "@/lib/api/customer";
import {
  clearSession,
  fetchMe,
  getSession,
  revokeSession,
  sessionFrom,
  setSession,
  subscribe,
  watchStorage,
} from "@/lib/api/client";

type LangCtx = { lang: Lang; setLang: (l: Lang) => void; toggle: () => void };
const LanguageContext = React.createContext<LangCtx | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>("en");
  React.useEffect(() => {
    const saved = window.localStorage.getItem("gp-lang") as Lang | null;
    if (saved === "en" || saved === "np") setLangState(saved);
  }, []);
  const setLang = React.useCallback((next: Lang) => {
    setLangState(next);
    document.documentElement.lang = next === "np" ? "ne" : "en";
    window.localStorage.setItem("gp-lang", next);
  }, []);
  const toggle = React.useCallback(() => setLang(lang === "en" ? "np" : "en"), [lang, setLang]);
  return (
    <LanguageContext.Provider value={{ lang, setLang, toggle }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const value = React.useContext(LanguageContext);
  if (!value) throw new Error("useLang must be used within LanguageProvider");
  return value;
}

type AuthCtx = {
  status: "loading" | "anonymous" | "authenticated";
  user: ApiUser | null;
  signIn: (tokens: TokenPair, user: ApiUser) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
};
const AuthContext = React.createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setLocalSession] = React.useState<Session | null>(null);
  const [status, setStatus] = React.useState<AuthCtx["status"]>("loading");
  const [user, setUser] = React.useState<ApiUser | null>(null);

  React.useEffect(() => {
    const stored = getSession();
    setLocalSession(stored);
    setUser(stored?.user ?? null);
    setStatus(stored ? "authenticated" : "anonymous");
    const stop = subscribe(setLocalSession);
    const stopStorage = watchStorage();
    return () => {
      stop();
      stopStorage();
    };
  }, []);

  React.useEffect(() => {
    if (!session) {
      setUser(null);
      setStatus("anonymous");
      return;
    }
    const controller = new AbortController();
    void fetchMe(controller.signal)
      .then((me) => {
        setUser(me.user);
        setStatus("authenticated");
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.isAuth) {
          clearSession();
          setUser(null);
          setStatus("anonymous");
        }
      });
    return () => controller.abort();
  }, [session]);

  const signIn = React.useCallback(async (tokens: TokenPair, nextUser: ApiUser) => {
    setSession(sessionFrom(tokens, nextUser));
    setUser(nextUser);
    setStatus("authenticated");
  }, []);
  const signOut = React.useCallback(async () => {
    const stored = getSession();
    clearSession();
    setUser(null);
    setStatus("anonymous");
    if (stored)
      try {
        await revokeSession(stored.refreshToken);
      } catch {
        /* local sign-out still succeeds */
      }
  }, []);

  const reload = React.useCallback(async () => {
    const me = await fetchMe();
    setUser(me.user);
    setStatus("authenticated");
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, signIn, signOut, reload }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = React.useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}

type SavedCtx = {
  shopIds: ReadonlySet<string>;
  productIds: ReadonlySet<string>;
  loading: boolean;
  isShopSaved: (shopId: string) => boolean;
  isProductSaved: (productId: string) => boolean;
  toggleShop: (shopId: string) => Promise<void>;
  toggleProduct: (productId: string) => Promise<void>;
  reload: () => Promise<void>;
};
const SavedContext = React.createContext<SavedCtx | null>(null);

export function SavedProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const [shopIds, setShopIds] = React.useState<ReadonlySet<string>>(new Set());
  const [productIds, setProductIds] = React.useState<ReadonlySet<string>>(new Set());
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    if (auth.status !== "authenticated") {
      setShopIds(new Set());
      setProductIds(new Set());
      return;
    }
    setLoading(true);
    try {
      const result = await customerApi.savedIds();
      setShopIds(new Set(result.shopIds));
      setProductIds(new Set(result.productIds));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load saved items");
    } finally {
      setLoading(false);
    }
  }, [auth.status]);

  React.useEffect(() => {
    if (auth.status !== "loading") void reload();
  }, [auth.status, reload]);

  React.useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [error]);

  const toggleShop = React.useCallback(
    async (shopId: string) => {
      const wasSaved = shopIds.has(shopId);
      setShopIds((current) => {
        const next = new Set(current);
        if (wasSaved) next.delete(shopId);
        else next.add(shopId);
        return next;
      });
      try {
        if (wasSaved) await customerApi.removeSavedShop(shopId);
        else await customerApi.saveShop(shopId);
        setError(null);
        window.dispatchEvent(
          new CustomEvent("gopasal:saved-changed", {
            detail: { kind: "shop", id: shopId, saved: !wasSaved },
          }),
        );
      } catch (cause) {
        setShopIds((current) => {
          const next = new Set(current);
          if (wasSaved) next.add(shopId);
          else next.delete(shopId);
          return next;
        });
        const message = cause instanceof Error ? cause.message : "Could not update saved shops";
        setError(message);
        throw cause;
      }
    },
    [shopIds],
  );

  const toggleProduct = React.useCallback(
    async (productId: string) => {
      const wasSaved = productIds.has(productId);
      setProductIds((current) => {
        const next = new Set(current);
        if (wasSaved) next.delete(productId);
        else next.add(productId);
        return next;
      });
      try {
        if (wasSaved) await customerApi.removeSavedProduct(productId);
        else await customerApi.saveProduct(productId);
        setError(null);
        window.dispatchEvent(
          new CustomEvent("gopasal:saved-changed", {
            detail: { kind: "product", id: productId, saved: !wasSaved },
          }),
        );
      } catch (cause) {
        setProductIds((current) => {
          const next = new Set(current);
          if (wasSaved) next.add(productId);
          else next.delete(productId);
          return next;
        });
        const message = cause instanceof Error ? cause.message : "Could not update saved products";
        setError(message);
        throw cause;
      }
    },
    [productIds],
  );

  const value = React.useMemo<SavedCtx>(
    () => ({
      shopIds,
      productIds,
      loading,
      isShopSaved: (shopId) => shopIds.has(shopId),
      isProductSaved: (productId) => productIds.has(productId),
      toggleShop,
      toggleProduct,
      reload,
    }),
    [loading, productIds, reload, shopIds, toggleProduct, toggleShop],
  );

  return (
    <SavedContext.Provider value={value}>
      {children}
      {error && (
        <div
          role="alert"
          className="fixed bottom-24 left-1/2 z-[120] w-[min(92vw,28rem)] -translate-x-1/2 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700 shadow-float"
        >
          {error}
        </div>
      )}
    </SavedContext.Provider>
  );
}

export function useSaved() {
  const value = React.useContext(SavedContext);
  if (!value) throw new Error("useSaved must be used within SavedProvider");
  return value;
}

export type CartLine = {
  id: string;
  product: Product;
  storeSlug: string;
  qty: number;
  variantId: string | null;
  variantName: string | null;
  image: string | null;
  lineTotal: number;
};
type CartCtx = {
  lines: CartLine[];
  count: number;
  subtotal: number;
  store: CartWire["shop"];
  meetsMinOrder: boolean;
  loading: boolean;
  error: string | null;
  add: (product: Product, store: Store, variantId?: string | null) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setQuantity: (id: string, qty: number) => Promise<void>;
  quantityFor: (productId: string, variantId?: string | null) => number;
  clear: () => Promise<void>;
  reload: () => Promise<void>;
};
const CartContext = React.createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const [cart, setCart] = React.useState<CartWire | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    if (!getSession()) {
      setCart(null);
      return;
    }
    setLoading(true);
    try {
      setCart(await customerApi.cart());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load cart");
    } finally {
      setLoading(false);
    }
  }, []);
  React.useEffect(() => {
    if (status !== "loading") void reload();
  }, [status, reload]);

  const add = React.useCallback(
    async (product: Product, _store: Store, variantId?: string | null) => {
      setLoading(true);
      try {
        const selected =
          variantId ?? (product.variants.length === 1 ? product.variants[0]!.id : null);
        setCart(await customerApi.addCartItem(product.id, selected));
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not add item");
        throw cause;
      } finally {
        setLoading(false);
      }
    },
    [],
  );
  const remove = React.useCallback(
    async (productId: string) => {
      const line = cart?.items.find((item) => item.productId === productId);
      if (!line) return;
      setCart(
        line.qty <= 1
          ? await customerApi.removeCartItem(line.id)
          : await customerApi.setCartQty(line.id, line.qty - 1),
      );
    },
    [cart],
  );
  const setQuantity = React.useCallback(async (id: string, qty: number) => {
    setLoading(true);
    try {
      setCart(
        qty <= 0 ? await customerApi.removeCartItem(id) : await customerApi.setCartQty(id, qty),
      );
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update quantity");
      throw cause;
    } finally {
      setLoading(false);
    }
  }, []);
  const quantityFor = React.useCallback(
    (productId: string, variantId?: string | null) => {
      const normalizedVariant = variantId || null;
      return (
        cart?.items.find(
          (item) => item.productId === productId && item.variantId === normalizedVariant,
        )?.qty ?? 0
      );
    },
    [cart],
  );
  const clear = React.useCallback(async () => {
    setCart(await customerApi.clearCart());
  }, []);

  const lines = React.useMemo<CartLine[]>(
    () =>
      (cart?.items ?? []).map((item) => ({
        id: item.id,
        storeSlug: cart?.shop?.slug ?? "",
        qty: item.qty,
        variantId: item.variantId,
        variantName: item.variantName,
        image: item.image,
        lineTotal: item.lineTotal,
        product: {
          id: item.productId,
          name: item.name,
          price: item.unitPrice,
          unit: item.unit,
          image: item.image ?? undefined,
          variants: [],
        },
      })),
    [cart],
  );

  return (
    <CartContext.Provider
      value={{
        lines,
        count: cart?.itemCount ?? 0,
        subtotal: cart?.subtotal ?? 0,
        store: cart?.shop ?? null,
        meetsMinOrder: cart?.meetsMinOrder ?? false,
        loading,
        error,
        add,
        remove,
        setQuantity,
        quantityFor,
        clear,
        reload,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const value = React.useContext(CartContext);
  if (!value) throw new Error("useCart must be used within CartProvider");
  return value;
}

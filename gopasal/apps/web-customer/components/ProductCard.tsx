"use client";

import * as React from "react";
import { Plus, Check } from "lucide-react";
import { motion } from "framer-motion";
import type { Product, Store } from "@/lib/data";
import { rs } from "@/lib/format";
import { useCart } from "@/components/providers";
import { Badge } from "@/components/primitives";

export function ProductCard({ product, store }: { product: Product; store: Store }) {
  const { add } = useCart();
  const [added, setAdded] = React.useState(false);

  const onAdd = () => {
    add(product, store);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1100);
  };

  const off = product.mrp ? Math.round(((product.mrp - product.price) / product.mrp) * 100) : 0;

  return (
    <div className="gp-card flex flex-col p-3">
      <div className="relative mb-3 flex h-24 items-center justify-center overflow-hidden rounded-md bg-ink-50">
        <span className="text-4xl">{store.emoji}</span>
        {product.tag && (
          <div className="absolute left-2 top-2">
            <Badge tone="marigold">{product.tag}</Badge>
          </div>
        )}
        {off > 0 && (
          <div className="absolute right-2 top-2 rounded-full bg-crimson-500 px-2 py-0.5 text-xs font-bold text-white">
            -{off}%
          </div>
        )}
      </div>

      <h4 className="line-clamp-2 text-sm font-semibold leading-snug text-ink-900">{product.name}</h4>
      <p className="mt-0.5 text-xs text-ink-400">{product.unit}</p>

      <div className="mt-auto flex items-end justify-between pt-3">
        <div>
          <div className="font-display text-base font-bold text-ink-900">{rs(product.price)}</div>
          {product.mrp && (
            <div className="text-xs text-ink-400 line-through">{rs(product.mrp)}</div>
          )}
        </div>
        <motion.button
          onClick={onAdd}
          whileTap={{ scale: 0.9 }}
          aria-label={`Add ${product.name} to cart`}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition ${
            added
              ? "border-[#0E9F6E] bg-[#0E9F6E] text-white"
              : "border-crimson-200 bg-crimson-50 text-crimson-600 hover:bg-crimson-500 hover:text-white"
          }`}
        >
          {added ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </motion.button>
      </div>
    </div>
  );
}

export default ProductCard;

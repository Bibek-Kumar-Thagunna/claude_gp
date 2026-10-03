import type { Cart } from "./customer";

/**
 * The cart, as it will look once a quantity change lands.
 *
 * This is the app doing arithmetic, which everywhere else it refuses to do —
 * the server prices the basket and the server is the only party that may.
 * The exception is the half-second between tapping `+` and the write
 * returning. Leaving the server's previous `subtotal` on screen while the rows
 * already show the new quantity gives the customer a basket whose lines and
 * total disagree, at exactly the moment they are looking at them. So the
 * derived figures are recomputed alongside the lines, and thrown away the
 * moment the server answers.
 *
 * Pure, and separate from the mutation that calls it, because this is the one
 * piece of pricing the app owns and an error in it is an error the customer
 * sees.
 *
 * `qty <= 0` removes the line: the stepper's minus button at one is a delete,
 * and the caller should not have to know that.
 */
export function applyQtyChange(cart: Cart, itemId: string, qty: number): Cart {
  const items =
    qty <= 0
      ? cart.items.filter((i) => i.id !== itemId)
      : cart.items.map((i) => (i.id === itemId ? { ...i, qty, lineTotal: i.unitPrice * qty } : i));

  const subtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);

  return {
    ...cart,
    items,
    subtotal,
    itemCount: items.reduce((n, i) => n + i.qty, 0),
    // An empty basket does not "meet" a minimum — it has nothing to meet it
    // with — and a shop with no minimum is met by anything, including nothing.
    meetsMinOrder: items.length > 0 && subtotal >= cart.minOrder,
  };
}

/**
 * Delivery fee model (NPR). Flat base covers the first `freeKm`, then a per-km
 * rate applies. A shop/zone can override with a fixed fee. Kept in one place so
 * discovery (quote), cart (estimate) and orders (charge) always agree.
 */
export interface DeliveryFeeOptions {
  override?: number | null;
  baseFee?: number;
  freeKm?: number;
  perKm?: number;
  maxFee?: number;
}

export function computeDeliveryFee(distanceMeters: number, opts: DeliveryFeeOptions = {}): number {
  if (opts.override != null) return Math.max(0, Math.round(opts.override));
  const { baseFee = 40, freeKm = 2, perKm = 15, maxFee = 250 } = opts;
  const km = distanceMeters / 1000;
  const extra = Math.max(0, km - freeKm) * perKm;
  return Math.min(maxFee, Math.round(baseFee + extra));
}

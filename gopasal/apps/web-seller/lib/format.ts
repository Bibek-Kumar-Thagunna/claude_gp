/** Nepali Rupee + date/number formatting for the seller dashboard. */
const nf = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function rs(amount: number): string {
  return `रु ${nf.format(Math.round(amount))}`;
}

export function num(n: number): string {
  return nf.format(n);
}

/** Compact relative time for order feeds ("3m ago", "2h ago"). */
export function ago(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now.getTime() - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/*
 * There is deliberately no `minutesUntil` here any more.
 *
 * It read "minutes remaining until an SLA deadline; negative means overdue", and
 * nothing called it — because there is no such deadline. No order, delivery or
 * shop column holds one, no seller route returns one, and GoPasal makes no
 * delivery-time promise anywhere by design. A helper that names a deadline is an
 * invitation to render a countdown the platform cannot honour, so it is gone
 * rather than left waiting for a caller.
 *
 * `rsPlain` ("Rs. 1,200") and `pct` went with it: both were unused, and one
 * currency spelling — `rs`, which prints रु — is the point.
 */

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function dayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

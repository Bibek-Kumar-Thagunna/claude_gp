/** Nepali Rupee formatting, Indian/Nepali digit grouping (lakh/crore). */
const nf = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function rs(amount: number): string {
  return `रु ${nf.format(Math.round(amount))}`;
}

export function rsPlain(amount: number): string {
  return `Rs. ${nf.format(Math.round(amount))}`;
}

/** Distance helper — shops advertise their own coverage, we never promise a time. */
export function km(distance: number): string {
  return `${distance.toFixed(1)} km`;
}

/* ── Nepal time, formatted deterministically ──────────────────────────────────
 * Asia/Kathmandu is UTC+05:45 and has no daylight saving, so shifting the
 * instant and reading UTC fields gives the same string on the server and in the
 * browser. `toLocaleString` would not: it follows the machine's timezone and
 * would break hydration for anyone outside Nepal.
 */

const NPT_OFFSET_MS = 345 * 60_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const npt = (iso: string) => new Date(new Date(iso).getTime() + NPT_OFFSET_MS);

/** "9:48 AM" in Nepal time. */
export function timeNp(iso: string): string {
  const d = npt(iso);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  const suffix = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

/** "22 Aug 2026" in Nepal time. */
export function dayNp(iso: string): string {
  const d = npt(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "22 Aug 2026, 9:48 AM". */
export function stampNp(iso: string): string {
  return `${dayNp(iso)}, ${timeNp(iso)}`;
}

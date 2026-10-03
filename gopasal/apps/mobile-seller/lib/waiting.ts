/**
 * How long somebody has been waiting, and how loudly to say so.
 *
 * ## Why this is a file rather than four functions in `OrderCard.tsx`
 *
 * It lived there, next to `useMinutesSince`, and that hook cannot be loaded
 * outside a phone: the module it sits in imports `react-native` for `AppState`
 * and `@expo/vector-icons` for the clock face. The arithmetic underneath the
 * hook is the part that can be wrong in a way a shopkeeper pays for — a
 * negative wait, an hour that never arrives, a "waiting 0 min" on an order
 * placed yesterday — and it has no need of any of that. So it is here, taking
 * `now` as an argument the way `chat-time.ts` next door does, and `OrderCard`
 * imports it.
 *
 * Behaviour is unchanged from when it lived in the card. `minutesSince` is the
 * body of `useMinutesSince` with the clock reading passed in instead of read
 * from a store, and the three label functions are verbatim.
 */

/** What `useT()` returns, described structurally so this file imports no UI. */
type Translate = (key: string, vars?: Record<string, string | number>, fallback?: string) => string;

const MINUTE = 60_000;

/**
 * Whole minutes between an ISO timestamp and a moment.
 *
 * Clamped at zero, which is not tidiness. Phone clocks on a counter in Nepal
 * drift, and an order stamped by the server two minutes ahead of this handset
 * would otherwise render as "waiting -2 min" — which reads as the app being
 * broken rather than the clock being wrong, and is the kind of thing a
 * shopkeeper screenshots.
 *
 * An absent or unparseable date is also zero. It is the honest floor: the app
 * knows the order exists and does not know when it was placed, and inventing a
 * wait from a `NaN` would be worse than admitting to none.
 */
export function minutesSince(iso: string | null | undefined, now: number): number {
  const started = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.floor((now - started) / MINUTE));
}

/** "waiting 7 min" — phrased as the customer's experience, not the clock's. */
export function waitingLabel(minutes: number, t: Translate): string {
  if (minutes < 1) return t("queue.justNow");
  if (minutes < 60) return t("queue.waiting", { minutes });
  return longAgo(minutes, t);
}

/** "12 min ago" — for orders already in hand, where elapsed time is context. */
export function agoLabel(minutes: number, t: Translate): string {
  if (minutes < 1) return t("queue.justNow");
  if (minutes < 60) return t("queue.minutesAgo", { minutes });
  return longAgo(minutes, t);
}

/**
 * Past the hour: hours for today, days after that. "188 h ago" is arithmetic
 * the shopkeeper has to do; "7 days ago" is an answer.
 */
export function longAgo(minutes: number, t: Translate): string {
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("queue.hoursAgo", { hours });
  const days = Math.floor(hours / 24);
  return days === 1 ? t("queue.dayAgo") : t("queue.daysAgo", { days });
}

/**
 * How loudly a waiting time is drawn.
 *
 * The thresholds are the shop's promise, not a measurement: under ten minutes a
 * customer is simply waiting, past twenty they are wondering whether anybody
 * saw the order. Colour is the only thing that changes — the number stays the
 * number, so a card never overstates what it knows.
 */
export function urgency(minutes: number): "brand" | "warning" | "danger" {
  if (minutes >= 20) return "danger";
  if (minutes >= 10) return "warning";
  return "brand";
}

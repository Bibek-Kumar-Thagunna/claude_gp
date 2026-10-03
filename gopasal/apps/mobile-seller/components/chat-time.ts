/**
 * "5m", "3h", "Tue" — the stamp on a conversation row.
 *
 * Split into a pure classifier and a formatter so the awkward part is testable
 * without a renderer or a clock. `now` is an argument rather than a call to
 * `Date.now()` inside, because a function that reads the clock itself can only
 * be tested by mocking global time, which is how a test suite acquires a
 * dependency on the order its files run in.
 *
 * The scale is deliberately coarser than the customer app's. A shopkeeper
 * glancing at an inbox between customers is asking "is this from the last five
 * minutes or from yesterday", not "was it 43 or 47 minutes ago" — so minutes
 * and hours are bare numbers, the last week is a weekday, and anything older is
 * a date. Nothing here is ever longer than four characters, which is what keeps
 * it out of the way of the name beside it.
 */

export type ChatStamp =
  | { kind: "now" }
  | { kind: "minutes"; value: number }
  | { kind: "hours"; value: number }
  | { kind: "weekday"; at: Date }
  | { kind: "date"; at: Date }
  | { kind: "none" };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Classify an ISO timestamp against a moment.
 *
 * A timestamp in the future is reported as `now` rather than as a negative
 * count: phone clocks in Nepal drift, and "−2m" beside a message that plainly
 * just arrived reads as a bug in the app rather than a bug in the clock.
 */
export function chatStamp(iso: string | null | undefined, now: number): ChatStamp {
  if (!iso) return { kind: "none" };
  const at = new Date(iso);
  const time = at.getTime();
  if (Number.isNaN(time)) return { kind: "none" };

  const elapsed = now - time;
  if (elapsed < MINUTE) return { kind: "now" };
  if (elapsed < HOUR) return { kind: "minutes", value: Math.floor(elapsed / MINUTE) };
  if (elapsed < DAY) return { kind: "hours", value: Math.floor(elapsed / HOUR) };
  if (elapsed < 7 * DAY) return { kind: "weekday", at };
  return { kind: "date", at };
}

type Translate = (key: string, vars?: Record<string, string | number>, fallback?: string) => string;

/**
 * Render a stamp.
 *
 * Weekdays and dates go through `toLocaleDateString` rather than the dictionary
 * on purpose: the platform already knows how to name a Tuesday in the phone's
 * language, and a hand-written table of seven names per language is a list that
 * eventually disagrees with the calendar the same phone shows elsewhere.
 */
export function formatChatStamp(stamp: ChatStamp, t: Translate): string {
  switch (stamp.kind) {
    case "none":
      return "";
    case "now":
      return t("chat.time.now");
    case "minutes":
      return t("chat.time.minutes", { count: stamp.value });
    case "hours":
      return t("chat.time.hours", { count: stamp.value });
    case "weekday":
      return stamp.at.toLocaleDateString([], { weekday: "short" });
    case "date":
      return stamp.at.toLocaleDateString([], { day: "numeric", month: "short" });
  }
}

/** The clock time inside a bubble, where the date is already known from context. */
export function messageClock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

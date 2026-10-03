/**
 * Writes that survive the network, the app being killed, and the phone dying.
 *
 * A browser can usually get away with "show an error, let them click again".
 * A phone cannot: the customer taps *Add to cart* while the lift doors close,
 * the request dies, and if that intent lives only in a promise it is gone —
 * along with their place in the flow. Worse, the naive fix (retry the POST when
 * the signal returns) is how people end up with two orders, because a lost
 * reply is indistinguishable from a lost request.
 *
 * So every mutation is written to disk *first*, as an entry with a stable
 * idempotency key, and only then attempted. The key is what makes replay safe:
 * the server (see `IdempotencyService`) hands back the entity it already
 * created instead of creating a second one. That is the whole contract — the
 * queue is durable on this side and deduplicated on the other.
 *
 * What deliberately does **not** go in here: anything the user is watching
 * finish. Checkout is queued, because losing an order is unacceptable; a
 * coupon *preview* is not, because a stale answer to a question nobody is
 * asking any more is worse than no answer.
 */
import type { Http, RequestOptions } from "./http";
import { ApiError } from "./http";
import type { KeyValueStore } from "./store";

const STORAGE_KEY = "gopasal.outbox.v1";
/** Past this many failures an entry is parked rather than retried for ever. */
const MAX_ATTEMPTS = 8;

export type OutboxEntry = {
  id: string;
  path: string;
  method: NonNullable<RequestOptions["method"]>;
  body?: unknown;
  idempotencyKey: string;
  /** What this is, in the user's words, for the "pending" UI. */
  label: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
  /** Set when the entry has failed permanently and needs a human decision. */
  parked?: boolean;
};

export type OutboxState = {
  entries: OutboxEntry[];
  flushing: boolean;
};

type Listener = (state: OutboxState) => void;

function uuid(): string {
  // `crypto.randomUUID` is present in Hermes on current RN, but this runs on
  // web too (the headless screenshots) and in older runtimes, so it falls back
  // rather than throwing at the one moment the user is placing an order.
  const c = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createOutbox(http: Http, store: KeyValueStore) {
  let entries: OutboxEntry[] = [];
  let flushing = false;
  let loaded = false;
  const listeners = new Set<Listener>();

  const snapshot = (): OutboxState => ({ entries: [...entries], flushing });
  const emit = () => {
    const state = snapshot();
    for (const l of listeners) l(state);
  };

  async function persist() {
    try {
      await store.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Storage full or unavailable. The queue still works for this session;
      // losing durability is bad but losing the running app is worse.
    }
  }

  async function load() {
    if (loaded) return;
    loaded = true;
    try {
      const raw = await store.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) entries = parsed as OutboxEntry[];
      }
    } catch {
      entries = [];
    }
    emit();
  }

  /**
   * Queue a write and try it now.
   *
   * Resolves with the server's answer when the attempt succeeds immediately —
   * which is the common case, and lets a caller `await` a checkout exactly as
   * if there were no queue. When the attempt fails for a network reason it
   * resolves `null`: the entry is on disk and will go out later, and the screen
   * should say so rather than pretending it failed.
   */
  async function enqueue<T>(entry: Omit<OutboxEntry, "id" | "createdAt" | "attempts" | "idempotencyKey"> & {
    idempotencyKey?: string;
  }): Promise<T | null> {
    await load();
    const record: OutboxEntry = {
      ...entry,
      id: uuid(),
      idempotencyKey: entry.idempotencyKey ?? uuid(),
      createdAt: Date.now(),
      attempts: 0,
    };
    entries = [...entries, record];
    await persist();
    emit();

    const result = await attemptOne<T>(record);
    return result.status === "done" ? (result.value as T) : null;
  }

  type Attempt<T> =
    | { status: "done"; value: T }
    | { status: "retry" }
    | { status: "failed"; error: ApiError };

  async function attemptOne<T>(entry: OutboxEntry): Promise<Attempt<T>> {
    try {
      const value = await http.request<T>(entry.path, {
        method: entry.method,
        body: entry.body,
        idempotencyKey: entry.idempotencyKey,
        // One attempt here; the outbox owns the retry schedule.
        maxAttempts: 1,
      });
      entries = entries.filter((e) => e.id !== entry.id);
      await persist();
      emit();
      return { status: "done", value };
    } catch (cause) {
      const error = cause instanceof ApiError ? cause : new ApiError(0, String(cause));

      // A rejection the server *meant* — an empty cart, a closed shop, a
      // coupon already used — will be rejected identically for ever. Retrying
      // it is noise, and silently dropping it hides a real problem from the
      // person waiting, so it is parked for the UI to surface.
      const permanent = error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429;

      entries = entries.map((e) =>
        e.id === entry.id
          ? {
              ...e,
              attempts: e.attempts + 1,
              lastError: error.message,
              parked: permanent || e.attempts + 1 >= MAX_ATTEMPTS,
            }
          : e,
      );
      await persist();
      emit();
      return permanent ? { status: "failed", error } : { status: "retry" };
    }
  }

  /**
   * Send everything waiting, oldest first.
   *
   * Strictly sequential, and it stops at the first entry that still cannot go
   * out. Order matters — "add to cart" then "check out" is not the same as the
   * reverse — and firing the queue in parallel at a link that has just come
   * back is how you turn one recovering connection into a stampede.
   */
  async function flush(): Promise<void> {
    await load();
    if (flushing) return;
    flushing = true;
    emit();
    try {
      for (const entry of [...entries].sort((a, b) => a.createdAt - b.createdAt)) {
        if (entry.parked) continue;
        const result = await attemptOne(entry);
        if (result.status === "retry") break;
      }
    } finally {
      flushing = false;
      emit();
    }
  }

  /** Drop a parked entry the user has acknowledged. */
  async function discard(id: string): Promise<void> {
    entries = entries.filter((e) => e.id !== id);
    await persist();
    emit();
  }

  /** Give a parked entry another go — the "Try again" button. */
  async function revive(id: string): Promise<void> {
    entries = entries.map((e) => (e.id === id ? { ...e, parked: false, attempts: 0 } : e));
    await persist();
    emit();
    await flush();
  }

  function subscribe(listener: Listener): () => void {
    listeners.add(listener);
    void load().then(() => listener(snapshot()));
    return () => listeners.delete(listener);
  }

  return { enqueue, flush, discard, revive, subscribe, snapshot, load };
}

export type Outbox = ReturnType<typeof createOutbox>;

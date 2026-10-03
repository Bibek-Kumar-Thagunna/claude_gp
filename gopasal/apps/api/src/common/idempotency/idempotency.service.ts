import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * Run a side-effecting request at most once, however many times it arrives.
 *
 * This exists because of one situation, and it is the normal situation for a
 * phone rather than an edge case: the customer taps *Place order* on a 3G link,
 * the request reaches the server and the order is created, and the *reply* is
 * lost on the way back. The app sees a timeout. Every sensible client retries a
 * timeout — and without this, that retry is a second real order, a second stock
 * decrement and, for cash on delivery, a second rider at the door.
 *
 * A double-tap produces exactly the same shape, minus the network.
 *
 * ## How a repeat is answered
 *
 * The key is claimed with `SET NX`, so the first request through wins and every
 * later one sees the claim. What it sees decides the answer:
 *
 *  - **`pending`** — the first attempt is still running. The retry is told 409
 *    rather than being queued, because two requests writing the same order is
 *    the thing being prevented, and a client that waits and asks again gets the
 *    real answer a moment later.
 *  - **a stored id** — the first attempt finished. The retry is handed the same
 *    entity, which is what makes the operation genuinely idempotent instead of
 *    merely guarded: the customer sees their order rather than an error about a
 *    request they never knowingly made twice.
 *
 * A *failed* first attempt releases the key. A customer whose checkout was
 * refused for an empty cart must be able to fix the cart and try again with the
 * same key; leaving the claim in place would lock them out of their own order
 * for the length of the TTL.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  /** How long a claim is held while the first attempt runs. */
  private static readonly PENDING_TTL_S = 90;
  /**
   * How long a completed result is replayable. A day covers a phone that was
   * put in a pocket mid-checkout and retried after the signal came back, while
   * still letting the key be reused eventually.
   */
  private static readonly DONE_TTL_S = 86_400;

  private static readonly PENDING = 'pending';

  constructor(private readonly redis: RedisService) {}

  /**
   * @param scope    the operation, so a key reused across endpoints cannot collide
   * @param userId   keys are per-user; one customer's key must never match another's
   * @param key      the client's `Idempotency-Key`, or null to opt out
   * @param work     performs the operation and returns the id to remember
   * @param replay   fetches the entity again for a repeated request
   */
  async once<T>(
    scope: string,
    userId: string,
    key: string | null | undefined,
    work: () => Promise<{ id: string; result: T }>,
    replay: (id: string) => Promise<T>,
  ): Promise<T> {
    // No key means a caller that has not opted in — the older web consoles, or
    // a script. They get the previous behaviour rather than a hard failure.
    if (!key) return (await work()).result;

    const redisKey = `idem:${scope}:${userId}:${key}`;
    const claimed = await this.redis.client.set(
      redisKey,
      IdempotencyService.PENDING,
      'EX',
      IdempotencyService.PENDING_TTL_S,
      'NX',
    );

    if (claimed !== 'OK') {
      const existing = await this.redis.client.get(redisKey);
      if (existing && existing !== IdempotencyService.PENDING) {
        this.logger.log(`Replaying ${scope} for key ${key} → ${existing}`);
        return replay(existing);
      }
      throw new ConflictException(
        'That request is already being processed. Give it a moment before trying again.',
      );
    }

    try {
      const { id, result } = await work();
      await this.redis.client.set(redisKey, id, 'EX', IdempotencyService.DONE_TTL_S);
      return result;
    } catch (error) {
      // Release, so a legitimate retry after a fixable rejection is allowed.
      await this.redis.client.del(redisKey).catch(() => undefined);
      throw error;
    }
  }
}

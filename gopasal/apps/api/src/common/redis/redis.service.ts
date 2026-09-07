import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { AppConfig } from '../../config/configuration';

/**
 * Close one connection without being able to hang.
 *
 * `quit()` is the polite form: it queues QUIT behind whatever is already in
 * flight. If that in-flight command is a blocking read — or the server has gone
 * away — the promise can simply never settle, and then `onModuleDestroy` never
 * returns, `app.close()` never resolves, and the process has to be killed.
 * Bounding the wait and then pulling the socket down turns "shutting down" back
 * into something that finishes.
 *
 * A free function, and racing rather than relying on `disconnect()` to reject the
 * pending `quit()`, because the guarantee ("this always settles") is the whole
 * point and is worth being able to assert without a Redis server present.
 */
export async function closeQuietly(
  conn: Pick<Redis, 'quit' | 'disconnect'>,
  timeoutMs: number,
  onForce?: () => void,
): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
    // An unreferenced timer cannot itself be the handle that keeps Node alive.
    timer.unref();
  });
  // An async IIFE so a synchronous throw from `quit()` becomes a rejection too.
  const quit = (async (): Promise<'quit' | 'failed'> => {
    try {
      await conn.quit();
      return 'quit';
    } catch {
      return 'failed';
    }
  })();

  try {
    const outcome = await Promise.race([quit, expired]);
    if (outcome === 'quit') return;
    if (outcome === 'timeout') onForce?.();
    conn.disconnect();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Central Redis access. Exposes the primary client plus a factory for the
 * duplicated connections that Socket.IO's pub/sub adapter needs (it requires a
 * dedicated connection in subscriber mode).
 *
 * BullMQ deliberately does *not* use `duplicate()`: it is given plain connection
 * options so it creates and owns its own sockets, and `Queue.close()` /
 * `Worker.close()` dispose of them. A worker parks its connection in a blocking
 * read, and a blocked connection is exactly the thing `quit()` cannot get past —
 * so the library that knows how to interrupt it is the one that should close it.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;
  private readonly extras: Redis[] = [];

  /** How long a single `quit()` may take before the socket is torn down. */
  private static readonly QUIT_TIMEOUT_MS = 2_000;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const { host, port, password } = this.config.get('redis', { infer: true });
    this.client = new Redis({ host, port, password, maxRetriesPerRequest: null, lazyConnect: false });
    this.client.on('error', (e) => this.logger.error(`Redis error: ${e.message}`));
  }

  onModuleInit(): void {
    this.logger.log('Redis client ready');
  }

  /** A fresh connection with identical options (for pub/sub). */
  duplicate(): Redis {
    const conn = this.client.duplicate();
    this.extras.push(conn);
    return conn;
  }

  connectionOptions(): { host: string; port: number; password?: string } {
    return this.config.get('redis', { infer: true });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled(
      [this.client, ...this.extras].map((conn) =>
        closeQuietly(conn, RedisService.QUIT_TIMEOUT_MS, () =>
          this.logger.warn(
            `Redis did not answer QUIT in ${RedisService.QUIT_TIMEOUT_MS}ms — disconnecting`,
          ),
        ),
      ),
    );
  }
}

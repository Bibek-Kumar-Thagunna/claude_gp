import { Global, Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';

/**
 * Global, because idempotency is a property of any endpoint that creates
 * something — checkout today, refunds and payouts tomorrow — and threading the
 * provider through every feature module would make it easier to leave out than
 * to include.
 */
@Global()
@Module({
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}

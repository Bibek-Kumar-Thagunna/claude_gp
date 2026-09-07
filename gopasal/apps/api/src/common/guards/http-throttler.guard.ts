import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * The stock ThrottlerGuard reaches for the HTTP request/response, which doesn't
 * exist for WebSocket message handlers. We only rate-limit HTTP here (the
 * gateway does its own per-socket ping floor), so skip any non-HTTP context.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    return super.canActivate(context);
  }
}

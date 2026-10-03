import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Defense-in-depth: recursively strips secret-bearing keys from every outgoing
 * response, so we never leak a hash even if a service forgets to omit it.
 * Also gives BigInt (from PostGIS/`$queryRaw` counts) a safe JSON form.
 */
const REDACT_KEYS = new Set([
  'password',
  'passwordHash',
  'refreshTokenHash',
  'accessTokenHash',
  'codeHash',
  'otpHash',
  'secret',
]);

@Injectable()
export class SanitizeInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => sanitize(data)));
  }
}

/**
 * Exported because the error path needs the same treatment and must not grow a
 * second copy of `REDACT_KEYS`. Interceptors only run on the success path, so
 * `AllExceptionsFilter` calls this directly for the fields it passes through
 * from an exception body.
 */
export function sanitize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'bigint') return Number(value);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  // By this point `value` is narrowed to a non-null object, so it is already a
  // valid WeakSet key — no assertion needed.
  if (seen.has(value)) return undefined;
  seen.add(value);

  if (Array.isArray(value)) {
    const result = value.map((v) => sanitize(v, seen));
    // `seen` is the active recursion path, not a global visited set. The same
    // record may legitimately appear twice in one response (for example as
    // both `current` and the first item in `history`) and must survive both.
    seen.delete(value);
    return result;
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACT_KEYS.has(k)) continue;
    out[k] = sanitize(v, seen);
  }
  seen.delete(value);
  return out;
}

import { Injectable, ValidationPipe, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';

/**
 * The global request pipe: `ValidationPipe`, but with implicit type coercion applied
 * only where the transport actually loses types.
 *
 * The API used to install one `ValidationPipe` with
 * `transformOptions: { enableImplicitConversion: true }` for every argument. That
 * option is *necessary* for query strings — `?page=2` arrives as `"2"`, and without
 * coercion `@IsInt()` rejects every paged request. Applied to a JSON body, where the
 * types already arrived intact, it is not a convenience but a hole. Measured against
 * `UpdateProductDto` with the old single pipe:
 *
 *   - `{ "name": { "a": 1 } }`      → **accepted** as the string `"[object Object]"`,
 *                                     and written to `Product.name`.
 *   - `{ "name": { "toString": 1 } }` → **500**. `String(value)` throws
 *                                     `TypeError: Cannot convert object to primitive
 *                                     value` *inside* the pipe, so it escapes as an
 *                                     unhandled error rather than a 400.
 *   - `{ "price": true }`           → **accepted** as `1`. A product priced at one
 *                                     rupee because a boolean was coerced.
 *
 * With coercion off for bodies, all three are `400`s from the validators that were
 * meant to catch them, and nothing reaches Prisma. Queries and route params keep
 * coercion, so `?page=2&limit=50&status=ACCEPTED,PACKED` behaves exactly as before.
 *
 * This is a composition of two real `ValidationPipe`s rather than a subclass that
 * mutates `transformOptions` per call: `ValidationPipe` reads that field from `this`,
 * so a subclass toggling it would be sharing mutable state across concurrent
 * requests. Two instances cannot interleave.
 *
 * Body DTOs that genuinely need a string coerced — the one real case is a
 * `multipart/form-data` field, and `@Type(() => Number)` is the per-field way to ask
 * for it — are unaffected, because an explicit `@Type` is honoured either way.
 * `AdjustStockDto.delta` already carries one.
 */
@Injectable()
export class RequestValidationPipe implements PipeTransform {
  /** Bodies: JSON types are trusted as sent, and mismatches are rejected. */
  private readonly forBody = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  /** Query strings and route params: everything is a string, so coercion is required. */
  private readonly forStringSources = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });

  transform(value: unknown, metadata: ArgumentMetadata): Promise<unknown> {
    const pipe = metadata.type === 'body' ? this.forBody : this.forStringSources;
    return pipe.transform(value, metadata);
  }
}

import { ValidateIf } from 'class-validator';

/**
 * "Absent is fine; `null` is not."
 *
 * `@IsOptional()` looks like it means "this field may be omitted". It does not:
 * class-validator treats it as *`IsEmpty` short-circuits everything*, so a value
 * of `null` skips **every** validator on the property. On a PATCH body that is a
 * hole rather than a convenience. Measured against `UpdateShopDto` with the
 * pipe `main.ts` installs:
 *
 *   - `{ "name": null }`             → **accepted**, and `prisma.shop.update`
 *                                      receives `data: { name: null }` for a
 *                                      non-nullable column. Prisma throws
 *                                      `PrismaClientValidationError`, which is not
 *                                      a `PrismaClientKnownRequestError`, so the
 *                                      caller got a 500 for a bad request.
 *   - `{ "isOpen": null }`           → same, on a `Boolean @default(true)`.
 *   - `{ "deliveryRadiusKm": null }` → same, on a `Float @default(3)`.
 *
 * `@ValidateIf` skips validation only when the property is genuinely absent, so
 * `undefined` still means "leave this column alone" while `null` falls through to
 * `@IsString()` / `@IsBoolean()` / `@IsNumber()` and is answered with the 400 it
 * always deserved.
 *
 * Two things this does *not* do, so nobody has to re-derive them:
 *
 *  - It does not make a field required. A body with no such key validates.
 *  - It does not let `null` clear a nullable column *on the DTOs that use it*. On
 *    `UpdateShopDto`, a text column is cleared by sending `""`, and a column where
 *    that is impossible (`categoryId`, `lat`, `lng`) can be changed and not
 *    emptied. Adding null-clearing there would be a new capability, not a fix.
 *
 *    Elsewhere in the API `null` *is* a real "unset this": `UpdateProductDto`
 *    keeps `@IsOptional()` on purpose so that `{ "description": null }`,
 *    `{ "nameNp": null }`, `{ "categoryId": null }`, `{ "mrp": null }` and
 *    `{ "sku": null }` clear those nullable columns, while `productData` /
 *    `variantData` in `products.service.ts` route every *non-nullable* column
 *    through `keep(v) = v ?? undefined` so a stray `null` means "leave it alone"
 *    instead of reaching Prisma. So the choice between this decorator and
 *    `@IsOptional()` is per-DTO and deliberate — do not sweep one into the other.
 *
 * Other DTOs still use `@IsOptional()` without that projection, and therefore still
 * accept `null` on fields whose columns are non-nullable. That is a real, separate
 * defect; it is not fixed here because each one needs its own regression test
 * against its own route, and a blanket find-and-replace would be a change nobody
 * had verified. Since `AllExceptionsFilter` gained a
 * `Prisma.PrismaClientValidationError` branch it is answered with a 400 and logged
 * rather than returned as a 500 carrying Prisma's own query report — which caps the
 * damage but does not make the DTO correct.
 */
export function OptionalField(): PropertyDecorator {
  return ValidateIf((_object: unknown, value: unknown) => value !== undefined);
}

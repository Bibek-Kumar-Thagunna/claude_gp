import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { OptionalField } from '../../../common/dto/optional-field.decorator';

/**
 * The profile PATCH body.
 *
 * **`avatarUrl` is not here, and that is the same refusal `logoImage`,
 * `coverImage` and `Product.images` get.** It used to be
 * `@IsOptional() @IsString() avatarUrl?: string` — an unbounded string the
 * caller chose, written by `UsersService.update` into `User.avatarUrl` and handed
 * back by both `GET users/me` and `GET auth/me` as this person's picture. A
 * client naming where an image lives is a client-supplied storage path whatever
 * the column is called: the value could point at an external host, or be
 * `javascript:` or `data:`, and every surface that renders a profile would use
 * it. No caller in this repository ever sent the field, so removing it takes
 * nothing away — `forbidNonWhitelisted` answers 400 now, which is the right
 * answer to a request that wants to choose an image URL.
 *
 * An avatar, if it is wanted, needs the shape the product photos got: a
 * `multipart/form-data` route that sniffs the bytes and mints a `public/` key
 * server-side. See `modules/uploads` and `catalog/product-images.ts`.
 *
 * `locale` uses `@OptionalField()` because `User.locale` is
 * `String @default("en")` — non-nullable. `@IsOptional()` skips every validator
 * when the value is `null`, so `{"locale": null}` passed `@IsIn` and reached
 * `prisma.user.update` for a column that cannot hold it. `name` and `email` are
 * `String?`, where `null` is a real "clear this", so they keep `@IsOptional()`.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: ['en', 'np'] })
  @OptionalField()
  @IsIn(['en', 'np'])
  locale?: string;
}
/**
 * Bounds for the two address bodies, exported so a test — and any client — can
 * state the same numbers instead of keeping a second copy of them.
 *
 * `Address` is all `text` and `Float?` in Postgres, so before this every string
 * here was unbounded: `label`, `area` and `landmark` had no `@MaxLength` at all,
 * and `phone` had neither a length nor a shape. That last one is why this block
 * exists. `Address.phone` is what a shop and a rider call, and the seller console
 * renders it as a `tel:` and an `sms:` href on the order detail screen, so this
 * column decides what ends up inside a URL scheme in somebody else's browser.
 *
 * An unanchored pattern would not do that job — `auth.dto.ts` uses
 * `/[0-9+\s-]{7,15}/` without anchors, which matches a digit run *inside* any
 * longer string — so the two patterns below are anchored and cover the whole
 * value: the allowed characters, then "at least seven of them are digits", so
 * seven spaces is not a phone number.
 *
 * Nepal mobiles are `98XXXXXXXX`, but a landline (`01-4XXXXXX`) is a legitimate
 * number for a rider to call, so this is deliberately not
 * `normalizeNepalPhone`'s `^9\d{9}$`.
 */
export const ADDRESS_LABEL_MAX_LENGTH = 40;
export const ADDRESS_NAME_MAX_LENGTH = 80;
export const ADDRESS_PHONE_MAX_LENGTH = 20;
export const ADDRESS_AREA_MAX_LENGTH = 160;
export const ADDRESS_LANDMARK_MAX_LENGTH = 160;
export const ADDRESS_FULL_ADDRESS_MAX_LENGTH = 240;

/**
 * Digits, a literal space, `+` and `-`, and nothing else — anchored to the whole
 * value. The space is written literally rather than as `\s` on purpose: `\s` also
 * matches `\n`, `\r` and `\t`, and this value is interpolated into a `tel:` and an
 * `sms:` href, where a line break is not something a phone number needs.
 */
export const ADDRESS_PHONE_CHARS = /^[0-9+ -]+$/;
/** Seven digits or more, so `" - - - "` is not accepted as a phone number. */
export const ADDRESS_PHONE_DIGITS = /^(?:\D*\d){7,}\D*$/;
/**
 * A delivery address, as the customer surface creates it.
 *
 * Every field whose column is non-nullable uses `@OptionalField()` rather than
 * `@IsOptional()`, because `@IsOptional()` skips *all* validation on `null` and
 * `AddressesService.create` spreads the body straight into
 * `prisma.address.create`. `landmark`, `lat` and `lng` are the three nullable
 * columns (`String?`, `Float?`, `Float?`), so there `null` is a real "no value"
 * and `@IsOptional()` is the correct choice — see
 * `common/dto/optional-field.decorator.ts`, which is explicit that this is a
 * per-field decision rather than a sweep.
 *
 * `isDefault` had no `@IsBoolean()` at all. `create` reads
 * `input.isDefault || count === 0` and `update` reads `if (input.isDefault)`, so
 * a truthy `"yes"` cleared the default flag on every *other* address that user
 * has before the write itself failed inside Prisma. Both are wrapped in
 * `$transaction`, so the clearing rolled back — but the caller was answered with
 * a database error rather than a 400 naming the field.
 */
export class AddressDto {
  @ApiPropertyOptional({ default: 'Home' })
  @OptionalField()
  @IsString()
  @MaxLength(ADDRESS_LABEL_MAX_LENGTH)
  label?: string;

  @IsString()
  @MaxLength(ADDRESS_NAME_MAX_LENGTH)
  recipientName!: string;

  @IsString()
  @MaxLength(ADDRESS_PHONE_MAX_LENGTH)
  @Matches(ADDRESS_PHONE_CHARS, { message: 'phone may contain only digits, spaces, + and -' })
  @Matches(ADDRESS_PHONE_DIGITS, { message: 'phone must contain at least 7 digits' })
  phone!: string;

  @IsString()
  @MaxLength(ADDRESS_AREA_MAX_LENGTH)
  area!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(ADDRESS_LANDMARK_MAX_LENGTH)
  landmark?: string;

  @IsString()
  @MaxLength(ADDRESS_FULL_ADDRESS_MAX_LENGTH)
  fullAddress!: string;

  // `@IsNumber()` before `@IsLatitude()`: on its own `isLatitude` accepts the
  // *string* "27.7", body coercion is off by design, and `Address.lat` is a
  // `Float?` — so the string would reach Prisma and fail there instead of here.
  // The same pairing `UpdateShopDto` uses, for the same reason.
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional()
  @OptionalField()
  @IsBoolean()
  isDefault?: boolean;
}
/**
 * The address PATCH body.
 *
 * `extends AddressDto` with `declare` re-decoration, the same shape
 * `UpdateProductDto` and `UpdateVariantDto` use. This was a hand-written copy
 * before, and the copy had drifted into being the *looser* of the two: no
 * `@MaxLength` on any field, so `recipientName` and `fullAddress` were bounded on
 * create and unbounded on update, and `phone` was `@IsString()` in both places.
 * Inheriting means one set of bounds, and a field added to `AddressDto` cannot be
 * silently unvalidated here.
 *
 * `@OptionalField()` on the four required fields makes each one omittable without
 * admitting `null` — all four columns are non-nullable, and
 * `AddressesService.update` passes the body to `prisma.address.update` as `data`.
 * `label` and `isDefault` are `@OptionalField()` on the base already; `landmark`,
 * `lat` and `lng` are `@IsOptional()` there, which is what their nullable columns
 * want.
 */
export class UpdateAddressDto extends AddressDto {
  @OptionalField() declare recipientName: string;
  @OptionalField() declare phone: string;
  @OptionalField() declare area: string;
  @OptionalField() declare fullAddress: string;
}

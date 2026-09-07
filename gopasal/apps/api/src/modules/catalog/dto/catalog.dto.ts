import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { OptionalField } from '../../../common/dto/optional-field.decorator';
import { PRODUCT_IMAGE_LIMIT } from '../product-images';

// There is no CreateShopDto: shops are not created from the seller surface.
// The applicant-facing shape lives in modules/onboarding/dto/onboarding.dto.ts
// and a Shop row appears only when a reviewer approves that application.

/**
 * Bounds for the shop settings body, exported so the seller console can state the
 * same numbers to a shopkeeper instead of hard-coding a second copy of them.
 *
 * They are the applicant-facing bounds, deliberately: `ApplicationFieldsDto`
 * created these very columns, so a seller must not be able to widen a value past
 * what onboarding would have accepted for it. Before this, `UpdateShopDto` was the
 * looser of the two — no length limit on any string, no `MinLength` on `name`
 * (so `{"name":""}` was accepted for a live storefront) and no ceiling on the
 * delivery radius.
 */
export const SHOP_NAME_MIN_LENGTH = 2;
export const SHOP_RADIUS_MIN_KM = 0.5;
export const SHOP_RADIUS_MAX_KM = 20;
/**
 * `Shop.minOrder` is a Postgres `integer`. Its ceiling is the column's, not a
 * business rule: without it a larger number reaches the database and comes back
 * as an unmapped driver error rather than a 400 naming the field.
 */
export const SHOP_MIN_ORDER_MAX = 2_147_483_647;

/**
 * The shop settings PATCH body.
 *
 * **`logoImage` and `coverImage` are not here, and their absence is a feature gap
 * rather than a hole.** `Shop` carries both columns as `String?`, but no request
 * body has ever accepted them and no code has ever written them, so there was
 * nothing to close: unlike `Product.images`, a client could not name a storage
 * path here even before this audit. They are left out on purpose rather than
 * added as plain strings — a URL a seller types in is exactly the
 * client-supplied storage path this platform refuses, and the two columns would
 * be rendered on the storefront as this shop's branding.
 *
 * Filling them properly means the same shape the product photos got: a
 * `multipart/form-data` route that sniffs the bytes, mints a `public/` key
 * server-side, and stores the key rather than a URL. That is a new seller
 * screen (shop branding), which is out of the hardening scope, so it is recorded
 * here and in the seller console's `lib/api/shops.ts` instead of half-built.
 *
 * **`codEnabled` and `onlinePaymentEnabled` are not here either**, and that is the
 * same kind of absence: both columns exist on `Shop`, and no request body in any
 * scope accepts them. Which payment methods a shop may offer is a platform
 * decision — it travels with approval, and turning card payments on for a shop
 * that has no settlement path behind it would be worse than not offering the
 * switch. The seller console shows both as read-only for exactly this reason.
 *
 * **Every field here rejects `null`.** `@OptionalField()` rather than
 * `@IsOptional()`: the latter skips all validation when the value is `null`, which
 * let `{"name": null}` through to `prisma.shop.update` and turned a bad request
 * into a 500. See `common/dto/optional-field.decorator.ts`. So "leave this alone"
 * is *omit the key*; a nullable text column is cleared with `""`; and
 * `categoryId`, `lat` and `lng` can be changed but not emptied, because no value
 * this body accepts means "unset".
 */
export class UpdateShopDto {
  @ApiPropertyOptional({ example: 'Namaste Kirana Pasal' })
  @OptionalField()
  @IsString()
  @MinLength(SHOP_NAME_MIN_LENGTH)
  @MaxLength(120)
  name?: string;

  @OptionalField() @IsString() @MaxLength(120) nameNp?: string;
  @OptionalField() @IsString() @MaxLength(1000) description?: string;
  @OptionalField() @IsString() @MaxLength(60) categoryId?: string;
  @OptionalField() @IsString() @MaxLength(20) phone?: string;
  @OptionalField() @IsString() @MaxLength(160) area?: string;
  @OptionalField() @IsString() @MaxLength(300) fullAddress?: string;

  // `@IsNumber()` before `@IsLatitude()`: on its own, `isLatitude` accepts the
  // *string* "27.7" ("must be a latitude string or number"), and body coercion is
  // off by design, so the string would reach `prisma.shop.update` for a `Float?`
  // column and fail there as a 500. The applicant-facing DTO avoids this with
  // `@Type(() => Number)`; a PATCH body has no reason to coerce, so it rejects.
  @OptionalField() @IsNumber() @IsLatitude() lat?: number;
  @OptionalField() @IsNumber() @IsLongitude() lng?: number;

  @ApiPropertyOptional({ minimum: SHOP_RADIUS_MIN_KM, maximum: SHOP_RADIUS_MAX_KM })
  @OptionalField()
  @IsNumber()
  @Min(SHOP_RADIUS_MIN_KM)
  @Max(SHOP_RADIUS_MAX_KM)
  deliveryRadiusKm?: number;

  @OptionalField() @IsString() @MaxLength(16) emoji?: string;

  @ApiPropertyOptional({ example: '7am – 9pm', description: 'Free text, not a schedule' })
  @OptionalField()
  @IsString()
  @MaxLength(120)
  hours?: string;

  @OptionalField() @IsBoolean() isOpen?: boolean;

  @ApiPropertyOptional({ description: 'Minimum basket in paisa-free rupees', minimum: 0 })
  @OptionalField()
  @IsInt()
  @Min(0)
  @Max(SHOP_MIN_ORDER_MAX)
  minOrder?: number;

  @OptionalField() @IsBoolean() soloMode?: boolean;
}

/**
 * Bounds for the product bodies.
 *
 * Every string below was unbounded, against `text` columns, on the two routes a
 * seller uses most. The numbers are `UpdateShopDto`'s for the columns the two
 * bodies share — a product name is bounded exactly like a shop name — so the
 * platform has one answer to "how long may this be" rather than one per table.
 *
 * `PRODUCT_TAG_LIMIT` matters more than it looks. `Product.tags` is a
 * `String[] @default([])` and the seller console builds it by splitting one comma
 * separated input, so a body could carry a hundred thousand tags into a single row
 * and every catalogue read afterwards would carry them back out. It is the same
 * bound, for the same reason, that `ReorderProductImagesDto` puts on its list.
 */
export const PRODUCT_NAME_MAX_LENGTH = 120;
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 1000;
export const PRODUCT_UNIT_MAX_LENGTH = 40;
export const PRODUCT_CATEGORY_ID_MAX_LENGTH = 60;
export const PRODUCT_TAG_LIMIT = 20;
export const PRODUCT_TAG_MAX_LENGTH = 30;

/**
 * The product create body.
 *
 * **There is no `images` field, deliberately.** It used to be here as
 * `@IsOptional() @IsArray() @IsString({ each: true }) images?: string[]`, which
 * let a client write an unbounded list of arbitrary strings into
 * `Product.images` — a column the storefront and the cart render as image
 * sources. That is a client-supplied storage path in the plainest sense: the
 * value could name an external host, a `javascript:` or `data:` URL, or nothing
 * at all, and the platform would serve it to shoppers as this shop's photo of
 * this product.
 *
 * Photos now arrive as bytes, on `POST …/products/:productId/images`, and the
 * key is built server-side. The column holds keys the API minted; see
 * `catalog/product-images.ts`. `forbidNonWhitelisted` answers 400 to a body that
 * still sends `images`, which is the correct answer to a caller trying to name a
 * storage location.
 *
 * The optional fields keep `@IsOptional()` rather than `@OptionalField()`, and that
 * is deliberate: `ProductsService.create` reads `input.unit ?? '1 pc'`,
 * `input.tags ?? []`, `input.trackStock ?? false`, `input.stock ?? 0`, and
 * `productData` puts every non-nullable column through `keep(v) = v ?? undefined`,
 * so a `null` here is already coalesced away before Prisma sees it. `nameNp`,
 * `description` and `categoryId` are genuinely nullable columns. Nothing is gained
 * by tightening these, and `optional-field.decorator.ts` is explicit that the
 * choice is per-DTO rather than a sweep.
 */
export class CreateProductDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(PRODUCT_NAME_MAX_LENGTH) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(PRODUCT_NAME_MAX_LENGTH) nameNp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_DESCRIPTION_MAX_LENGTH)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(PRODUCT_CATEGORY_ID_MAX_LENGTH)
  categoryId?: string;

  @ApiProperty() @IsInt() @Min(0) price!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) mrp?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(PRODUCT_UNIT_MAX_LENGTH) unit?: string;

  @ApiPropertyOptional({ type: [String], maxItems: PRODUCT_TAG_LIMIT })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PRODUCT_TAG_LIMIT)
  @IsString({ each: true })
  @MaxLength(PRODUCT_TAG_MAX_LENGTH, { each: true })
  tags?: string[];

  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackStock?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) stock?: number;
}

/**
 * The product PATCH body.
 *
 * `@IsOptional()` on the two required fields, the established `declare`
 * re-decoration. The bounds above depend on this class not being the looser of the
 * two routes — the asymmetry `UpdateShopDto` and `UpdateAddressDto` were fixed for.
 *
 * **A re-declared property must restate every validator it wants, including the
 * ones the parent already spells out.** This is not style; it is how
 * class-validator resolves inheritance. `MetadataStorage.getTargetValidationMetadatas`
 * drops an inherited entry whenever the child has one with the same
 * `(propertyName, type)`:
 *
 * ```js
 * const uniqueInheritedMetadatas = inheritedMetadatas.filter(inheritedMetadata => {
 *   return !originalMetadatas.find(originalMetadata => {
 *     return (originalMetadata.propertyName === inheritedMetadata.propertyName &&
 *       originalMetadata.type === inheritedMetadata.type);
 *   });
 * });
 * ```
 *
 * and `type` is *not* the validator's name. `register-decorator.js` sets
 * `type: ValidationTypes.isValid(options.name) ? options.name : CUSTOM_VALIDATION`,
 * and `ValidationTypes` holds only six system values (`customValidation`,
 * `nestedValidation`, `promiseValidation`, `conditionalValidation`,
 * `whitelistValidation`, `isDefined`). `minLength`, `maxLength`, `isString`, `isInt`
 * and `min` are none of them, so **every** built-in validator registers as
 * `customValidation` — one shared `type` per property. Declaring `@IsString()` here
 * therefore discarded the parent's `@MinLength(1)` too, and `{"name": ""}` was
 * accepted on PATCH while being rejected on create. Hence `@MinLength(1)` below.
 *
 * `@IsOptional()` and `@OptionalField()` are the exception, and that is why they can
 * be used alone: the former registers `conditionalValidation` and the latter is a
 * `ValidateIf`, so neither collides with the built-ins. `UpdateAddressDto`'s four
 * `declare` lines carry nothing else and keep the whole inherited set.
 */
export class UpdateProductDto extends CreateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(PRODUCT_NAME_MAX_LENGTH)
  declare name: string;

  @IsOptional() @IsInt() @Min(0) declare price: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/**
 * The new photo order: every key the product already has, exactly once.
 *
 * Keys, not URLs — the client is echoing back the `images` array it was given by
 * a read, and `assertPermutation` proves the body is a rearrangement of what is
 * stored rather than an assignment of whatever the caller fancied.
 */
export class ReorderProductImagesDto {
  @ApiProperty({ type: [String], description: 'Existing storage keys in the desired order' })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(PRODUCT_IMAGE_LIMIT)
  keys!: string[];
}

/**
 * A variant's name is a size or a pack (`"1 kg"`, `"Large"`), and its SKU is a code
 * a shop keeps for itself. Both were unbounded `text`. The name shares the product
 * bound; the SKU gets the shorter one that any code a human types fits inside.
 */
export const VARIANT_SKU_MAX_LENGTH = 60;

export class VariantDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(PRODUCT_NAME_MAX_LENGTH) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(VARIANT_SKU_MAX_LENGTH) sku?: string;
  @ApiProperty() @IsInt() @Min(0) price!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) mrp?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) stock?: number;
}

/**
 * The variant PATCH body.
 *
 * This exists as a class, and it has to. The route used to be typed
 * `@Body() dto: Partial<VariantDto>` — but `Partial<T>` is a mapped *type*, and
 * TypeScript emits `Object` as its design-time metadata, so Nest's `ValidationPipe`
 * saw no class to validate against and skipped the body entirely. Whitelisting,
 * `forbidNonWhitelisted` and every `@IsInt` came off, and the raw object went into
 * `prisma.productVariant.update({ data })`. A class restores all three.
 *
 * `declare` re-decorates the two fields `VariantDto` requires without redeclaring
 * them, which is how `UpdateProductDto` does it too — including its `@MinLength(1)`,
 * which is load-bearing for the same reason documented there: a re-declared property
 * keeps none of the parent's built-in validators. `stock` here is absolute, not a
 * delta — the delta route is `POST products/:id/stock`, and it is product-level.
 */
export class UpdateVariantDto extends VariantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(PRODUCT_NAME_MAX_LENGTH)
  declare name: string;

  @IsOptional() @IsInt() @Min(0) declare price: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AdjustStockDto {
  @ApiProperty({ description: 'Positive to add, negative to remove' })
  @Type(() => Number)
  @IsInt()
  delta!: number;
}

/** The sentinel `categoryId` for "the shop never assigned one". */
export const NO_CATEGORY = 'none';

export const PRODUCT_SORTS = ['recent', 'name', 'price_asc', 'price_desc', 'stock_asc'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const PRODUCT_STATUS_FILTERS = ['active', 'hidden'] as const;
export type ProductStatusFilter = (typeof PRODUCT_STATUS_FILTERS)[number];

export const PRODUCT_STOCK_FILTERS = ['in', 'out', 'untracked'] as const;
export type ProductStockFilter = (typeof PRODUCT_STOCK_FILTERS)[number];

/**
 * The seller product list query.
 *
 * `q` used to be accepted by `PaginationDto` and then dropped on the floor by
 * `listForShop`, which meant a seller with more products than one page could search,
 * see nothing, and reasonably conclude the product was gone. Every filter below is
 * applied in SQL now, so a result set is a claim about the shop rather than about the
 * page the browser happens to hold.
 *
 * `categoryId` takes a real id or the literal `'none'` — a shop's uncategorised
 * products are a real thing to want to look at, and there is no id that means it.
 *
 * There is no `low` in `stock`: `Product` carries `stock` and `trackStock` and no
 * threshold, so "low" would be a number the platform invented and attributed to the
 * shop. `untracked` is not "out of stock" either — it is the shop declining to say.
 */
export class ListShopProductsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: `A category id, or '${NO_CATEGORY}' for uncategorised` })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({ enum: PRODUCT_STATUS_FILTERS })
  @IsOptional()
  @IsIn(PRODUCT_STATUS_FILTERS)
  status?: ProductStatusFilter;

  @ApiPropertyOptional({ enum: PRODUCT_STOCK_FILTERS })
  @IsOptional()
  @IsIn(PRODUCT_STOCK_FILTERS)
  stock?: ProductStockFilter;

  @ApiPropertyOptional({ enum: PRODUCT_SORTS, default: 'recent' })
  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort?: ProductSort;
}

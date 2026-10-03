import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, type ArgumentMetadata } from '@nestjs/common';
import { OrderStatus, PaymentMethod } from '@prisma/client';
import { RequestValidationPipe } from '../pipes/request-validation.pipe';
import {
  AdjustStockDto,
  CreateProductDto,
  PRODUCT_CATEGORY_ID_MAX_LENGTH,
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  PRODUCT_TAG_LIMIT,
  PRODUCT_TAG_MAX_LENGTH,
  PRODUCT_UNIT_MAX_LENGTH,
  ImportProductsQueryDto,
  ReorderProductImagesDto,
  SHOP_MIN_ORDER_MAX,
  UpdateProductDto,
  UpdateShopDto,
  UpdateVariantDto,
  VARIANT_SKU_MAX_LENGTH,
  VariantDto,
} from '../../modules/catalog/dto/catalog.dto';
import { PRODUCT_IMAGE_LIMIT } from '../../modules/catalog/product-images';
import {
  DeliveryStatusDto,
  FAIL_REASON_MAX_LENGTH,
  POD_NOTE_MAX_LENGTH,
} from '../../modules/delivery/dto/delivery.dto';
import {
  CancelOrderDto,
  CheckoutDto,
  ListShopOrdersQueryDto,
  RejectOrderDto,
} from '../../modules/orders/dto/orders.dto';
import { ListShopCouponsQueryDto } from '../../modules/coupons/dto/coupons.dto';
import { ListShopReviewsQueryDto } from '../../modules/reviews/dto/reviews.dto';
import {
  ADDRESS_AREA_MAX_LENGTH,
  ADDRESS_FULL_ADDRESS_MAX_LENGTH,
  ADDRESS_LABEL_MAX_LENGTH,
  ADDRESS_LANDMARK_MAX_LENGTH,
  ADDRESS_NAME_MAX_LENGTH,
  ADDRESS_PHONE_MAX_LENGTH,
  AddressDto,
  UpdateAddressDto,
  UpdateProfileDto,
} from '../../modules/users/dto/users.dto';
import { CreateRoleDto, UpdateRoleDto } from '../../rbac/dto/rbac.dto';
import { PaginationDto, SEARCH_MAX_LENGTH } from './pagination.dto';
import { ApplicationFieldsDto } from '../../modules/onboarding/dto/onboarding.dto';
import {
  CreateLocationCaptureDto,
  SubmitCapturedLocationDto,
} from '../../modules/location-capture/dto/location-capture.dto';

/**
 * The wall every request has to clear, exercised with the pipe `main.ts` actually
 * installs.
 *
 * This file exists because of two specific defects, not hypothetical ones.
 *
 * The first: the variant PATCH route was typed `@Body() dto: Partial<VariantDto>`.
 * `Partial<T>` is a mapped *type* — TypeScript emits `Object` for it in
 * `design:paramtypes`, Nest sees no class, and `ValidationPipe` returns the body
 * untouched. Whitelisting, `forbidNonWhitelisted` and every `@IsInt` were silently
 * off, and whatever the client sent went into `prisma.productVariant.update({ data })`.
 * The regression is therefore not "does `@IsInt` work" — it is "is the pipe looking at
 * a class at all", which a unit test on the DTO cannot see. `pipeSkipsPlainObject`
 * below pins the failure mode itself, so a `Partial<…>` reappearing on a route is a
 * red test rather than a silent hole.
 *
 * The second: `enableImplicitConversion` was on for bodies as well as query strings,
 * so an object coerced to `"[object Object]"` and passed `@IsString()`. See
 * `RequestValidationPipe` and the `implicit conversion` block below.
 *
 * No database, no HTTP server: a rejection here means the request never reached
 * Prisma, which is the whole claim being made.
 */

const pipe = new RequestValidationPipe();

function meta(
  metatype: ArgumentMetadata['metatype'],
  type: ArgumentMetadata['type'] = 'body',
): ArgumentMetadata {
  return { type, metatype, data: undefined };
}

/** Run the pipe and return the messages the client would receive. */
async function reject(
  body: unknown,
  metatype: ArgumentMetadata['metatype'],
  type: ArgumentMetadata['type'] = 'body',
): Promise<string[]> {
  try {
    await pipe.transform(body, meta(metatype, type));
  } catch (err) {
    assert.ok(err instanceof BadRequestException, `expected a 400, got ${String(err)}`);
    const res = err.getResponse() as { message?: unknown };
    return Array.isArray(res.message) ? (res.message as string[]) : [String(res.message)];
  }
  return assert.fail('the pipe should have rejected this body');
}

async function accept<T>(
  body: unknown,
  metatype: ArgumentMetadata['metatype'],
  type: ArgumentMetadata['type'] = 'body',
): Promise<T> {
  return (await pipe.transform(body, meta(metatype, type))) as T;
}

/** `expected` must appear in one of the messages, or the assertion says which did. */
function names(messages: string[], expected: string): void {
  assert.ok(
    messages.some((m) => m.includes(expected)),
    `expected a message naming "${expected}", got ${JSON.stringify(messages)}`,
  );
}

describe('variant PATCH · the body that used to bypass validation', () => {
  it("rejects the brief's worked example: {stock:10, dangerousField:'hack'}", async () => {
    names(await reject({ stock: 10, dangerousField: 'hack' }, UpdateVariantDto), 'dangerousField');
  });

  it('names every unknown key, not just the first', async () => {
    const messages = await reject(
      { isActive: false, shopId: 'shop_other', productId: 'p_1' },
      UpdateVariantDto,
    );
    names(messages, 'shopId');
    names(messages, 'productId');
  });

  it('refuses a negative stock', async () => {
    names(await reject({ stock: -5 }, UpdateVariantDto), 'stock');
  });

  it('refuses a non-integer price', async () => {
    names(await reject({ price: 'free' }, UpdateVariantDto), 'price');
  });

  it('refuses a fractional stock', async () => {
    names(await reject({ stock: 2.5 }, UpdateVariantDto), 'stock');
  });

  it('lets a legitimate partial patch through with the sent values intact', async () => {
    const dto = await accept<UpdateVariantDto>({ stock: 10, isActive: false }, UpdateVariantDto);

    assert.equal(dto.stock, 10);
    assert.equal(dto.isActive, false);
  });

  /**
   * `plainToInstance` materialises every declared property, so the instance carries
   * `name`, `price`, `sku` and `mrp` as `undefined`. That is not a leak — Prisma
   * treats an explicit `undefined` as "do not touch this column", which is what
   * `variantData()` relies on. What must never appear is a key nobody declared.
   */
  it('carries no key the DTO does not declare', async () => {
    const dto = await accept<UpdateVariantDto>({ stock: 10 }, UpdateVariantDto);

    assert.deepEqual(Object.keys(dto).sort(), ['isActive', 'mrp', 'name', 'price', 'sku', 'stock']);
  });

  it('does not require the fields VariantDto marks required', async () => {
    const dto = await accept<UpdateVariantDto>({ sku: 'SKU-1' }, UpdateVariantDto);
    assert.equal(dto.sku, 'SKU-1');
  });
});

describe('the bypass itself', () => {
  /**
   * `Partial<VariantDto>` and a bare interface both emit `Object`. This is what the
   * route used to hand the pipe, and it is why nothing was checked. Kept as a test so
   * the mechanism is documented by something that runs.
   */
  it('pipeSkipsPlainObject: a metatype of Object is not validated at all', async () => {
    const hostile = { stock: -1, dangerousField: 'hack' };
    const out = await pipe.transform(hostile, meta(Object));

    assert.deepEqual(out, hostile, 'the pipe returned the hostile body untouched — as it always did');
  });
});

describe('checkout payment boundary', () => {
  const addressId = 'address_1';

  it('accepts only customer-facing payment methods', async () => {
    for (const paymentMethod of [PaymentMethod.COD, PaymentMethod.ESEWA, PaymentMethod.KHALTI]) {
      const dto = await accept<CheckoutDto>({ addressId, paymentMethod }, CheckoutDto);
      assert.equal(dto.paymentMethod, paymentMethod);
    }
  });

  it('rejects the retired development payment enum even if submitted directly', async () => {
    names(await reject({ addressId, paymentMethod: PaymentMethod.DEVELOPMENT }, CheckoutDto), 'paymentMethod');
  });
});

describe('implicit conversion · off for bodies, on for query strings', () => {
  /**
   * With `enableImplicitConversion` on for bodies, `String({a:1})` produced
   * `"[object Object]"`, `@IsString()` was satisfied, and that literal went into
   * `Product.name`. This is the assertion that keeps the split in place.
   */
  it('does not launder an object into the string "[object Object]"', async () => {
    names(await reject({ name: { a: 1 } }, UpdateProductDto), 'name');
  });

  /**
   * `String({toString: 1})` throws `TypeError: Cannot convert object to primitive
   * value` *inside* the pipe, which escaped as a 500. It is a 400 now.
   */
  it('does not turn a hostile object into a 500', async () => {
    names(await reject({ name: { toString: 1 } }, UpdateProductDto), 'name');
  });

  it('does not coerce a boolean into a price of one rupee', async () => {
    names(await reject({ price: true }, UpdateProductDto), 'price');
  });

  it('does not coerce a number into a name', async () => {
    names(await reject({ name: 42 }, UpdateProductDto), 'name');
  });

  it('still coerces query strings, or every paged request would 400', async () => {
    const dto = await accept<PaginationDto>({ page: '3', limit: '50' }, PaginationDto, 'query');

    assert.equal(dto.page, 3);
    assert.equal(dto.limit, 50);
    assert.equal(dto.skip, 100);
  });

  it('honours an explicit @Type on a body field, which is how multipart asks', async () => {
    const dto = await accept<AdjustStockDto>({ delta: '4' }, AdjustStockDto);
    assert.equal(dto.delta, 4);
  });
});

describe('product PATCH', () => {
  it('rejects an unknown column', async () => {
    names(await reject({ name: 'Sunflower oil', shopId: 'shop_other' }, UpdateProductDto), 'shopId');
  });

  it('rejects a tags array holding a non-string', async () => {
    names(await reject({ tags: ['oil', 7] }, UpdateProductDto), 'tags');
  });

  it('rejects a negative price', async () => {
    names(await reject({ price: -1 }, UpdateProductDto), 'price');
  });
});

/**
 * The bounds on the two bodies a seller uses most.
 *
 * Every string on `CreateProductDto` was `@IsString()` and nothing more, against
 * `text` columns, and `tags` was an unbounded `String[]` built in the console by
 * splitting one comma separated input. A product name is what the storefront, the
 * cart, the order line and the seller's own catalogue all render, so its length is
 * not a cosmetic question. The numbers are `UpdateShopDto`'s for the columns the two
 * share, and they are asserted against the exported constants so that raising one
 * cannot leave a test pinning the old number.
 */
describe('product create · the bounds every string used to lack', () => {
  const valid = { name: 'Sunflower oil', price: 320 };

  it('accepts a plain product', async () => {
    const dto = await accept<CreateProductDto>(valid, CreateProductDto);
    assert.equal(dto.name, 'Sunflower oil');
    assert.equal(dto.price, 320);
  });

  it('bounds every string', async () => {
    const cases: Array<[string, number]> = [
      ['name', PRODUCT_NAME_MAX_LENGTH],
      ['nameNp', PRODUCT_NAME_MAX_LENGTH],
      ['description', PRODUCT_DESCRIPTION_MAX_LENGTH],
      ['categoryId', PRODUCT_CATEGORY_ID_MAX_LENGTH],
      ['unit', PRODUCT_UNIT_MAX_LENGTH],
    ];
    for (const [field, max] of cases) {
      await accept<CreateProductDto>({ ...valid, [field]: 'x'.repeat(max) }, CreateProductDto);
      names(await reject({ ...valid, [field]: 'x'.repeat(max + 1) }, CreateProductDto), field);
    }
  });

  it('refuses an empty name — a shopper cannot tap a product with no name', async () => {
    names(await reject({ ...valid, name: '' }, CreateProductDto), 'name');
  });

  it('bounds the number of tags', async () => {
    await accept<CreateProductDto>(
      { ...valid, tags: Array.from({ length: PRODUCT_TAG_LIMIT }, (_, i) => `t${i}`) },
      CreateProductDto,
    );
    names(
      await reject(
        { ...valid, tags: Array.from({ length: PRODUCT_TAG_LIMIT + 1 }, (_, i) => `t${i}`) },
        CreateProductDto,
      ),
      'tags',
    );
  });

  it('bounds each individual tag', async () => {
    await accept<CreateProductDto>(
      { ...valid, tags: ['x'.repeat(PRODUCT_TAG_MAX_LENGTH)] },
      CreateProductDto,
    );
    names(
      await reject({ ...valid, tags: ['x'.repeat(PRODUCT_TAG_MAX_LENGTH + 1)] }, CreateProductDto),
      'tags',
    );
  });

  it('applies the same bounds on PATCH, where they used to be absent', async () => {
    names(
      await reject({ name: 'x'.repeat(PRODUCT_NAME_MAX_LENGTH + 1) }, UpdateProductDto),
      'name',
    );
    names(
      await reject(
        { description: 'x'.repeat(PRODUCT_DESCRIPTION_MAX_LENGTH + 1) },
        UpdateProductDto,
      ),
      'description',
    );
    names(await reject({ unit: 'x'.repeat(PRODUCT_UNIT_MAX_LENGTH + 1) }, UpdateProductDto), 'unit');
    names(
      await reject({ tags: ['x'.repeat(PRODUCT_TAG_MAX_LENGTH + 1)] }, UpdateProductDto),
      'tags',
    );
    names(await reject({ name: '' }, UpdateProductDto), 'name');
  });

  it('still omits what was omitted — a PATCH of one field stays a PATCH of one field', async () => {
    const dto = await accept<UpdateProductDto>({ isActive: false }, UpdateProductDto);
    assert.equal(dto.isActive, false);
    assert.equal(dto.name, undefined);
    assert.equal(dto.tags, undefined);
  });
});

describe('variant · the name and SKU that were unbounded too', () => {
  const valid = { name: '1 kg', price: 320 };

  it('bounds the name and the SKU on create', async () => {
    await accept<VariantDto>({ ...valid, sku: 'x'.repeat(VARIANT_SKU_MAX_LENGTH) }, VariantDto);
    names(
      await reject({ ...valid, sku: 'x'.repeat(VARIANT_SKU_MAX_LENGTH + 1) }, VariantDto),
      'sku',
    );
    names(
      await reject({ ...valid, name: 'x'.repeat(PRODUCT_NAME_MAX_LENGTH + 1) }, VariantDto),
      'name',
    );
    names(await reject({ ...valid, name: '' }, VariantDto), 'name');
  });

  it('bounds them on PATCH as well', async () => {
    names(await reject({ sku: 'x'.repeat(VARIANT_SKU_MAX_LENGTH + 1) }, UpdateVariantDto), 'sku');
    names(
      await reject({ name: 'x'.repeat(PRODUCT_NAME_MAX_LENGTH + 1) }, UpdateVariantDto),
      'name',
    );
    names(await reject({ name: '' }, UpdateVariantDto), 'name');
  });

  it('still accepts the partial patch the console sends', async () => {
    const dto = await accept<UpdateVariantDto>({ stock: 4 }, UpdateVariantDto);
    assert.equal(dto.stock, 4);
    assert.equal(dto.name, undefined);
  });
});

/**
 * The subclass-inheritance trap, pinned.
 *
 * class-validator resolves a subclass's rules by concatenating the parent's metadata
 * with the child's and then dropping any inherited entry whose
 * `(propertyName, type)` the child also has — and `type` is `customValidation` for
 * *every* built-in validator, because `register-decorator.js` only keeps the
 * validator's own name as the type when that name is one of the six values on
 * `ValidationTypes`. `minLength`, `maxLength` and `isString` are not among them.
 *
 * So a `declare` line that restates `@IsString() @MaxLength(…)` silently deletes the
 * parent's `@MinLength(1)`, and the PATCH route becomes the looser of the pair. That
 * is what these two assertions caught. `@IsOptional()` (`conditionalValidation`) and
 * `@OptionalField()` (a `ValidateIf`) are the only decorators that can appear alone
 * on a `declare` line without displacing anything, which is why `UpdateAddressDto`
 * inherits its bounds correctly and these two had to restate theirs.
 *
 * These live in their own block so the failure message names the mechanism rather
 * than the field: if someone tidies away a "redundant" `@MinLength(1)`, this is what
 * tells them it was not redundant.
 */
describe('subclass PATCH bodies · a re-declared property inherits no built-in validator', () => {
  it('keeps @MinLength on the two names that re-declare @IsString', async () => {
    names(await reject({ name: '' }, UpdateProductDto), 'name');
    names(await reject({ name: '' }, UpdateVariantDto), 'name');
  });

  it('keeps the parent bounds on properties the child does not re-declare', async () => {
    names(await reject({ sku: 'x'.repeat(VARIANT_SKU_MAX_LENGTH + 1) }, UpdateVariantDto), 'sku');
    names(
      await reject({ description: 'x'.repeat(PRODUCT_DESCRIPTION_MAX_LENGTH + 1) }, UpdateProductDto),
      'description',
    );
  });
});

describe('stock delta', () => {
  it('rejects a fractional delta', async () => {
    names(await reject({ delta: 1.5 }, AdjustStockDto), 'delta');
  });

  it('accepts a negative delta — removing stock is the point', async () => {
    const dto = await accept<AdjustStockDto>({ delta: -3 }, AdjustStockDto);
    assert.equal(dto.delta, -3);
  });
});

describe('reject-order reason', () => {
  it('is required — a rejection without a reason is not acceptable', async () => {
    names(await reject({}, RejectOrderDto), 'reason');
  });

  it('is length-capped', async () => {
    names(await reject({ reason: 'x'.repeat(281) }, RejectOrderDto), 'reason');
  });

  it('refuses a blank or vague one-character reason', async () => {
    names(await reject({ reason: 'x' }, RejectOrderDto), 'reason');
  });
});

describe('cancel-order reason', () => {
  it('is required for both customer and seller cancellation routes', async () => {
    names(await reject({}, CancelOrderDto), 'reason');
  });

  it('must explain the cancellation', async () => {
    names(await reject({ reason: 'x' }, CancelOrderDto), 'reason');
  });
});

describe('order queue query · the ?status= string that used to reach a Prisma where', () => {
  it('rejects a status that is not an OrderStatus', async () => {
    names(await reject({ status: 'DROP TABLE' }, ListShopOrdersQueryDto, 'query'), 'status');
  });

  it('rejects a mixed list where one member is invalid', async () => {
    names(await reject({ status: 'ACCEPTED,NONSENSE' }, ListShopOrdersQueryDto, 'query'), 'status');
  });

  it('rejects an unknown query parameter', async () => {
    names(await reject({ orderBy: 'total' }, ListShopOrdersQueryDto, 'query'), 'orderBy');
  });

  it('rejects a sort that is not one of the two we implement', async () => {
    names(await reject({ sort: 'cheapest' }, ListShopOrdersQueryDto, 'query'), 'sort');
  });

  it('caps limit so one request cannot ask for the whole table', async () => {
    names(await reject({ limit: '5000' }, ListShopOrdersQueryDto, 'query'), 'limit');
  });

  it('rejects page 0', async () => {
    names(await reject({ page: '0' }, ListShopOrdersQueryDto, 'query'), 'page');
  });

  it('caps q, so search is not an unbounded string', async () => {
    names(await reject({ q: 'x'.repeat(121) }, ListShopOrdersQueryDto, 'query'), 'q');
  });

  it('splits a comma-separated list into real enum members', async () => {
    const dto = await accept<ListShopOrdersQueryDto>(
      { status: 'ACCEPTED, PACKED ,OUT_FOR_DELIVERY' },
      ListShopOrdersQueryDto,
      'query',
    );

    assert.deepEqual(dto.status, [
      OrderStatus.ACCEPTED,
      OrderStatus.PACKED,
      OrderStatus.OUT_FOR_DELIVERY,
    ]);
  });

  it('still accepts the single value the previous callers sent', async () => {
    const dto = await accept<ListShopOrdersQueryDto>(
      { status: 'PLACED' },
      ListShopOrdersQueryDto,
      'query',
    );
    assert.deepEqual(dto.status, [OrderStatus.PLACED]);
  });

  it('defaults to page 1, limit 20, newest first, and computes skip', async () => {
    const dto = await accept<ListShopOrdersQueryDto>({}, ListShopOrdersQueryDto, 'query');

    assert.equal(dto.page, 1);
    assert.equal(dto.limit, 20);
    assert.equal(dto.sort, 'newest');
    assert.equal(dto.skip, 0);
    assert.equal(dto.status, undefined);
  });

  it('turns page and limit into numbers, so skip is arithmetic and not concatenation', async () => {
    const dto = await accept<ListShopOrdersQueryDto>(
      { page: '3', limit: '25' },
      ListShopOrdersQueryDto,
      'query',
    );

    assert.equal(dto.skip, 50);
  });
});

describe('review queue query · the endpoint that used to accept no parameters at all', () => {
  it('rejects a rating that is not a number', async () => {
    names(await reject({ rating: 'nine' }, ListShopReviewsQueryDto, 'query'), 'rating');
  });

  it('rejects a rating outside 1–5, at both ends', async () => {
    names(await reject({ rating: '0' }, ListShopReviewsQueryDto, 'query'), 'rating');
    names(await reject({ rating: '6' }, ListShopReviewsQueryDto, 'query'), 'rating');
  });

  it('rejects one bad member of an otherwise valid rating list', async () => {
    // The whole list is refused rather than quietly filtered: a page built from the
    // half of the filter that parsed is not the page the seller asked for.
    names(await reject({ rating: '1,nine' }, ListShopReviewsQueryDto, 'query'), 'rating');
  });

  it('rejects an answered flag that is not a boolean', async () => {
    names(await reject({ answered: 'maybe' }, ListShopReviewsQueryDto, 'query'), 'answered');
  });

  it('rejects an unknown sort', async () => {
    names(await reject({ sort: 'angriest' }, ListShopReviewsQueryDto, 'query'), 'sort');
  });

  it('rejects an unknown parameter rather than ignoring it', async () => {
    names(await reject({ shopId: 'shop_other' }, ListShopReviewsQueryDto, 'query'), 'shopId');
  });

  it('caps limit and refuses page 0', async () => {
    names(await reject({ limit: '5000' }, ListShopReviewsQueryDto, 'query'), 'limit');
    names(await reject({ page: '0' }, ListShopReviewsQueryDto, 'query'), 'page');
  });

  it('bounds the search term', async () => {
    names(await reject({ q: 'x'.repeat(121) }, ListShopReviewsQueryDto, 'query'), 'q');
  });

  it('splits a comma-separated rating list into numbers', async () => {
    const dto = await accept<ListShopReviewsQueryDto>(
      { rating: '1, 2 ,3' },
      ListShopReviewsQueryDto,
      'query',
    );
    assert.deepEqual(dto.rating, [1, 2, 3]);
  });

  it('accepts a single rating as a one-item list', async () => {
    const dto = await accept<ListShopReviewsQueryDto>(
      { rating: '5' },
      ListShopReviewsQueryDto,
      'query',
    );
    assert.deepEqual(dto.rating, [5]);
  });

  it('reads answered=false as false, not as absent', async () => {
    // The unanswered queue is the screen a shop opens to find what it still owes a
    // reply to. `enableImplicitConversion` would turn a boolean-typed property into
    // `!!'false'` — i.e. `true` — so the filter is carried as the raw string and
    // converted by `wantsAnswered`.
    const off = await accept<ListShopReviewsQueryDto>(
      { answered: 'false' },
      ListShopReviewsQueryDto,
      'query',
    );
    assert.equal(off.wantsAnswered, false);

    const on = await accept<ListShopReviewsQueryDto>(
      { answered: 'true' },
      ListShopReviewsQueryDto,
      'query',
    );
    assert.equal(on.wantsAnswered, true);

    const absent = await accept<ListShopReviewsQueryDto>({}, ListShopReviewsQueryDto, 'query');
    assert.equal(absent.wantsAnswered, undefined);
  });

  it('defaults to page 1, limit 20, newest first, with no filters', async () => {
    const dto = await accept<ListShopReviewsQueryDto>({}, ListShopReviewsQueryDto, 'query');

    assert.equal(dto.page, 1);
    assert.equal(dto.limit, 20);
    assert.equal(dto.sort, 'newest');
    assert.equal(dto.skip, 0);
    assert.equal(dto.rating, undefined);
    assert.equal(dto.answered, undefined);
  });

  it('turns page and limit into numbers, so skip is arithmetic', async () => {
    const dto = await accept<ListShopReviewsQueryDto>(
      { page: '4', limit: '25' },
      ListShopReviewsQueryDto,
      'query',
    );
    assert.equal(dto.skip, 75);
  });
});

describe('coupon list query · the other endpoint that took no parameters', () => {
  it('rejects a status outside the two buckets the console offers', async () => {
    // `paused` is a plausible-sounding word that means nothing here: a coupon is
    // running or it is not, and "not" covers off, scheduled, expired and used up.
    names(await reject({ status: 'paused' }, ListShopCouponsQueryDto, 'query'), 'status');
    names(await reject({ status: 'active' }, ListShopCouponsQueryDto, 'query'), 'status');
  });

  it('rejects an unknown sort', async () => {
    names(await reject({ sort: 'cheapest' }, ListShopCouponsQueryDto, 'query'), 'sort');
  });

  it('rejects an unknown parameter rather than ignoring it', async () => {
    // Notably `shopId`: the shop comes from the path, and a query parameter that
    // looked like it could redirect the read must not be silently dropped.
    names(await reject({ shopId: 'shop_other' }, ListShopCouponsQueryDto, 'query'), 'shopId');
    names(await reject({ isActive: 'true' }, ListShopCouponsQueryDto, 'query'), 'isActive');
  });

  it('caps limit and refuses page 0', async () => {
    names(await reject({ limit: '5000' }, ListShopCouponsQueryDto, 'query'), 'limit');
    names(await reject({ page: '0' }, ListShopCouponsQueryDto, 'query'), 'page');
  });

  it('bounds the search term', async () => {
    names(await reject({ q: 'x'.repeat(121) }, ListShopCouponsQueryDto, 'query'), 'q');
  });

  it('defaults to page 1, limit 20, newest first, unfiltered', async () => {
    const dto = await accept<ListShopCouponsQueryDto>({}, ListShopCouponsQueryDto, 'query');

    assert.equal(dto.page, 1);
    assert.equal(dto.limit, 20);
    assert.equal(dto.sort, 'newest');
    assert.equal(dto.skip, 0);
    assert.equal(dto.status, undefined);
    assert.equal(dto.q, undefined);
  });

  it('keeps status a string rather than a boolean-shaped trap', async () => {
    // A `?active=true|false` flag reflected as `boolean` would be converted by
    // `enableImplicitConversion` as `!!'false'` — i.e. `true`. A string enum cannot
    // be misread that way, which is half the reason the filter is spelled this way.
    const dto = await accept<ListShopCouponsQueryDto>(
      { status: 'idle' },
      ListShopCouponsQueryDto,
      'query',
    );
    assert.equal(dto.status, 'idle');
  });

  it('turns page and limit into numbers, so skip is arithmetic', async () => {
    const dto = await accept<ListShopCouponsQueryDto>(
      { page: '4', limit: '25' },
      ListShopCouponsQueryDto,
      'query',
    );
    assert.equal(dto.skip, 75);
  });
});

/**
 * **Never allow client-supplied storage paths.**
 *
 * Two bodies used to. `CreateProductDto` (and `UpdateProductDto`, which extends it)
 * accepted `images: string[]` — unbounded, unvalidated, written straight to
 * `Product.images`, a column the storefront and the cart render as image sources.
 * `DeliveryStatusDto` accepted `podImageUrl: string`, which let the party being
 * questioned in a dispute choose where the platform's proof of delivery pointed.
 *
 * Both fields are removed rather than tightened, so the wall is
 * `forbidNonWhitelisted`: the pipe answers 400 to a body that still sends them.
 * These tests are the reason a well-meaning future edit cannot quietly restore
 * either one — re-adding the property makes the corresponding case go green-to-red.
 *
 * Bytes now arrive on `POST seller/shops/:shopId/products/:productId/images`, and
 * the key is minted by `buildPublicKey` from ids the application already holds.
 */
describe('client-supplied storage paths · the two bodies that used to accept one', () => {
  it('refuses images on product create', async () => {
    names(
      await reject({ name: 'Oil', price: 250, images: ['public/anything.jpg'] }, CreateProductDto),
      'images',
    );
  });

  it('refuses images on product patch', async () => {
    names(await reject({ images: ['https://evil.example/x.png'] }, UpdateProductDto), 'images');
  });

  it('refuses an images array even when it is empty', async () => {
    // An empty array is the shape a console would send while "clearing" photos. It is
    // still the column being addressed from the wire, and clearing has its own route.
    names(await reject({ images: [] }, UpdateProductDto), 'images');
  });

  it('refuses a scheme that is not a photo at all', async () => {
    names(await reject({ images: ['javascript:alert(1)'] }, UpdateProductDto), 'images');
    names(await reject({ images: ['data:text/html;base64,PHNjcmlwdD4='] }, UpdateProductDto), 'images');
  });

  it('accepts the same product body once images is gone', async () => {
    const dto = await accept<CreateProductDto>({ name: 'Oil', price: 250 }, CreateProductDto);

    assert.equal(dto.name, 'Oil');
    assert.equal(dto.price, 250);
    assert.equal('images' in dto, false, 'the DTO must not even declare the property');
  });

  it('refuses podImageUrl on a delivery transition', async () => {
    names(
      await reject({ status: 'DELIVERED', podImageUrl: 'https://seller.example/pod.jpg' }, DeliveryStatusDto),
      'podImageUrl',
    );
  });

  it('refuses podImageUrl even alongside a legitimate note', async () => {
    names(
      await reject(
        { status: 'DELIVERED', podNote: 'Handed to the customer', podImageUrl: '/etc/passwd' },
        DeliveryStatusDto,
      ),
      'podImageUrl',
    );
  });

  it('accepts the transition the seller console actually sends', async () => {
    const dto = await accept<DeliveryStatusDto>(
      { status: 'DELIVERED', podNote: 'Handed to the customer', codCollected: true },
      DeliveryStatusDto,
    );

    assert.equal(dto.podNote, 'Handed to the customer');
    assert.equal(dto.codCollected, true);
    assert.equal('podImageUrl' in dto, false);
  });

  it('bounds the two free-text fields a rider types', async () => {
    names(
      await reject({ status: 'DELIVERED', podNote: 'x'.repeat(POD_NOTE_MAX_LENGTH + 1) }, DeliveryStatusDto),
      'podNote',
    );
    names(
      await reject({ status: 'FAILED', failReason: 'x'.repeat(FAIL_REASON_MAX_LENGTH + 1) }, DeliveryStatusDto),
      'failReason',
    );
    names(await reject({ status: 'FAILED', failReason: '  ' }, DeliveryStatusDto), 'failReason');
  });

  it('refuses logoImage and coverImage on shop settings, which never accepted them', async () => {
    // Recorded as a test rather than only as a comment: the two columns exist on
    // `Shop`, so "add them to the DTO" is the obvious wrong shortcut. Branding needs
    // an upload route, not a string field. See the note on UpdateShopDto.
    names(await reject({ logoImage: 'https://evil.example/logo.png' }, UpdateShopDto), 'logoImage');
    names(await reject({ coverImage: 'public/../../etc/passwd' }, UpdateShopDto), 'coverImage');
  });
});

describe('photo reorder body · keys, bounded, and nothing else', () => {
  it('requires keys', async () => {
    names(await reject({}, ReorderProductImagesDto), 'keys');
  });

  it('refuses a bare string where an array belongs', async () => {
    names(await reject({ keys: 'public/shops/a/products/b/x.jpg' }, ReorderProductImagesDto), 'keys');
  });

  it('refuses a non-string member', async () => {
    names(await reject({ keys: ['public/a.jpg', 7] }, ReorderProductImagesDto), 'keys');
  });

  it('refuses more keys than a product may hold', async () => {
    const tooMany = Array.from({ length: PRODUCT_IMAGE_LIMIT + 1 }, (_, i) => `public/k${i}.jpg`);
    names(await reject({ keys: tooMany }, ReorderProductImagesDto), 'keys');
  });

  it('refuses an unknown key alongside the list', async () => {
    names(await reject({ keys: [], productId: 'prod_9' }, ReorderProductImagesDto), 'productId');
  });

  it('accepts a bounded list of strings — membership is the service’s job, not the pipe’s', async () => {
    const dto = await accept<ReorderProductImagesDto>(
      { keys: ['public/shops/a/products/b/2.jpg', 'public/shops/a/products/b/1.jpg'] },
      ReorderProductImagesDto,
    );

    assert.deepEqual(dto.keys, [
      'public/shops/a/products/b/2.jpg',
      'public/shops/a/products/b/1.jpg',
    ]);
  });
});

/**
 * The shop settings PATCH body, which the seller console now actually sends.
 *
 * Three defects are pinned here rather than described. All three were measured
 * against this DTO through the pipe `main.ts` installs, before it was changed:
 *
 *  1. `{"name": null}` was **accepted**. `@IsOptional()` skips every validator when
 *     the value is `null`, so `data: { name: null }` reached
 *     `prisma.shop.update` for a non-nullable column and came back as a 500.
 *  2. Coordinates were ordinary writable fields. They are now refused entirely;
 *     only a fresh, time-limited phone capture can replace the shop pin.
 *  3. `{"name": ""}` was **accepted**, for the name a storefront is listed under.
 *     `ApplicationFieldsDto` — which created this very column — has
 *     `@MinLength(2)`, so the update path was the looser of the two.
 */
describe('shop settings PATCH · partial, bounded, and null-free', () => {
  it('accepts an empty body: a PATCH that changes nothing is not an error', async () => {
    const dto = await accept<UpdateShopDto>({}, UpdateShopDto);

    // The keys are all *present* and all `undefined` — class-transformer builds a
    // full instance. That is safe rather than a hole: `ShopsService.update` passes
    // the instance straight through as Prisma's `data`, and Prisma reads an
    // `undefined` field as "not provided" (only `null` would write a null, and the
    // DTO refuses `null` outright). What must not happen is a *defined* value
    // appearing from nowhere, so that is what is asserted.
    const defined = Object.entries({ ...dto }).filter(([, v]) => v !== undefined);
    assert.deepEqual(defined, [], 'an empty body must not produce a single written value');
  });

  it('accepts the body the settings screen sends', async () => {
    const dto = await accept<UpdateShopDto>(
      {
        name: 'Namaste Kirana Pasal',
        nameNp: 'नमस्ते किराना पसल',
        description: 'Daily groceries in Baneshwor.',
        phone: '9800000000',
        area: 'Baneshwor, Kathmandu',
        fullAddress: 'Ward 10, New Baneshwor',
        deliveryRadiusKm: 2.5,
        emoji: '🏪',
        hours: '7am – 9pm',
        isOpen: true,
        minOrder: 300,
        soloMode: false,
      },
      UpdateShopDto,
    );

    assert.equal(dto.name, 'Namaste Kirana Pasal');
    assert.equal(dto.deliveryRadiusKm, 2.5);
    assert.equal(dto.minOrder, 300);
    assert.equal(dto.isOpen, true);
    assert.equal(dto.soloMode, false);
  });

  it('refuses null on a non-nullable column — the 500 this DTO used to produce', async () => {
    names(await reject({ name: null }, UpdateShopDto), 'name');
    names(await reject({ isOpen: null }, UpdateShopDto), 'isOpen');
    names(await reject({ deliveryRadiusKm: null }, UpdateShopDto), 'deliveryRadiusKm');
    names(await reject({ minOrder: null }, UpdateShopDto), 'minOrder');
    names(await reject({ soloMode: null }, UpdateShopDto), 'soloMode');
  });

  it('refuses null on a nullable one too: no value here means "unset"', async () => {
    // Deliberate, not an oversight. `""` clears a text column; `null` is rejected
    // so that "clear this" has exactly one spelling on the wire.
    names(await reject({ description: null }, UpdateShopDto), 'description');
    names(await reject({ hours: null }, UpdateShopDto), 'hours');
    names(await reject({ categoryId: null }, UpdateShopDto), 'categoryId');
    names(await reject({ lat: null }, UpdateShopDto), 'lat');
    names(await reject({ lng: null }, UpdateShopDto), 'lng');
  });

  it('refuses hand-typed coordinates because the phone capture owns the shop pin', async () => {
    names(await reject({ lat: 27.6915 }, UpdateShopDto), 'lat');
    names(await reject({ lng: 85.3419 }, UpdateShopDto), 'lng');
  });

  it('clears a nullable text column with an empty string', async () => {
    const dto = await accept<UpdateShopDto>({ description: '', hours: '' }, UpdateShopDto);
    assert.equal(dto.description, '');
    assert.equal(dto.hours, '');
  });

  it('refuses an empty shop name, which a storefront is listed under', async () => {
    names(await reject({ name: '' }, UpdateShopDto), 'name');
    names(await reject({ name: 'x' }, UpdateShopDto), 'name');
    names(await reject({ name: 'x'.repeat(121) }, UpdateShopDto), 'name');
  });

  it('refuses a coordinate sent as a string', async () => {
    names(await reject({ lat: '27.7' }, UpdateShopDto), 'lat');
    names(await reject({ lng: '85.3' }, UpdateShopDto), 'lng');
  });

  it('refuses a coordinate off the planet', async () => {
    names(await reject({ lat: 91 }, UpdateShopDto), 'lat');
    names(await reject({ lng: -181 }, UpdateShopDto), 'lng');
  });

  it('bounds the delivery radius at both ends, as onboarding does', async () => {
    names(await reject({ deliveryRadiusKm: 0.4 }, UpdateShopDto), 'deliveryRadiusKm');
    names(await reject({ deliveryRadiusKm: 21 }, UpdateShopDto), 'deliveryRadiusKm');
    const dto = await accept<UpdateShopDto>({ deliveryRadiusKm: 20 }, UpdateShopDto);
    assert.equal(dto.deliveryRadiusKm, 20);
  });

  it('keeps minOrder a whole number inside the column it is written to', async () => {
    names(await reject({ minOrder: 2.5 }, UpdateShopDto), 'minOrder');
    names(await reject({ minOrder: -1 }, UpdateShopDto), 'minOrder');
    names(await reject({ minOrder: SHOP_MIN_ORDER_MAX + 1 }, UpdateShopDto), 'minOrder');
  });

  it('refuses a boolean sent as the string a form control would produce', async () => {
    names(await reject({ isOpen: 'true' }, UpdateShopDto), 'isOpen');
    names(await reject({ soloMode: 'false' }, UpdateShopDto), 'soloMode');
  });

  it('bounds every free-text field rather than letting the column decide', async () => {
    names(await reject({ nameNp: 'न'.repeat(121) }, UpdateShopDto), 'nameNp');
    names(await reject({ description: 'x'.repeat(1001) }, UpdateShopDto), 'description');
    names(await reject({ phone: '9'.repeat(21) }, UpdateShopDto), 'phone');
    names(await reject({ area: 'x'.repeat(161) }, UpdateShopDto), 'area');
    names(await reject({ fullAddress: 'x'.repeat(301) }, UpdateShopDto), 'fullAddress');
    names(await reject({ hours: 'x'.repeat(121) }, UpdateShopDto), 'hours');
    names(await reject({ categoryId: 'x'.repeat(61) }, UpdateShopDto), 'categoryId');
  });

  it('refuses the payment switches: which methods a shop offers is not a seller field', async () => {
    // Both columns exist on `Shop`. Neither is in any DTO in any scope, so the
    // console shows them read-only — and a caller that tries anyway gets a 400,
    // not a silently ignored key.
    names(await reject({ codEnabled: false }, UpdateShopDto), 'codEnabled');
    names(await reject({ onlinePaymentEnabled: true }, UpdateShopDto), 'onlinePaymentEnabled');
  });

  it('refuses the fields that decide a shop’s standing', async () => {
    names(await reject({ status: 'ACTIVE' }, UpdateShopDto), 'status');
    names(await reject({ verified: true }, UpdateShopDto), 'verified');
    names(await reject({ statusReason: 'looks fine to me' }, UpdateShopDto), 'statusReason');
    names(await reject({ ownerId: 'usr_someone_else' }, UpdateShopDto), 'ownerId');
    names(await reject({ slug: 'namaste-kirana' }, UpdateShopDto), 'slug');
    names(await reject({ ratingAvg: 5 }, UpdateShopDto), 'ratingAvg');
  });

  it('refuses a shopId in the body — the route param is the only shop scope', async () => {
    // `PermissionsGuard.resolveShopId` will read a body `shopId` if the param is
    // missing; on this route the param is always present, and the whitelist means
    // a body copy cannot even be sent.
    names(await reject({ shopId: 'shop_other', name: 'Fine name' }, UpdateShopDto), 'shopId');
  });
});

describe('shop location capture · phone-derived input only', () => {
  it('lets an applicant pin the shop they are standing in', async () => {
    // This used to be refused on both seller forms, and the application form
    // was the wrong half of that rule: the applicant is in the shop holding a
    // GPS, and without a pin the approved shop stays invisible behind
    // `VERIFIED_LOCATION`. The bounds are the supervised capture's, to the
    // metre, so a coordinate means the same thing whichever door it came in.
    const dto = await accept<ApplicationFieldsDto>(
      { lat: 27.7, lng: 85.3, locationAccuracyM: 12 },
      ApplicationFieldsDto,
    );
    assert.equal(dto.lat, 27.7);
    assert.equal(dto.locationAccuracyM, 12);
  });

  it('still refuses coordinates on an approved shop’s own settings form', async () => {
    // An approved shop moving itself on the map is the supervised capture's
    // business, not a field on the settings page.
    names(await reject({ lat: 27.7 }, UpdateShopDto), 'lat');
    names(await reject({ lng: 85.3 }, UpdateShopDto), 'lng');
  });

  it('will not let an applicant claim how their coordinate was obtained', async () => {
    // `locationCaptureMethod` is the server's account of provenance. A client
    // that could set it could claim a supervised capture it never had, which
    // is the entire value a reviewer takes from the field.
    names(await reject({ locationCaptureMethod: 'HANDOFF' }, ApplicationFieldsDto), 'locationCaptureMethod');
    names(await reject({ locationCapturedAt: '2020-01-01T00:00:00.000Z' }, ApplicationFieldsDto), 'locationCapturedAt');
  });

  it('accepts only an explicit direct-or-handoff mode', async () => {
    const dto = await accept<CreateLocationCaptureDto>({ mode: 'HANDOFF' }, CreateLocationCaptureDto);
    assert.equal(dto.mode, 'HANDOFF');
    names(await reject({ mode: 'MANUAL' }, CreateLocationCaptureDto), 'mode');
  });

  it('requires a fresh-position shape with 100 metre accuracy or better', async () => {
    const valid = {
      lat: 27.7,
      lng: 85.3,
      accuracyM: 12,
      capturedAt: '2026-09-09T10:00:00.000Z',
    };
    const dto = await accept<SubmitCapturedLocationDto>(valid, SubmitCapturedLocationDto);
    assert.equal(dto.accuracyM, 12);
    names(await reject({ ...valid, accuracyM: 101 }, SubmitCapturedLocationDto), 'accuracyM');
    names(await reject({ ...valid, lat: 120 }, SubmitCapturedLocationDto), 'lat');
  });
});

/**
 * The shared search bound, on the DTO that defines it.
 *
 * `SEARCH_MAX_LENGTH` was added to `PaginationDto` and then imported by the order,
 * review and coupon query DTOs; each of those has its own 121-character rejection
 * above. What none of them pinned is the base class — or the accepting side of the
 * boundary, which is the half that breaks quietly. A bound that rejects 121 and also
 * rejects 120 is not a bound, it is an outage for the longest legitimate search, and
 * `q` is server-side search: a request that 400s is a seller who cannot find a
 * product rather than a seller who sees the wrong page.
 */
describe('search length · the bound every list query inherits', () => {
  it('accepts a search at exactly the limit', async () => {
    const dto = await accept<PaginationDto>(
      { q: 'x'.repeat(SEARCH_MAX_LENGTH) },
      PaginationDto,
      'query',
    );
    assert.equal(dto.q?.length, SEARCH_MAX_LENGTH);
  });

  it('rejects one character past it', async () => {
    names(
      await reject({ q: 'x'.repeat(SEARCH_MAX_LENGTH + 1) }, PaginationDto, 'query'),
      'q',
    );
  });

  it('counts characters, not bytes, so Devanagari is not penalised', async () => {
    // `@MaxLength` measures `String.length`. A 120-character Nepali search is three
    // times the bytes of a Latin one and must still be accepted, or search would be
    // a third as useful in the language half the catalogue is written in.
    const dto = await accept<PaginationDto>(
      { q: 'न'.repeat(SEARCH_MAX_LENGTH) },
      PaginationDto,
      'query',
    );
    assert.equal(dto.q?.length, SEARCH_MAX_LENGTH);
  });

  it('is a query-string DTO, so page and limit still coerce alongside it', async () => {
    const dto = await accept<PaginationDto>({ q: 'oil', page: '2', limit: '20' }, PaginationDto, 'query');
    assert.equal(dto.q, 'oil');
    assert.equal(dto.page, 2);
    assert.equal(dto.limit, 20);
  });
});

/**
 * Clearing a role's description.
 *
 * `RolesService.update` writes `description: patch.description` straight through and
 * `name: patch.name?.trim()`, so what a caller may send here decides what a seller
 * can undo. The console's role editor depends on an empty box clearing the column,
 * because there is no other spelling for "remove this".
 *
 * `name` is deliberately not clearable the same way: `@MinLength(2)` runs on `''`,
 * so a role cannot be left nameless.
 *
 * `null` is a third case, and it is worth pinning because the DTO looks stricter than
 * it is: every field here is `@IsOptional()`, which skips *all* validators when the
 * value is `null` as well as `undefined`. So `null` reaches the service on both
 * fields, and the service is what makes it safe — `patch.name?.trim()` collapses to
 * `undefined` and leaves the column alone, while `description: null` clears a column
 * Prisma declares `String?`. Neither is a 400 and neither corrupts a row; the
 * assertions below say which is which so a future `@OptionalField()` swap (which does
 * reject `null`) is a deliberate change rather than a surprise.
 */
describe('role PATCH · an empty description clears, an empty name does not', () => {
  it('accepts an empty description, which is how the editor removes one', async () => {
    const dto = await accept<UpdateRoleDto>({ description: '' }, UpdateRoleDto);
    assert.equal(dto.description, '');
  });

  it('refuses an empty name', async () => {
    names(await reject({ name: '' }, UpdateRoleDto), 'name');
  });

  it('lets a null through the pipe on both fields — @IsOptional() skips null', async () => {
    const dto = await accept<UpdateRoleDto>({ name: null, description: null }, UpdateRoleDto);
    assert.equal(dto.name, null);
    assert.equal(dto.description, null);
  });

  it('bounds both fields', async () => {
    names(await reject({ name: 'x'.repeat(61) }, UpdateRoleDto), 'name');
    names(await reject({ description: 'x'.repeat(201) }, UpdateRoleDto), 'description');
  });

  it('rejects an unknown key, so scope cannot be smuggled in', async () => {
    names(await reject({ name: 'Packer', scope: 'PLATFORM' }, UpdateRoleDto), 'scope');
    names(await reject({ name: 'Packer', shopId: 'shop_other' }, UpdateRoleDto), 'shopId');
  });
});

/**
 * `{"permissions": []}` used to be the quietest way to take a shop's staff offline.
 *
 * `RolesService.update` tests `if (patch.permissions)`, and `[]` is truthy. The
 * transaction then ran `rolePermission.deleteMany({ where: { roleId } })` followed by
 * a `createMany` of zero rows and answered **200**: the role kept its name, kept
 * every member, and every one of those members dropped to default-deny. Nothing in
 * the response said so.
 *
 * `CreateRoleDto` has always had `@ArrayNotEmpty()`, so a role could not be *created*
 * empty — the update path was simply the looser of the two. Omitting the key remains
 * the way to leave permissions alone, which is what every caller does; the seller
 * console's role editor cannot send `[]` at all, because Save is gated on
 * `keys.size > 0`.
 */
describe('role PATCH · the empty permissions array that used to revoke everyone', () => {
  it('refuses an empty permissions array', async () => {
    names(await reject({ permissions: [] }, UpdateRoleDto), 'permissions');
  });

  it('refuses it on create too, which is where the rule came from', async () => {
    names(await reject({ name: 'Packer', permissions: [] }, CreateRoleDto), 'permissions');
  });

  it('still treats an omitted key as "leave the permissions alone"', async () => {
    const dto = await accept<UpdateRoleDto>({ name: 'Packer' }, UpdateRoleDto);

    assert.equal(dto.name, 'Packer');
    assert.equal(dto.permissions, undefined, 'absent must stay absent, not become []');
  });

  it('accepts a real list', async () => {
    const dto = await accept<UpdateRoleDto>(
      { permissions: ['orders.view', 'orders.manage'] },
      UpdateRoleDto,
    );
    assert.deepEqual(dto.permissions, ['orders.view', 'orders.manage']);
  });

  it('bounds the list at the size of the catalogue', async () => {
    // `RolePermission` is `@@id([roleId, permissionKey])`, so a role cannot hold
    // more rows than there are permissions; a longer body is only a way to make
    // `createMany` fail on a duplicate mid-transaction.
    const tooMany = Array.from({ length: 500 }, () => 'orders.view');
    names(await reject({ permissions: tooMany }, UpdateRoleDto), 'permissions');
  });

  it('refuses a non-string member', async () => {
    names(await reject({ permissions: ['orders.view', 7] }, UpdateRoleDto), 'permissions');
  });
});

/**
 * The profile PATCH body, and the image URL it used to accept.
 *
 * `avatarUrl` was `@IsOptional() @IsString()` — unbounded, unvalidated, written
 * straight into `User.avatarUrl` by `UsersService.update` and handed back by both
 * `GET users/me` and `GET auth/me`. That is a client-supplied storage path with a
 * friendlier name: the caller decided where a picture rendered next to their name
 * came from, including an external host or a `javascript:`/`data:` URL. The field is
 * removed rather than tightened, so the wall is `forbidNonWhitelisted` — exactly how
 * `Product.images`, `logoImage` and `coverImage` are refused.
 *
 * `locale` is the other half: `User.locale` is `String @default("en")`, non-nullable,
 * and `@IsOptional()` skips every validator on `null`, so `{"locale": null}` passed
 * `@IsIn(['en','np'])` and reached `prisma.user.update`.
 */
describe('profile PATCH · the avatar URL a client used to choose', () => {
  it('refuses avatarUrl', async () => {
    names(await reject({ avatarUrl: 'https://evil.example/me.png' }, UpdateProfileDto), 'avatarUrl');
  });

  it('refuses it whatever the scheme', async () => {
    names(await reject({ avatarUrl: 'javascript:alert(1)' }, UpdateProfileDto), 'avatarUrl');
    names(await reject({ avatarUrl: 'public/../../etc/passwd' }, UpdateProfileDto), 'avatarUrl');
  });

  it('refuses it alongside a legitimate name change', async () => {
    names(await reject({ name: 'Sita', avatarUrl: '/uploads/public/x.jpg' }, UpdateProfileDto), 'avatarUrl');
  });

  it('accepts the rest of the body, and does not declare the property', async () => {
    const dto = await accept<UpdateProfileDto>(
      { name: 'Sita Sharma', email: 'sita@example.com', locale: 'np' },
      UpdateProfileDto,
    );

    assert.equal(dto.name, 'Sita Sharma');
    assert.equal(dto.locale, 'np');
    assert.equal('avatarUrl' in dto, false, 'the DTO must not even declare the property');
  });

  it('refuses a null locale, whose column is non-nullable', async () => {
    names(await reject({ locale: null }, UpdateProfileDto), 'locale');
  });

  it('refuses a locale outside the two the platform ships', async () => {
    names(await reject({ locale: 'hi' }, UpdateProfileDto), 'locale');
  });

  it('still clears a nullable column with null, where that is the real meaning', async () => {
    // `User.name` and `User.email` are `String?`. `UsersService.update` hand-projects
    // both, so `null` reaches the column and empties it — the `UpdateProductDto` rule,
    // not the `UpdateShopDto` one, because these two columns can genuinely be unset.
    const dto = await accept<UpdateProfileDto>({ name: null, email: null }, UpdateProfileDto);
    assert.equal(dto.name, null);
    assert.equal(dto.email, null);
  });

  it('bounds the name and refuses a non-address in email', async () => {
    names(await reject({ name: 'x'.repeat(81) }, UpdateProfileDto), 'name');
    names(await reject({ email: 'not-an-address' }, UpdateProfileDto), 'email');
  });
});

/**
 * The delivery address body, whose phone number ends up inside a URL scheme.
 *
 * `Address.phone` was `@IsString()` and nothing else: no shape, no length, against
 * an unbounded Postgres `text` column. The seller console renders that column as
 * `href={`tel:${o.recipientPhone}`}` and `href={`sms:${o.recipientPhone}`}` on the
 * order detail screen, so whatever a customer stored is what a shopkeeper's browser
 * is handed as a URL. It was also the only phone field in the API validated at no
 * layer at all — `AssignPlatformStaffDto`, `CreateInviteDto` and `RegisterRiderDto`
 * all look equally loose on the DTO but are put through `normalizeNepalPhone` by
 * their services.
 *
 * The pattern is anchored deliberately. `auth.dto.ts` uses `/[0-9+\s-]{7,15}/`
 * *without* anchors, which is satisfied by a digit run anywhere inside a longer
 * string, so it would accept a value with a quote or an angle bracket in it.
 */
describe('address create · the phone that reaches a tel: href', () => {
  const valid = {
    recipientName: 'Sita Sharma',
    phone: '9800000000',
    area: 'Baneshwor, Kathmandu',
    fullAddress: 'Ward 10, New Baneshwor',
  };

  it('accepts the shapes a Nepali customer actually types', async () => {
    for (const phone of ['9800000000', '+9779800000000', '+977 980-0000000', '01-4567890']) {
      const dto = await accept<AddressDto>({ ...valid, phone }, AddressDto);
      assert.equal(dto.phone, phone);
    }
  });

  it('refuses anything that is not a phone number at all', async () => {
    names(await reject({ ...valid, phone: 'call the shop' }, AddressDto), 'phone');
    names(await reject({ ...valid, phone: '' }, AddressDto), 'phone');
    names(await reject({ ...valid, phone: '   -  - ' }, AddressDto), 'phone');
  });

  it('refuses a value that would change the meaning of the href it is spliced into', async () => {
    names(await reject({ ...valid, phone: '9800000000" onclick="x' }, AddressDto), 'phone');
    names(await reject({ ...valid, phone: 'javascript:alert(1)' }, AddressDto), 'phone');
    names(await reject({ ...valid, phone: '98000\n00000' }, AddressDto), 'phone');
    names(await reject({ ...valid, phone: '9800000000?a=b' }, AddressDto), 'phone');
  });

  it('bounds it, against a column that would take anything', async () => {
    names(
      await reject({ ...valid, phone: '9'.repeat(ADDRESS_PHONE_MAX_LENGTH + 1) }, AddressDto),
      'phone',
    );
  });

  it('is required — an address a rider cannot ring is not an address', async () => {
    const { phone: _drop, ...withoutPhone } = valid;
    names(await reject(withoutPhone, AddressDto), 'phone');
  });
});

/**
 * `null` against the six non-nullable columns of `Address`.
 *
 * `AddressesService.create` builds `tx.address.create({ data: { ...input, … } })`,
 * so the body is the write. `label`, `recipientName`, `phone`, `area`,
 * `fullAddress` and `isDefault` are all non-nullable in the schema, and
 * `@IsOptional()` skips *every* validator when the value is `null` — which is how
 * `{"label": null}` used to get past `@IsString()` and fail inside Prisma instead.
 * `landmark`, `lat` and `lng` are the three nullable columns, so there `null` is a
 * real "no value" and must still be accepted.
 */
describe('address create · null against a column that cannot hold it', () => {
  const valid = {
    recipientName: 'Sita Sharma',
    phone: '9800000000',
    area: 'Baneshwor, Kathmandu',
    fullAddress: 'Ward 10, New Baneshwor',
  };

  it('refuses null on every non-nullable column', async () => {
    for (const field of [
      'label',
      'recipientName',
      'phone',
      'area',
      'fullAddress',
      'isDefault',
    ] as const) {
      names(await reject({ ...valid, [field]: null }, AddressDto), field);
    }
  });

  it('accepts null on the three columns that are nullable', async () => {
    const dto = await accept<AddressDto>(
      { ...valid, landmark: null, lat: null, lng: null },
      AddressDto,
    );
    assert.equal(dto.landmark, null);
    assert.equal(dto.lat, null);
    assert.equal(dto.lng, null);
  });

  it('accepts the body with every optional key omitted', async () => {
    const dto = await accept<AddressDto>(valid, AddressDto);
    assert.equal(dto.label, undefined);
    assert.equal(dto.landmark, undefined);
    assert.equal(dto.isDefault, undefined);
    assert.equal(dto.lat, undefined);
    assert.equal(dto.lng, undefined);
  });
});

/**
 * `isDefault` had no `@IsBoolean()`, and it is read as a bare truthy value.
 *
 * `create` computes `input.isDefault || count === 0`; `update` runs
 * `if (input.isDefault) { …address.updateMany({ isDefault: false }) }` over every
 * *other* address this user owns before writing this one. A string `"yes"` is
 * truthy, so the clearing ran and then the write failed inside Prisma against a
 * `Boolean` column. Both are wrapped in `$transaction`, so the damage rolled back —
 * but the caller was answered with a database error rather than a 400 naming the
 * field, and the rollback was the only thing standing between a typo and a user
 * with no default address.
 */
describe('address · isDefault is a boolean, not a truthy value', () => {
  const valid = {
    recipientName: 'Sita Sharma',
    phone: '9800000000',
    area: 'Baneshwor, Kathmandu',
    fullAddress: 'Ward 10, New Baneshwor',
  };

  it('refuses the truthy values that used to reach the updateMany', async () => {
    for (const isDefault of ['yes', 'true', 1, 'false', '']) {
      names(await reject({ ...valid, isDefault }, AddressDto), 'isDefault');
    }
  });

  it('accepts both booleans', async () => {
    assert.equal((await accept<AddressDto>({ ...valid, isDefault: true }, AddressDto)).isDefault, true);
    assert.equal(
      (await accept<AddressDto>({ ...valid, isDefault: false }, AddressDto)).isDefault,
      false,
    );
  });
});

/**
 * The coordinates, and the bound on every string.
 *
 * `@IsLatitude()` on its own accepts the *string* `"27.7"`; body validation runs
 * with implicit conversion off by design, and `Address.lat` is a `Float?`, so the
 * string would have reached Prisma. `@IsNumber()` in front of it is the same
 * pairing `UpdateShopDto` uses for the shop's own coordinates.
 *
 * The lengths are asserted against the exported constants rather than literals so
 * that raising a bound cannot leave a test asserting the old number.
 */
describe('address · coordinates and string bounds', () => {
  const valid = {
    recipientName: 'Sita Sharma',
    phone: '9800000000',
    area: 'Baneshwor, Kathmandu',
    fullAddress: 'Ward 10, New Baneshwor',
  };

  it('refuses a coordinate sent as a string', async () => {
    names(await reject({ ...valid, lat: '27.7' }, AddressDto), 'lat');
    names(await reject({ ...valid, lng: '85.3' }, AddressDto), 'lng');
  });

  it('refuses a coordinate that is not on the globe', async () => {
    names(await reject({ ...valid, lat: 91 }, AddressDto), 'lat');
    names(await reject({ ...valid, lng: 181 }, AddressDto), 'lng');
  });

  it('accepts Kathmandu', async () => {
    const dto = await accept<AddressDto>({ ...valid, lat: 27.7172, lng: 85.324 }, AddressDto);
    assert.equal(dto.lat, 27.7172);
    assert.equal(dto.lng, 85.324);
  });

  it('bounds every string the customer types', async () => {
    const cases: Array<[string, number]> = [
      ['label', ADDRESS_LABEL_MAX_LENGTH],
      ['recipientName', ADDRESS_NAME_MAX_LENGTH],
      ['area', ADDRESS_AREA_MAX_LENGTH],
      ['landmark', ADDRESS_LANDMARK_MAX_LENGTH],
      ['fullAddress', ADDRESS_FULL_ADDRESS_MAX_LENGTH],
    ];
    for (const [field, max] of cases) {
      await accept<AddressDto>({ ...valid, [field]: 'x'.repeat(max) }, AddressDto);
      names(await reject({ ...valid, [field]: 'x'.repeat(max + 1) }, AddressDto), field);
    }
  });

  it('refuses a key the body does not declare', async () => {
    names(await reject({ ...valid, userId: 'other-user' }, AddressDto), 'userId');
    names(await reject({ ...valid, isDeleted: true }, AddressDto), 'isDeleted');
  });
});

/**
 * The address PATCH body, which used to be the *looser* of the two.
 *
 * `UpdateAddressDto` was a hand-written copy of `AddressDto` with every field
 * marked `@IsOptional()` and every `@MaxLength` dropped, so `recipientName` and
 * `fullAddress` were bounded on create and unbounded on update, and `phone` had no
 * shape on either. `AddressesService.update` hands the body to
 * `prisma.address.update` as `data`, so PATCH is a write of exactly these keys.
 *
 * It now `extends AddressDto` and re-declares the four required fields with
 * `@OptionalField()`, which makes each one omittable without admitting `null` — the
 * same `declare` re-decoration `UpdateProductDto` and `UpdateVariantDto` use. These
 * tests exist to pin the two halves of that: the inherited validators still fire,
 * and the inherited `required` no longer does.
 */
describe('address PATCH · inherits the bounds it used to drop', () => {
  it('accepts an empty body', async () => {
    const dto = await accept<UpdateAddressDto>({}, UpdateAddressDto);
    assert.equal(dto.recipientName, undefined);
    assert.equal(dto.phone, undefined);
    assert.equal(dto.area, undefined);
    assert.equal(dto.fullAddress, undefined);
  });

  it('does not require the fields AddressDto marks required', async () => {
    const dto = await accept<UpdateAddressDto>({ label: 'Office' }, UpdateAddressDto);
    assert.equal(dto.label, 'Office');
  });

  it('applies the inherited phone pattern on update too', async () => {
    names(await reject({ phone: 'ring the bell' }, UpdateAddressDto), 'phone');
    names(await reject({ phone: '9800000000" onclick="x' }, UpdateAddressDto), 'phone');
    assert.equal((await accept<UpdateAddressDto>({ phone: '01-4567890' }, UpdateAddressDto)).phone, '01-4567890');
  });

  it('applies the inherited length bounds on update too', async () => {
    names(
      await reject({ recipientName: 'x'.repeat(ADDRESS_NAME_MAX_LENGTH + 1) }, UpdateAddressDto),
      'recipientName',
    );
    names(
      await reject(
        { fullAddress: 'x'.repeat(ADDRESS_FULL_ADDRESS_MAX_LENGTH + 1) },
        UpdateAddressDto,
      ),
      'fullAddress',
    );
    names(await reject({ area: 'x'.repeat(ADDRESS_AREA_MAX_LENGTH + 1) }, UpdateAddressDto), 'area');
    names(
      await reject({ label: 'x'.repeat(ADDRESS_LABEL_MAX_LENGTH + 1) }, UpdateAddressDto),
      'label',
    );
    names(
      await reject({ landmark: 'x'.repeat(ADDRESS_LANDMARK_MAX_LENGTH + 1) }, UpdateAddressDto),
      'landmark',
    );
  });

  it('refuses null on the four fields it re-declares', async () => {
    for (const field of ['recipientName', 'phone', 'area', 'fullAddress'] as const) {
      names(await reject({ [field]: null }, UpdateAddressDto), field);
    }
  });

  it('still types isDefault and the coordinates', async () => {
    names(await reject({ isDefault: 'yes' }, UpdateAddressDto), 'isDefault');
    names(await reject({ lat: '27.7' }, UpdateAddressDto), 'lat');
  });

  it('refuses a key the body does not declare', async () => {
    names(await reject({ userId: 'other-user' }, UpdateAddressDto), 'userId');
  });
});

/**
 * The catalogue import flag, which decides whether a whole shelf gets rewritten.
 *
 * It is a word rather than a boolean for one reason, asserted here so nobody
 * "tidies" it back: query strings are validated with `enableImplicitConversion`
 * on, and a property reflected as `boolean` is converted with `!!value` — so an
 * honest `?apply=false` from a client that means "just check" would arrive as
 * `true` and write. This was not hypothetical; the route shipped that way for an
 * afternoon and the dry run applied.
 */
describe('catalogue import mode', () => {
  it('defaults to checking when the parameter is absent', async () => {
    const dto = await accept<ImportProductsQueryDto>({}, ImportProductsQueryDto, 'query');
    assert.equal(dto.mode, undefined);
    assert.notEqual(dto.mode, 'apply', 'absent must never mean apply');
  });

  it('carries the two words through unchanged', async () => {
    for (const mode of ['check', 'apply'] as const) {
      const dto = await accept<ImportProductsQueryDto>({ mode }, ImportProductsQueryDto, 'query');
      assert.equal(dto.mode, mode);
    }
  });

  it('refuses anything else rather than guessing', async () => {
    await assert.rejects(
      () => accept({ mode: 'true' }, ImportProductsQueryDto, 'query'),
      BadRequestException,
    );
  });
});

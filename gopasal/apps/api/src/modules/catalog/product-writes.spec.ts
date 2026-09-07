import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { StorageProvider } from '../../providers/storage.provider';
import type { UploadsService } from '../uploads/uploads.service';
import { ProductsService, type ProductPatch, type VariantPatch } from './products.service';

/**
 * What actually reaches Prisma on a seller write, and what happens when the row
 * belongs to somebody else.
 *
 * Two things are being pinned here.
 *
 * **The second wall.** `ValidationPipe` is the first line — see
 * `common/dto/request-validation.spec.ts` — but the update sinks used to spread the
 * request object straight into `prisma.product.update({ data })`. That is safe exactly
 * as long as every caller is a validated DTO, and one route had already lost that
 * property once. `productData`/`variantData` now project columns by hand, so this file
 * asserts on the `data` object Prisma is handed rather than on the DTO: a key that
 * nobody declared must not be there even if it got past the pipe.
 *
 * **Tenancy.** Every write goes through `mustBelong`/`mustOwnVariant`, and a foreign
 * row must be indistinguishable from an absent one. The permission guard has already
 * confirmed membership of the *path* shop by this point; what these guards stop is a
 * member of shop A editing a row that belongs to shop B.
 *
 * The fake Prisma records rather than pretends: if a guard fails to throw, `update`
 * and `delete` are still reachable and the assertion on `calls` says so.
 */

interface ProductRow {
  id: string;
  shopId: string;
  trackStock: boolean;
  stock: number;
  /** Storage keys, never URLs — see `product-images.ts`. Empty for every row here. */
  images: string[];
}

interface VariantRow {
  id: string;
  productId: string;
  product: { shopId: string };
}

interface Recorded {
  productUpdates: Record<string, unknown>[];
  variantUpdates: Record<string, unknown>[];
  deletes: string[];
}

const PRODUCT: ProductRow = {
  id: 'prod_1',
  shopId: 'shop_a',
  trackStock: true,
  stock: 12,
  images: [],
};
const FOREIGN: ProductRow = {
  id: 'prod_2',
  shopId: 'shop_b',
  trackStock: true,
  stock: 3,
  images: [],
};
const VARIANT: VariantRow = { id: 'var_1', productId: 'prod_1', product: { shopId: 'shop_a' } };
const FOREIGN_VARIANT: VariantRow = {
  id: 'var_2',
  productId: 'prod_2',
  product: { shopId: 'shop_b' },
};

/**
 * The two collaborators `ProductsService` gained with the photo routes, as objects
 * that refuse to be used.
 *
 * Every fake product in this file has `images: []`, so nothing in a write path
 * reaches either one: `resolveImageUrls` iterates an empty list and `forgetImages`
 * awaits nothing. They throw rather than returning a placeholder so that a future
 * change which does start storing or resolving here fails the test instead of
 * passing against invented data. The photo routes have their own file —
 * `product-images.spec.ts` — with doubles that record.
 */
function refusingStorage(): StorageProvider {
  const refuse =
    (op: string) =>
    (): never => {
      throw new Error(`storage.${op} must not be reached by a product write test`);
    };
  return {
    name: 'refusing',
    save: refuse('save'),
    read: refuse('read'),
    remove: refuse('remove'),
    publicUrl: refuse('publicUrl'),
  };
}

function refusingUploads(): UploadsService {
  const refuse =
    (op: string) =>
    (): never => {
      throw new Error(`uploads.${op} must not be reached by a product write test`);
    };
  return {
    storePublicImage: refuse('storePublicImage'),
    remove: refuse('remove'),
    read: refuse('read'),
  } as unknown as UploadsService;
}

function harness(): { products: ProductsService; calls: Recorded } {
  const calls: Recorded = { productUpdates: [], variantUpdates: [], deletes: [] };
  const products = [PRODUCT, FOREIGN];
  const variants = [VARIANT, FOREIGN_VARIANT];

  const prisma = {
    product: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(products.find((p) => p.id === where.id) ?? null),
      update: ({ data }: { data: Record<string, unknown> }) => {
        calls.productUpdates.push(data);
        return Promise.resolve({ ...PRODUCT, ...data });
      },
      delete: ({ where }: { where: { id: string } }) => {
        calls.deletes.push(where.id);
        return Promise.resolve(PRODUCT);
      },
    },
    productVariant: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(variants.find((v) => v.id === where.id) ?? null),
      update: ({ data }: { data: Record<string, unknown> }) => {
        calls.variantUpdates.push(data);
        return Promise.resolve({ ...VARIANT, ...data });
      },
      delete: ({ where }: { where: { id: string } }) => {
        calls.deletes.push(where.id);
        return Promise.resolve(VARIANT);
      },
    },
  } as unknown as PrismaService;

  return {
    products: new ProductsService(prisma, refusingUploads(), refusingStorage()),
    calls,
  };
}

/** Assert the call throws a 404 carrying exactly `message`, and touched nothing. */
async function expect404(
  run: () => Promise<unknown>,
  message: string,
  calls: Recorded,
): Promise<void> {
  await assert.rejects(run, (err: unknown) => {
    assert.ok(err instanceof NotFoundException, `expected a 404, got ${String(err)}`);
    assert.equal(err.message, message);
    return true;
  });
  assert.deepEqual(calls.productUpdates, []);
  assert.deepEqual(calls.variantUpdates, []);
  assert.deepEqual(calls.deletes, []);
}

describe('cross-shop product writes · a foreign row is not there', () => {
  it('refuses to update another shop’s product', async () => {
    const { products, calls } = harness();
    await expect404(() => products.update('shop_a', FOREIGN.id, { name: 'Taken over' }), 'Product not found', calls);
  });

  it('gives the identical answer for a product that does not exist', async () => {
    const { products, calls } = harness();
    await expect404(() => products.update('shop_a', 'prod_nope', { name: 'x' }), 'Product not found', calls);
  });

  it('refuses to delete another shop’s product', async () => {
    const { products, calls } = harness();
    await expect404(() => products.remove('shop_a', FOREIGN.id), 'Product not found', calls);
  });

  it('refuses to move another shop’s stock', async () => {
    const { products, calls } = harness();
    await expect404(() => products.adjustStock('shop_a', FOREIGN.id, -3), 'Product not found', calls);
  });

  it('refuses to update another shop’s variant', async () => {
    const { products, calls } = harness();
    await expect404(
      () => products.updateVariant('shop_a', FOREIGN_VARIANT.id, { stock: 0 }),
      'Variant not found',
      calls,
    );
  });

  it('refuses to delete another shop’s variant', async () => {
    const { products, calls } = harness();
    await expect404(() => products.removeVariant('shop_a', FOREIGN_VARIANT.id), 'Variant not found', calls);
  });

  it('refuses to add a variant to another shop’s product', async () => {
    const { products, calls } = harness();
    await expect404(
      () => products.addVariant('shop_a', FOREIGN.id, { name: '1 kg', price: 200 }),
      'Product not found',
      calls,
    );
  });

  it('lets the owning shop through, so the guard is not simply refusing everything', async () => {
    const { products, calls } = harness();
    await products.update('shop_a', PRODUCT.id, { name: 'Sunflower oil' });

    assert.equal(calls.productUpdates.length, 1);
    assert.equal(calls.productUpdates[0]?.name, 'Sunflower oil');
  });
});

describe('column projection · what Prisma is handed', () => {
  /** A body that got past the pipe somehow. The projection is the wall that holds. */
  const smuggled = {
    name: 'Oil',
    shopId: 'shop_b',
    id: 'prod_9',
    createdAt: new Date(),
    // `forbidNonWhitelisted` answers 400 to this key on the wire; the point of
    // including it here is that the projection would drop it even if it did not.
    images: ['https://evil.example/logo.png', 'javascript:alert(1)'],
  } as ProductPatch;

  it('drops keys the projection does not name, even shopId and id', async () => {
    const { products, calls } = harness();
    await products.update('shop_a', PRODUCT.id, smuggled);

    const data = calls.productUpdates[0] ?? {};
    // `images` is deliberately absent from this list. It used to be projected, which
    // is what let `PATCH { "images": ["https://…"] }` write a client-supplied storage
    // path into a column the storefront renders as an image source. Photos now arrive
    // as bytes on the three image routes, which mint their own keys. Adding `images`
    // back here re-opens that hole, so this assertion is the guard.
    assert.deepEqual(Object.keys(data).sort(), [
      'categoryId',
      'description',
      'isActive',
      'mrp',
      'name',
      'nameNp',
      'price',
      'stock',
      'tags',
      'trackStock',
      'unit',
    ]);
    assert.equal('shopId' in data, false);
    assert.equal('id' in data, false);
    assert.equal('images' in data, false);
  });

  it('leaves unmentioned columns undefined, so a PATCH does not reset unit', async () => {
    const { products, calls } = harness();
    await products.update('shop_a', PRODUCT.id, { price: 150 });

    const data = calls.productUpdates[0] ?? {};
    assert.equal(data.price, 150);
    assert.equal(data.unit, undefined);
    assert.equal(data.name, undefined);
  });

  /**
   * `@IsOptional()` skips `null` as well as `undefined`, so `{"name": null}` clears
   * every validator. Forwarded, it makes Prisma throw for a non-nullable column and
   * the client gets a 500 for a body it was allowed to send.
   */
  it('turns a null on a non-nullable column into "leave it alone"', async () => {
    const { products, calls } = harness();
    await products.update('shop_a', PRODUCT.id, {
      name: null,
      price: null,
      unit: null,
      stock: null,
      trackStock: null,
      isActive: null,
    } as unknown as ProductPatch);

    const data = calls.productUpdates[0] ?? {};
    for (const column of ['name', 'price', 'unit', 'stock', 'trackStock', 'isActive']) {
      assert.equal(data[column], undefined, `${column} should have been dropped, not nulled`);
    }
  });

  it('keeps a null on a nullable column, because that is how a seller clears it', async () => {
    const { products, calls } = harness();
    await products.update('shop_a', PRODUCT.id, {
      nameNp: null,
      description: null,
      categoryId: null,
      mrp: null,
    } as unknown as ProductPatch);

    const data = calls.productUpdates[0] ?? {};
    assert.equal(data.nameNp, null);
    assert.equal(data.description, null);
    assert.equal(data.categoryId, null);
    assert.equal(data.mrp, null);
  });

  it('projects a variant patch to its six columns and no more', async () => {
    const { products, calls } = harness();
    await products.updateVariant('shop_a', VARIANT.id, {
      stock: 4,
      productId: 'prod_9',
    } as VariantPatch);

    const data = calls.variantUpdates[0] ?? {};
    assert.deepEqual(Object.keys(data).sort(), ['isActive', 'mrp', 'name', 'price', 'sku', 'stock']);
    assert.equal(data.stock, 4);
  });

  it('turns a null variant name or price into "leave it alone"', async () => {
    const { products, calls } = harness();
    await products.updateVariant('shop_a', VARIANT.id, {
      name: null,
      price: null,
      stock: null,
      sku: null,
    } as unknown as VariantPatch);

    const data = calls.variantUpdates[0] ?? {};
    assert.equal(data.name, undefined);
    assert.equal(data.price, undefined);
    assert.equal(data.stock, undefined);
    assert.equal(data.sku, null, 'sku is nullable — a null there is a real instruction');
  });
});

describe('stock delta', () => {
  it('clamps at zero rather than going negative', async () => {
    const { products, calls } = harness();
    await products.adjustStock('shop_a', PRODUCT.id, -100);

    assert.equal(calls.productUpdates[0]?.stock, 0);
  });

  it('refuses when the product does not track stock', async () => {
    const calls: Recorded = { productUpdates: [], variantUpdates: [], deletes: [] };
    const prisma = {
      product: {
        findUnique: () => Promise.resolve({ ...PRODUCT, trackStock: false }),
        update: ({ data }: { data: Record<string, unknown> }) => {
          calls.productUpdates.push(data);
          return Promise.resolve({});
        },
      },
    } as unknown as PrismaService;

    await assert.rejects(
      () =>
        new ProductsService(prisma, refusingUploads(), refusingStorage()).adjustStock(
          'shop_a',
          PRODUCT.id,
          5,
        ),
      BadRequestException,
    );
    assert.deepEqual(calls.productUpdates, []);
  });
});

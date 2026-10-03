import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AppConfig } from '../../config/configuration';
import {
  PRIVATE_PREFIX,
  PUBLIC_PREFIX,
  type StorageProvider,
  type StoredObject,
  isPublicKey,
} from '../../providers/storage.provider';
import { UploadsService } from '../uploads/uploads.service';
import type { UploadedFile } from '../uploads/uploaded-file';
import {
  PRODUCT_IMAGE_LIMIT,
  assertOwnedImage,
  assertPermutation,
  productImageSegments,
  resolveImageUrls,
} from './product-images';
import { ProductsService } from './products.service';

/**
 * The product-photo routes, and the rule they exist to enforce: **a client never
 * names a storage path.**
 *
 * `CreateProductDto` used to accept `images: string[]` — an unbounded list of
 * unvalidated strings written to a column the storefront and the cart render as
 * image sources. The DTO half of the fix is pinned in
 * `common/dto/request-validation.spec.ts`; this file pins the service half, which is
 * the part that has to hold even for a caller who has already been authorised:
 *
 * - the key is minted from ids the application holds, never from the filename;
 * - a mutation may only name a key this product already has;
 * - a reorder is a permutation, so it cannot double as an untracked delete;
 * - a foreign product is a 404 and touches neither the database nor storage.
 *
 * The uploads service here is the **real** one, wired to a recording storage
 * provider. That is deliberate: a double would let the key format drift away from
 * `buildPublicKey`, and the key format is the security property.
 */

/** The eight-byte PNG signature `sniffMime` looks for, plus filler. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(32, 7),
]);

/** A JPEG by its magic bytes, for the "declared type disagrees" case. */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32, 3)]);

function upload(partial: Partial<UploadedFile> = {}): UploadedFile {
  const buffer = partial.buffer ?? PNG;
  return {
    fieldname: 'file',
    originalname: 'photo.png',
    encoding: '7bit',
    mimetype: 'image/png',
    size: buffer.byteLength,
    buffer,
    ...partial,
  };
}

interface StorageLog {
  saved: { key: string; bytes: number; contentType?: string }[];
  removed: string[];
}

/**
 * A storage provider that records instead of writing, and refuses a public URL for a
 * non-public key exactly as both real providers do — that refusal is what
 * `resolveImageUrls` is written to survive.
 */
function recordingStorage(log: StorageLog): StorageProvider {
  return {
    name: 'recording',
    save: (key: string, data: Buffer, contentType?: string): Promise<StoredObject> => {
      log.saved.push({ key, bytes: data.byteLength, contentType });
      return Promise.resolve({ key, url: isPublicKey(key) ? `https://cdn.test/${key}` : null });
    },
    read: () => Promise.resolve(PNG),
    remove: (key: string) => {
      log.removed.push(key);
      return Promise.resolve();
    },
    publicUrl: (key: string) => {
      if (!isPublicKey(key)) throw new BadRequestException('not a public key');
      return `https://cdn.test/${key}`;
    },
  };
}

/** Only `uploads` is ever read off the config by `UploadsService`. */
function config(): ConfigService<AppConfig, true> {
  return {
    get: () => ({ maxImageBytes: 5 * 1024 * 1024, maxDocumentBytes: 10 * 1024 * 1024 }),
  } as unknown as ConfigService<AppConfig, true>;
}

interface ProductRow {
  id: string;
  shopId: string;
  trackStock: boolean;
  stock: number;
  images: string[];
}

interface PrismaLog {
  updates: { id: string; data: Record<string, unknown> }[];
  deletes: string[];
}

const OWN_KEYS = [
  `${PUBLIC_PREFIX}shops/shop_a/products/prod_1/aaaa.jpg`,
  `${PUBLIC_PREFIX}shops/shop_a/products/prod_1/bbbb.jpg`,
  `${PUBLIC_PREFIX}shops/shop_a/products/prod_1/cccc.jpg`,
] as const;

const FOREIGN_KEY = `${PUBLIC_PREFIX}shops/shop_b/products/prod_2/dddd.jpg`;

interface Harness {
  products: ProductsService;
  storage: StorageLog;
  db: PrismaLog;
}

/**
 * `prod_1` belongs to `shop_a`; `prod_2` belongs to `shop_b`. The fake records rather
 * than pretends: if a tenancy guard fails to throw, `update` is still reachable and
 * the assertion on `db.updates` says so.
 */
function harness(
  options: { images?: string[]; failUpdate?: boolean } = {},
): Harness {
  const storageLog: StorageLog = { saved: [], removed: [] };
  const db: PrismaLog = { updates: [], deletes: [] };

  const own: ProductRow = {
    id: 'prod_1',
    shopId: 'shop_a',
    trackStock: false,
    stock: 0,
    images: [...(options.images ?? [])],
  };
  const foreign: ProductRow = {
    id: 'prod_2',
    shopId: 'shop_b',
    trackStock: false,
    stock: 0,
    images: [FOREIGN_KEY],
  };
  const rows = [own, foreign];

  const prisma = {
    product: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(rows.find((r) => r.id === where.id) ?? null),
      update: ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        db.updates.push({ id: where.id, data });
        if (options.failUpdate) return Promise.reject(new Error('database is unavailable'));
        // Resolve Prisma's two array writes the way Postgres would: `{ push: key }`
        // appends, a bare array assigns. `Array.isArray` has to come first — an array
        // has a `push` method, so an `in` test alone matches both shapes.
        const write = data.images;
        const next = Array.isArray(write)
          ? (write as string[])
          : typeof write === 'object' && write !== null && 'push' in write
            ? [...own.images, (write as { push: string }).push]
            : own.images;
        return Promise.resolve({ ...own, images: next });
      },
      delete: ({ where }: { where: { id: string } }) => {
        db.deletes.push(where.id);
        return Promise.resolve(own);
      },
    },
  } as unknown as PrismaService;

  const storage = recordingStorage(storageLog);
  const uploads = new UploadsService(storage, config(), { name: 'disabled', scan: () => Promise.resolve(), ready: () => Promise.resolve(true) });
  return { products: new ProductsService(prisma, uploads, storage), storage: storageLog, db };
}

describe('product photos · the key is minted, never sent', () => {
  it('stores under public/shops/<shopId>/products/<productId>/<random>.<ext>', async () => {
    const { products, storage } = harness();
    await products.addImage('shop_a', 'prod_1', upload());

    const saved = storage.saved[0];
    assert.ok(saved, 'the bytes should have been stored');
    assert.match(
      saved.key,
      /^public\/shops\/shop_a\/products\/prod_1\/[0-9a-f]{32}\.png$/,
      `unexpected key: ${saved.key}`,
    );
    assert.equal(saved.bytes, PNG.byteLength);
    assert.equal(saved.contentType, 'image/png');
  });

  it('ignores the filename the client sent, including a traversal attempt', async () => {
    const { products, storage } = harness();
    await products.addImage(
      'shop_a',
      'prod_1',
      upload({ originalname: '../../../../etc/passwd.png' }),
    );

    const key = storage.saved[0]?.key ?? '';
    assert.match(key, /^public\/shops\/shop_a\/products\/prod_1\/[0-9a-f]{32}\.png$/);
    assert.equal(key.includes('..'), false);
    assert.equal(key.includes('passwd'), false);
  });

  it('takes the extension from the bytes, and canonicalises it', async () => {
    // `.jpeg` and `image/jpg` are both legitimate spellings a browser or a phone
    // produces, and both are accepted — but the key gets `jpg`, because the suffix
    // comes from `extensionFor(sniffMime(bytes))` and from nothing else.
    const { products, storage } = harness();
    await products.addImage(
      'shop_a',
      'prod_1',
      upload({ buffer: JPEG, mimetype: 'image/jpg', originalname: 'photo.jpeg' }),
    );

    assert.match(storage.saved[0]?.key ?? '', /\.jpg$/);
  });

  it('refuses a file whose declared type disagrees with its bytes, storing nothing', async () => {
    const { products, storage, db } = harness();
    await assert.rejects(
      () => products.addImage('shop_a', 'prod_1', upload({ mimetype: 'image/jpeg' })),
      BadRequestException,
    );
    assert.deepEqual(storage.saved, []);
    assert.deepEqual(db.updates, []);
  });

  it('refuses a PDF, which the document rules allow but the image rules do not', async () => {
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n', 'latin1'), Buffer.alloc(16)]);
    const { products, storage } = harness();
    await assert.rejects(
      () =>
        products.addImage(
          'shop_a',
          'prod_1',
          upload({ buffer: pdf, mimetype: 'application/pdf', originalname: 'scan.pdf' }),
        ),
      BadRequestException,
    );
    assert.deepEqual(storage.saved, []);
  });

  it('refuses a request with no file at all', async () => {
    const { products, storage } = harness();
    await assert.rejects(() => products.addImage('shop_a', 'prod_1', undefined), BadRequestException);
    assert.deepEqual(storage.saved, []);
  });

  it('appends rather than replaces, so the first photo stays the product’s face', async () => {
    const { products, db } = harness({ images: [...OWN_KEYS] });
    await products.addImage('shop_a', 'prod_1', upload());

    const data = db.updates[0]?.data ?? {};
    assert.deepEqual(Object.keys(data), ['images']);
    assert.ok(
      typeof data.images === 'object' && data.images !== null && 'push' in data.images,
      'the update must be an append, not an assignment',
    );
  });

  it(`refuses photo number ${PRODUCT_IMAGE_LIMIT + 1}, before storing the bytes`, async () => {
    const full = Array.from(
      { length: PRODUCT_IMAGE_LIMIT },
      (_, i) => `${PUBLIC_PREFIX}shops/shop_a/products/prod_1/${i}.jpg`,
    );
    const { products, storage, db } = harness({ images: full });

    await assert.rejects(
      () => products.addImage('shop_a', 'prod_1', upload()),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        assert.match(err.message, new RegExp(`already has ${PRODUCT_IMAGE_LIMIT} photos`));
        return true;
      },
    );
    assert.deepEqual(storage.saved, [], 'the ceiling must be checked before the write');
    assert.deepEqual(db.updates, []);
  });

  it('removes the orphan when the row update fails', async () => {
    // Bytes first, row second — a row pointing at an object that was never stored is
    // a broken photo in a shopper's catalogue. The cost of that order is an orphan,
    // and this is the cleanup that pays it.
    const { products, storage } = harness({ failUpdate: true });

    await assert.rejects(() => products.addImage('shop_a', 'prod_1', upload()));

    const key = storage.saved[0]?.key;
    assert.ok(key, 'the bytes were stored before the row was updated');
    assert.deepEqual(storage.removed, [key]);
  });
});

describe('product photos · a mutation may only name a key this product holds', () => {
  it('refuses to delete a key the product does not have', async () => {
    const { products, storage, db } = harness({ images: [...OWN_KEYS] });
    await assert.rejects(
      () => products.removeImage('shop_a', 'prod_1', `${PUBLIC_PREFIX}shops/shop_a/products/prod_1/zzzz.jpg`),
      BadRequestException,
    );
    assert.deepEqual(storage.removed, []);
    assert.deepEqual(db.updates, []);
  });

  it('refuses to delete another product’s key, even a well-formed one', async () => {
    const { products, storage } = harness({ images: [...OWN_KEYS] });
    await assert.rejects(() => products.removeImage('shop_a', 'prod_1', FOREIGN_KEY), BadRequestException);
    assert.deepEqual(storage.removed, []);
  });

  it('refuses a private key outright — it is not one of this product’s photos either', async () => {
    const { products, storage } = harness({ images: [...OWN_KEYS] });
    await assert.rejects(
      () => products.removeImage('shop_a', 'prod_1', `${PRIVATE_PREFIX}shop-applications/app_1/x.pdf`),
      BadRequestException,
    );
    assert.deepEqual(storage.removed, []);
  });

  it('deletes the object and rewrites the array when the key is owned', async () => {
    const { products, storage, db } = harness({ images: [...OWN_KEYS] });
    await products.removeImage('shop_a', 'prod_1', OWN_KEYS[1]);

    assert.deepEqual(db.updates[0]?.data.images, [OWN_KEYS[0], OWN_KEYS[2]]);
    assert.deepEqual(storage.removed, [OWN_KEYS[1]]);
  });

  it('deletes the row’s objects when the product itself is deleted', async () => {
    const { products, storage, db } = harness({ images: [...OWN_KEYS] });
    await products.remove('shop_a', 'prod_1');

    assert.deepEqual(db.deletes, ['prod_1']);
    assert.deepEqual(storage.removed.sort(), [...OWN_KEYS].sort());
  });

  it('does not let a flaky storage provider fail a successful edit', async () => {
    // `forgetImages` swallows failures on purpose: the row is already correct, and a
    // stray object in public/ is a cleanup job's problem, not the shopkeeper's.
    const db: PrismaLog = { updates: [], deletes: [] };
    const row: ProductRow = {
      id: 'prod_1',
      shopId: 'shop_a',
      trackStock: false,
      stock: 0,
      images: [OWN_KEYS[0]],
    };
    const prisma = {
      product: {
        findUnique: () => Promise.resolve(row),
        update: ({ data }: { data: Record<string, unknown> }) => {
          db.updates.push({ id: row.id, data });
          return Promise.resolve({ ...row, images: [] });
        },
      },
    } as unknown as PrismaService;

    const storage: StorageProvider = {
      name: 'broken',
      save: () => Promise.reject(new Error('down')),
      read: () => Promise.reject(new Error('down')),
      remove: () => Promise.reject(new Error('down')),
      publicUrl: (key: string) => `https://cdn.test/${key}`,
    };
    const products = new ProductsService(prisma, new UploadsService(storage, config(), { name: 'disabled', scan: () => Promise.resolve(), ready: () => Promise.resolve(true) }), storage);

    const result = await products.removeImage('shop_a', 'prod_1', OWN_KEYS[0]);
    assert.deepEqual(result.images, []);
    assert.equal(db.updates.length, 1);
  });
});

describe('product photos · a reorder is a permutation, not an assignment', () => {
  it('accepts a genuine rearrangement', async () => {
    const { products, db } = harness({ images: [...OWN_KEYS] });
    const next = [OWN_KEYS[2], OWN_KEYS[0], OWN_KEYS[1]];
    await products.reorderImages('shop_a', 'prod_1', next);

    assert.deepEqual(db.updates[0]?.data.images, next);
  });

  it('refuses a short list, which would be an untracked delete', async () => {
    const { products, db, storage } = harness({ images: [...OWN_KEYS] });
    await assert.rejects(
      () => products.reorderImages('shop_a', 'prod_1', [OWN_KEYS[0], OWN_KEYS[1]]),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        assert.match(err.message, /Send all 3 photo keys/);
        assert.match(err.message, /use DELETE to remove one/);
        return true;
      },
    );
    assert.deepEqual(db.updates, []);
    assert.deepEqual(storage.removed, [], 'nothing may be orphaned by a refused reorder');
  });

  it('refuses a longer list too, so a key cannot be added this way', async () => {
    const { products, db } = harness({ images: [...OWN_KEYS] });
    await assert.rejects(
      () => products.reorderImages('shop_a', 'prod_1', [...OWN_KEYS, 'https://evil.example/x.jpg']),
      BadRequestException,
    );
    assert.deepEqual(db.updates, []);
  });

  it('refuses the same key twice, even at the right length', async () => {
    const { products, db } = harness({ images: [...OWN_KEYS] });
    await assert.rejects(
      () => products.reorderImages('shop_a', 'prod_1', [OWN_KEYS[0], OWN_KEYS[0], OWN_KEYS[1]]),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        assert.match(err.message, /sent twice/);
        return true;
      },
    );
    assert.deepEqual(db.updates, []);
  });

  it('refuses a foreign key swapped in at the right length', async () => {
    const { products, db } = harness({ images: [...OWN_KEYS] });
    await assert.rejects(
      () => products.reorderImages('shop_a', 'prod_1', [OWN_KEYS[0], OWN_KEYS[1], FOREIGN_KEY]),
      BadRequestException,
    );
    assert.deepEqual(db.updates, []);
  });
});

describe('product photos · cross-shop access is a 404 that touches nothing', () => {
  it('refuses to upload to another shop’s product', async () => {
    const { products, storage, db } = harness();
    await assert.rejects(
      () => products.addImage('shop_a', 'prod_2', upload()),
      (err: unknown) => {
        assert.ok(err instanceof NotFoundException, `expected a 404, got ${String(err)}`);
        assert.equal(err.message, 'Product not found');
        return true;
      },
    );
    assert.deepEqual(storage.saved, [], 'no bytes may be written for a foreign product');
    assert.deepEqual(db.updates, []);
  });

  it('refuses to delete another shop’s photo', async () => {
    const { products, storage, db } = harness();
    await assert.rejects(
      () => products.removeImage('shop_a', 'prod_2', FOREIGN_KEY),
      (err: unknown) => {
        assert.ok(err instanceof NotFoundException);
        assert.equal(err.message, 'Product not found');
        return true;
      },
    );
    assert.deepEqual(storage.removed, []);
    assert.deepEqual(db.updates, []);
  });

  it('refuses to reorder another shop’s photos', async () => {
    const { products, db } = harness();
    await assert.rejects(
      () => products.reorderImages('shop_a', 'prod_2', [FOREIGN_KEY]),
      NotFoundException,
    );
    assert.deepEqual(db.updates, []);
  });

  it('gives the identical answer for a product that does not exist', async () => {
    // A different message would be an existence oracle over other shops' catalogues.
    const { products } = harness();
    await assert.rejects(
      () => products.addImage('shop_a', 'prod_nope', upload()),
      (err: unknown) => {
        assert.ok(err instanceof NotFoundException);
        assert.equal(err.message, 'Product not found');
        return true;
      },
    );
  });
});

describe('reads carry both the keys and the resolved URLs', () => {
  it('resolves in order and leaves the keys intact', async () => {
    const { products } = harness({ images: [...OWN_KEYS] });
    const result = await products.reorderImages('shop_a', 'prod_1', [...OWN_KEYS]);

    assert.deepEqual(result.images, [...OWN_KEYS]);
    assert.deepEqual(
      result.imageUrls,
      OWN_KEYS.map((k) => `https://cdn.test/${k}`),
      'imageUrls must line up with images, index for index',
    );
  });

  it('skips a key that is not public instead of failing the whole read', () => {
    // One unrenderable row must not turn a catalogue page into a 400.
    const log: StorageLog = { saved: [], removed: [] };
    const storage = recordingStorage(log);
    const urls = resolveImageUrls(storage, [
      OWN_KEYS[0],
      `${PRIVATE_PREFIX}shop-applications/app_1/x.pdf`,
      'shops/legacy/no-prefix.jpg',
      OWN_KEYS[1],
    ]);

    assert.deepEqual(urls, [`https://cdn.test/${OWN_KEYS[0]}`, `https://cdn.test/${OWN_KEYS[1]}`]);
  });
});

describe('the key-path helpers on their own', () => {
  it('builds segments from ids only', () => {
    assert.deepEqual(productImageSegments('shop_a', 'prod_1'), [
      'shops',
      'shop_a',
      'products',
      'prod_1',
    ]);
  });

  it('assertOwnedImage says the same thing for a foreign key and a nonsense one', () => {
    const message = 'That is not one of this product’s photos';
    for (const key of [FOREIGN_KEY, 'not-a-key', '', '../../etc/passwd']) {
      assert.throws(
        () => assertOwnedImage([...OWN_KEYS], key),
        (err: unknown) => {
          assert.ok(err instanceof BadRequestException);
          assert.equal(err.message, message);
          return true;
        },
      );
    }
  });

  it('assertPermutation accepts the identity and every rotation', () => {
    assertPermutation([...OWN_KEYS], [...OWN_KEYS]);
    assertPermutation([...OWN_KEYS], [OWN_KEYS[1], OWN_KEYS[2], OWN_KEYS[0]]);
    assertPermutation([], []);
  });

  it('assertPermutation uses the singular for a one-photo product', () => {
    assert.throws(
      () => assertPermutation([OWN_KEYS[0]], []),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        assert.match(err.message, /Send all 1 photo key in the new order/);
        return true;
      },
    );
  });
});

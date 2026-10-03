import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { paginate, type PaginationDto } from '../../common/dto/pagination.dto';
import { STORAGE_PROVIDER, type StorageProvider } from '../../providers/storage.provider';
import { UploadsService } from '../uploads/uploads.service';
import type { UploadedFile } from '../uploads/uploaded-file';
import {
  PRODUCT_IMAGE_LIMIT,
  assertOwnedImage,
  assertPermutation,
  productImageSegments,
  withImageUrls,
  withImageUrlsAll,
} from './product-images';
import {
  NO_CATEGORY,
  type ListShopProductsQueryDto,
  type ProductSort,
  type ProductStockFilter,
} from './dto/catalog.dto';
import {
  DELIVERABLE_PRODUCT_WHERE,
  STOREFRONT_SHOP_WHERE,
} from './storefront-eligibility';

export interface ProductInput {
  name: string;
  nameNp?: string;
  description?: string;
  categoryId?: string;
  price: number;
  mrp?: number;
  unit?: string;
  tags?: string[];
  trackStock?: boolean;
  stock?: number;
}
export interface VariantInput {
  name: string;
  sku?: string;
  price: number;
  mrp?: number;
  stock?: number;
}

export type ProductPatch = Partial<ProductInput> & { isActive?: boolean };
export type VariantPatch = Partial<VariantInput> & { isActive?: boolean };

/**
 * `null` on a column the schema declares non-nullable means "leave it alone".
 *
 * `@IsOptional()` in class-validator skips validation for `null` as well as
 * `undefined`, so `PATCH { "name": null }` clears every validator and arrives here
 * intact. Passed on, `data: { name: null }` makes Prisma throw a client validation
 * error — a 500 before `AllExceptionsFilter` learned to answer those with a 400, and
 * a request a client could still break by sending a JSON null either way. Nullable
 * columns (`nameNp`, `description`, `categoryId`, `mrp`, `sku`) are not routed
 * through this: for them `null` is the legitimate way to clear a value.
 */
function keep<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

/**
 * The columns a product PATCH may touch, and only those.
 *
 * `ValidationPipe` already runs `whitelist + forbidNonWhitelisted` against
 * `UpdateProductDto`, so an unexpected key is a 400 long before this. This is the
 * second wall: the update sinks used to spread the request object straight into
 * `prisma.product.update({ data })`, which is safe exactly as long as every caller
 * is a validated DTO — and one route already lost that property once by being typed
 * `Partial<VariantDto>`. Projecting by hand means a bypass upstream can no longer
 * choose which columns to write.
 *
 * A key that is absent stays absent (Prisma leaves the column alone); a key that is
 * explicitly `undefined` behaves the same. Nothing here invents a default, because a
 * PATCH that says nothing about `unit` must not silently reset it.
 *
 * **`images` is not in this list and must not be added.** It is written only by the
 * three image routes, which mint their own keys and validate membership before
 * touching the array; a PATCH-able `images` is how a client names a storage path.
 */
function productData(input: ProductPatch) {
  return {
    name: keep(input.name),
    nameNp: input.nameNp,
    description: input.description,
    categoryId: input.categoryId,
    price: keep(input.price),
    mrp: input.mrp,
    unit: keep(input.unit),
    tags: keep(input.tags),
    trackStock: keep(input.trackStock),
    stock: keep(input.stock),
    isActive: keep(input.isActive),
  };
}

/**
 * The columns a variant PATCH may touch. `stock` is absolute here — the signed-delta
 * route is product-level and lives at `POST products/:id/stock`.
 */
function variantData(input: VariantPatch) {
  return {
    name: keep(input.name),
    sku: input.sku,
    price: keep(input.price),
    mrp: input.mrp,
    stock: keep(input.stock),
    isActive: keep(input.isActive),
  };
}

/**
 * Free-text search over the fields a shop actually typed.
 *
 * Covers the product's own two names, its unit, its category's English name and its
 * variants' names and SKUs — which is the set the console's search box used to filter
 * on in the browser, so moving it to SQL does not narrow what a seller can find.
 *
 * `tags` is a Postgres `text[]`, and `has` is exact: there is no case-insensitive
 * substring match over an array element in Prisma. Both the term as typed and its
 * lower-cased form are tried, which catches the ordinary case (tags are entered
 * lower-case) without pretending to be a substring match.
 */
function productSearch(q: string | undefined): Prisma.ProductWhereInput | undefined {
  const term = q?.trim();
  if (!term) return undefined;
  const like = { contains: term, mode: 'insensitive' as const };
  return {
    OR: [
      { name: like },
      { nameNp: like },
      { unit: like },
      { tags: { hasSome: [term, term.toLowerCase()] } },
      { category: { en: like } },
      { variants: { some: { OR: [{ name: like }, { sku: like }] } } },
    ],
  };
}

/**
 * `stock` as the two columns allow it to be read.
 *
 * `untracked` is deliberately not folded into `out`: a product with `trackStock: false`
 * is one the shop declined to count, not one it has none of. `<= 0` rather than `=== 0`
 * because a concurrent oversell could in principle land below zero, and such a row is
 * exactly what the seller filtering for "none left" needs to see.
 */
function stockFilter(stock: ProductStockFilter | undefined): Prisma.ProductWhereInput | undefined {
  if (stock === 'in') return { trackStock: true, stock: { gt: 0 } };
  if (stock === 'out') return { trackStock: true, stock: { lte: 0 } };
  if (stock === 'untracked') return { trackStock: false };
  return undefined;
}

/**
 * `updatedAt desc` stays the default: the seller list is a work surface, and the thing
 * you just touched belongs at the top. Every ordering ends with `id` so a page boundary
 * cannot show the same row twice or skip one when two rows tie.
 */
function productOrder(sort: ProductSort | undefined): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case 'name':
      return [{ name: 'asc' }, { id: 'asc' }];
    case 'price_asc':
      return [{ price: 'asc' }, { id: 'asc' }];
    case 'price_desc':
      return [{ price: 'desc' }, { id: 'asc' }];
    case 'stock_asc':
      return [{ stock: 'asc' }, { id: 'asc' }];
    default:
      return [{ updatedAt: 'desc' }, { id: 'asc' }];
  }
}

/**
 * The counts the catalogue and inventory screens put in their stat cards.
 *
 * Deliberately computed over the *whole shop*, ignoring `q`, `status`, `stock` and
 * `categoryId`, for the same reason the order queue's summary does: a seller who types
 * in the search box is narrowing the list, not asking how many products they have. If
 * these moved with the filter, "Out of stock: 0" would be true of the search and read
 * as true of the shop.
 *
 * There is no `lowStock`. `Product` has `stock` and `trackStock` and no threshold.
 */
export interface CatalogSummary {
  total: number;
  active: number;
  hidden: number;
  /** Tracked and at or below zero. */
  outOfStock: number;
  /** `trackStock: false` — the shop holds no count, which is not the same as none. */
  untracked: number;
  /**
   * The categories this shop's catalogue actually uses, with a row count each.
   * `categoryId: null` is the uncategorised bucket.
   *
   * Shop-wide for the same reason the counts are. The console renders these as filter
   * chips, and chips derived from the *filtered* page would vanish as soon as one was
   * clicked — a filter UI that deletes its own alternatives. The platform-wide
   * `GET /categories` list is not a substitute either: most of it would match nothing
   * in this shop.
   */
  categories: { categoryId: string | null; count: number }[];
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  // ── public ───────────────────────────────────────────────────────────
  async listByShop(shopId: string, pagination: PaginationDto, categoryId?: string) {
    const where: Prisma.ProductWhereInput = {
      shopId,
      ...DELIVERABLE_PRODUCT_WHERE,
      ...(categoryId ? { categoryId } : {}),
      ...(pagination.q ? { name: { contains: pagination.q, mode: 'insensitive' as const } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { createdAt: 'desc' },
        include: { variants: { where: { isActive: true } } },
      }),
      this.prisma.product.count({ where }),
    ]);
    return paginate(withImageUrlsAll(this.storage, rows), total, pagination.page, pagination.limit);
  }

  async get(productId: string) {
    const p = await this.prisma.product.findFirst({
      where: {
        id: productId,
        ...DELIVERABLE_PRODUCT_WHERE,
        shop: STOREFRONT_SHOP_WHERE,
      },
      include: { variants: { where: { isActive: true } }, shop: { select: { id: true, name: true, slug: true } } },
    });
    if (!p) throw new NotFoundException('Product not found');
    return withImageUrls(this.storage, p);
  }

  // ── shop-scoped management (RBAC enforced at controller) ──────────────
  /**
   * The seller catalogue list: paged, searched and filtered in SQL, with a summary that
   * describes the shop rather than the page.
   *
   * `where` is built so the `(shopId, isActive)` composite index is usable: `shopId` is
   * always the leftmost term, and a `status` filter contributes the second. The four
   * summary counts each hit the same index.
   */
  async listForShop(shopId: string, query: ListShopProductsQueryDto) {
    const where: Prisma.ProductWhereInput = {
      shopId,
      ...(query.status === 'active' ? { isActive: true } : {}),
      ...(query.status === 'hidden' ? { isActive: false } : {}),
      ...(query.categoryId === NO_CATEGORY
        ? { categoryId: null }
        : query.categoryId
          ? { categoryId: query.categoryId }
          : {}),
      ...(stockFilter(query.stock) ?? {}),
      ...(productSearch(query.q) ?? {}),
    };

    const [rows, total, summary] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: productOrder(query.sort),
        include: { variants: true },
      }),
      this.prisma.product.count({ where }),
      this.catalogSummary(shopId),
    ]);
    return {
      ...paginate(withImageUrlsAll(this.storage, rows), total, query.page, query.limit),
      summary,
    };
  }

  /** Four counts and a category roll-up over one shop, unaffected by any list filter. */
  private async catalogSummary(shopId: string): Promise<CatalogSummary> {
    const [total, active, outOfStock, untracked, byCategory] = await Promise.all([
      this.prisma.product.count({ where: { shopId } }),
      this.prisma.product.count({ where: { shopId, isActive: true } }),
      this.prisma.product.count({ where: { shopId, trackStock: true, stock: { lte: 0 } } }),
      this.prisma.product.count({ where: { shopId, trackStock: false } }),
      this.prisma.product.groupBy({
        by: ['categoryId'],
        where: { shopId },
        _count: { _all: true },
      }),
    ]);
    return {
      total,
      active,
      hidden: total - active,
      outOfStock,
      untracked,
      categories: byCategory
        .map((g) => ({ categoryId: g.categoryId, count: g._count._all }))
        // Stable order so the chip row does not reshuffle between reads. The console
        // sorts by label; this only has to be deterministic.
        .sort((a, b) => (a.categoryId ?? '').localeCompare(b.categoryId ?? '')),
    };
  }

  /**
   * A new product, always with no photos.
   *
   * `images` is not settable here and is not in `ProductInput`: the column starts
   * as the schema's `@default([])` and only the image routes below ever write it.
   * A shopkeeper creates the row, then uploads to it.
   */
  async create(shopId: string, input: ProductInput) {
    const created = await this.prisma.product.create({
      data: {
        shopId,
        name: input.name,
        nameNp: input.nameNp,
        description: input.description,
        categoryId: input.categoryId,
        price: input.price,
        mrp: input.mrp,
        unit: input.unit ?? '1 pc',
        tags: input.tags ?? [],
        trackStock: input.trackStock ?? false,
        stock: input.stock ?? 0,
      },
    });
    return withImageUrls(this.storage, created);
  }

  async update(shopId: string, productId: string, input: ProductPatch) {
    await this.mustBelong(shopId, productId);
    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: productData(input),
    });
    return withImageUrls(this.storage, updated);
  }

  /**
   * Delete the row, and the photos with it.
   *
   * The objects go after the row, not before: if the delete fails the bytes are
   * still there to match the row that still exists. The reverse order can leave a
   * product pointing at keys that resolve to nothing, which reads to a shopkeeper
   * as data loss rather than as a failed request.
   */
  async remove(shopId: string, productId: string) {
    const product = await this.mustBelong(shopId, productId);
    await this.prisma.product.delete({ where: { id: productId } });
    await this.forgetImages(product.images);
    return { deleted: true };
  }

  async adjustStock(shopId: string, productId: string, delta: number) {
    const p = await this.mustBelong(shopId, productId);
    if (!p.trackStock) throw new BadRequestException('Stock tracking is off for this product');
    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { stock: Math.max(0, p.stock + delta) },
    });
    return withImageUrls(this.storage, updated);
  }

  // ── photos ───────────────────────────────────────────────────────────
  /**
   * Store an uploaded image and append its key to this product.
   *
   * Order of operations matters and is the opposite of `remove`: the bytes are
   * stored first, then the row is updated. A stored object that no row references
   * is a wasted key; a row that references an object which was never stored is a
   * broken photo in a shopper's catalogue. If the update throws, the orphan is
   * cleaned up on the way out — best-effort, because the row is what is correct.
   *
   * The key comes from `UploadsService`, which builds it from `productImageSegments`
   * plus 128 random bits. Nothing the client sent — not the filename, not a form
   * field — reaches the path. The file itself is checked by the same three-fact
   * MIME test the KYC uploads use, against the `image` purpose, so a PDF or a
   * renamed executable is refused before a byte is written.
   */
  async addImage(shopId: string, productId: string, file: UploadedFile | undefined) {
    const product = await this.mustBelong(shopId, productId);
    if (product.images.length >= PRODUCT_IMAGE_LIMIT) {
      throw new BadRequestException(
        `This product already has ${PRODUCT_IMAGE_LIMIT} photos. Remove one first.`,
      );
    }

    const stored = await this.uploads.storePublicImage(
      productImageSegments(shopId, productId),
      file,
    );
    try {
      const updated = await this.prisma.product.update({
        where: { id: productId },
        data: { images: { push: stored.key } },
      });
      return withImageUrls(this.storage, updated);
    } catch (err) {
      await this.uploads.remove(stored.key).catch(() => undefined);
      throw err;
    }
  }

  /**
   * Drop one photo: out of the array, then out of storage.
   *
   * `assertOwnedImage` is the whole authorisation story for the key. The caller
   * has already been proved a member of this shop with `catalog.edit`, and the key
   * has to be one this product holds — so there is no reachable combination of
   * inputs that deletes an object belonging to anything else, whatever string is
   * sent.
   */
  async removeImage(shopId: string, productId: string, key: string) {
    const product = await this.mustBelong(shopId, productId);
    assertOwnedImage(product.images, key);

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { images: product.images.filter((k) => k !== key) },
    });
    await this.forgetImages([key]);
    return withImageUrls(this.storage, updated);
  }

  /**
   * Rearrange the photos. The first one is the product's face, everywhere it is
   * shown, so the order is a real editorial decision and not decoration.
   */
  async reorderImages(shopId: string, productId: string, keys: string[]) {
    const product = await this.mustBelong(shopId, productId);
    assertPermutation(product.images, keys);
    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: { images: keys },
    });
    return withImageUrls(this.storage, updated);
  }

  /**
   * Best-effort removal of objects no row points at any more.
   *
   * Failures are swallowed on purpose: the row is already correct, and a storage
   * provider that is briefly unreachable must not turn a successful edit into a
   * 503. The cost of the miss is a stray object in `public/`, which is a cleanup
   * job's problem, not the shopkeeper's.
   */
  private async forgetImages(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => this.uploads.remove(key).catch(() => undefined)));
  }

  // ── variants ─────────────────────────────────────────────────────────
  async addVariant(shopId: string, productId: string, input: VariantInput) {
    await this.mustBelong(shopId, productId);
    return this.prisma.productVariant.create({
      data: { productId, name: input.name, sku: input.sku, price: input.price, mrp: input.mrp, stock: input.stock ?? 0 },
    });
  }

  async updateVariant(shopId: string, variantId: string, input: VariantPatch) {
    await this.mustOwnVariant(shopId, variantId);
    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: variantData(input),
    });
  }

  async removeVariant(shopId: string, variantId: string) {
    await this.mustOwnVariant(shopId, variantId);
    await this.prisma.productVariant.delete({ where: { id: variantId } });
    return { deleted: true };
  }

  // ── guards ───────────────────────────────────────────────────────────
  /**
   * The row must exist *and* belong to this shop, and a caller who fails either test
   * is told the same thing.
   *
   * These used to answer `400 "Product belongs to another shop"`, which is a working
   * existence oracle: a seller with one shop could walk product ids and learn, from
   * the difference between that 400 and a 404, exactly which ids are real rows in
   * somebody else's catalogue. Membership in *this* shop is what the guard checked,
   * so the leak was not an authorisation hole — but a competitor's catalogue size and
   * id space are not this shop's business, and the caller has nothing useful to do
   * with the distinction. Both branches are now `404 "Product not found"`: from the
   * caller's position that is also the truth, because within their shop it is not there.
   */
  private async mustBelong(shopId: string, productId: string) {
    const p = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!p || p.shopId !== shopId) throw new NotFoundException('Product not found');
    return p;
  }
  private async mustOwnVariant(shopId: string, variantId: string) {
    const v = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: { select: { shopId: true } } },
    });
    if (!v || v.product.shopId !== shopId) throw new NotFoundException('Variant not found');
    return v;
  }
}

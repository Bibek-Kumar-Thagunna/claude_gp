import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../../providers/storage.provider';
import { resolveImageUrls } from '../catalog/product-images';

/**
 * The one shape a cart is ever loaded in. Declared once, `satisfies`-checked
 * against Prisma's own include type, and then used both as the query argument
 * and as the source of the row types below — so the payload the database
 * returns and the payload this service claims to hold cannot drift apart.
 */
const CART_INCLUDE = {
  shop: {
    select: {
      id: true,
      name: true,
      slug: true,
      minOrder: true,
      isOpen: true,
      deliveryRadiusKm: true,
      lat: true,
      lng: true,
    },
  },
  items: {
    include: {
      product: { include: { variants: true } },
      variant: true,
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.CartInclude;

type CartWithItems = Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>;
type CartItemRow = CartWithItems['items'][number];

/**
 * Server-side cart so it survives across devices/refresh. Enforces the
 * single-shop rule: a cart holds items from exactly one shop; adding an item
 * from a different shop clears the cart first (the UI confirms before calling).
 */
@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** Fetch (or lazily create) the user's cart, hydrated with live prices + totals. */
  async get(userId: string) {
    const cart = await this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      include: this.itemInclude(),
    });
    return this.decorate(cart);
  }

  async addItem(userId: string, input: { productId: string; variantId?: string | null; qty?: number }) {
    const qty = Math.max(1, input.qty ?? 1);
    const product = await this.prisma.product.findUnique({
      where: { id: input.productId },
      include: { variants: true, shop: { select: { id: true, status: true, isOpen: true } } },
    });
    if (!product || !product.isActive) throw new NotFoundException('Product not available');
    if (product.shop.status !== 'ACTIVE') throw new BadRequestException('Shop is not active');

    // validate variant belongs to product
    let variantId: string | null = null;
    if (input.variantId) {
      const v = product.variants.find((x) => x.id === input.variantId && x.isActive);
      if (!v) throw new BadRequestException('Invalid variant');
      variantId = v.id;
    } else if (product.variants.some((v) => v.isActive)) {
      throw new BadRequestException('Please choose a variant');
    }

    const cart = await this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    // single-shop rule — switching shops empties the cart
    if (cart.shopId && cart.shopId !== product.shop.id) {
      await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }
    if (cart.shopId !== product.shop.id) {
      await this.prisma.cart.update({ where: { id: cart.id }, data: { shopId: product.shop.id } });
    }

    // Postgres treats NULLs as distinct, so @@unique([cartId, productId, variantId])
    // does not actually dedupe variant-less products — an upsert against that key
    // would happily create a second row for the same product, and Prisma types the
    // nullable member as non-null so it would not even compile. Resolve the row
    // ourselves: correct for both the variant and the no-variant case.
    const existing = await this.prisma.cartItem.findFirst({
      where: { cartId: cart.id, productId: product.id, variantId },
    });
    const nextQty = (existing?.qty ?? 0) + qty;
    this.assertStock(product, variantId, nextQty);

    if (existing) {
      await this.prisma.cartItem.update({ where: { id: existing.id }, data: { qty: nextQty } });
    } else {
      await this.prisma.cartItem.create({
        data: { cartId: cart.id, productId: product.id, variantId, qty },
      });
    }

    return this.get(userId);
  }

  async setQty(userId: string, itemId: string, qty: number) {
    const cart = await this.requireCart(userId);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Item not in cart');
    if (qty <= 0) {
      await this.prisma.cartItem.delete({ where: { id: itemId } });
    } else {
      this.assertStock(item.product, item.variantId, qty);
      await this.prisma.cartItem.update({ where: { id: itemId }, data: { qty } });
    }
    await this.clearShopIfEmpty(cart.id);
    return this.get(userId);
  }

  async removeItem(userId: string, itemId: string) {
    const cart = await this.requireCart(userId);
    if (!cart.items.some((i) => i.id === itemId)) throw new NotFoundException('Item not in cart');
    await this.prisma.cartItem.delete({ where: { id: itemId } });
    await this.clearShopIfEmpty(cart.id);
    return this.get(userId);
  }

  async clear(userId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (cart) {
      await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
      await this.prisma.cart.update({ where: { id: cart.id }, data: { shopId: null } });
    }
    return this.get(userId);
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private itemInclude() {
    return CART_INCLUDE;
  }

  private async requireCart(userId: string) {
    const cart = await this.prisma.cart.findUnique({ where: { userId }, include: this.itemInclude() });
    if (!cart) throw new NotFoundException('Cart is empty');
    return cart;
  }

  /** Resolve current unit price for an item (variant price wins over base price). */
  private unitPrice(item: { product: { price: number }; variant: { price: number } | null }): number {
    return item.variant?.price ?? item.product.price;
  }

  private assertStock(
    product: { trackStock: boolean; stock: number; variants: { id: string; stock: number }[] },
    variantId: string | null,
    wantQty: number,
  ) {
    if (variantId) {
      const v = product.variants.find((x) => x.id === variantId);
      if (v && v.stock < wantQty) throw new BadRequestException(`Only ${v.stock} left in stock`);
    } else if (product.trackStock && product.stock < wantQty) {
      throw new BadRequestException(`Only ${product.stock} left in stock`);
    }
  }

  private async clearShopIfEmpty(cartId: string) {
    const count = await this.prisma.cartItem.count({ where: { cartId } });
    if (count === 0) await this.prisma.cart.update({ where: { id: cartId }, data: { shopId: null } });
  }

  private decorate(cart: CartWithItems) {
    const items = cart.items.map((it: CartItemRow) => {
      const unitPrice = this.unitPrice(it);
      return {
        id: it.id,
        productId: it.productId,
        variantId: it.variantId,
        name: it.product.name,
        variantName: it.variant?.name ?? null,
        unit: it.variant?.name ?? it.product.unit,
        // `Product.images` holds storage keys, not URLs — see
        // catalog/product-images.ts. A cart line is rendered directly, so the
        // first key is resolved here rather than handed to the client raw.
        image: resolveImageUrls(this.storage, it.product.images)[0] ?? null,
        unitPrice,
        qty: it.qty,
        lineTotal: unitPrice * it.qty,
      };
    });
    const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
    const itemCount = items.reduce((s, i) => s + i.qty, 0);
    const minOrder = cart.shop?.minOrder ?? 0;
    return {
      id: cart.id,
      shop: cart.shop,
      items,
      itemCount,
      subtotal,
      minOrder,
      meetsMinOrder: subtotal >= minOrder,
      updatedAt: cart.updatedAt,
    };
  }
}

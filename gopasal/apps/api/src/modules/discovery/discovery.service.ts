import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../../common/prisma/prisma.service";
import { computeDeliveryFee } from "../../common/delivery-fee";
import { estimateDurationSeconds, haversineMeters, pointInPolygon, type GeoPoint } from "../../providers/geo";
import { MAP_PROVIDER, type MapProvider } from "../../providers/map.provider";
import { STORAGE_PROVIDER, type StorageProvider } from "../../providers/storage.provider";
import { withImageUrlsAll } from "../catalog/product-images";
import {
  DELIVERABLE_PRODUCT_WHERE,
  STOREFRONT_SHOP_WHERE,
} from "../catalog/storefront-eligibility";

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(MAP_PROVIDER) private readonly maps: MapProvider,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** Active shops within `radiusKm` of the point (exploration), nearest first. */
  async shopsNear(point: GeoPoint, radiusKm = 5) {
    const near = await this.prisma.shopsWithinMeters(point, radiusKm * 1000);
    return this.hydrate(near);
  }

  /** Shops that actually deliver to the point (their own radius covers it). */
  async shopsDeliveringTo(point: GeoPoint) {
    const covering = await this.serviceableRows(point);
    return this.hydrate(covering);
  }

  /**
   * One location-qualified payload for the customer homepage. Keeping the
   * grouping on the server avoids an N+1 request per shop and guarantees every
   * shelf is built only from stores that can serve the selected destination.
   */
  async home(point: GeoPoint) {
    const rows = await this.serviceableRows(point);
    const shops = await this.hydrate(rows);
    const distanceByShop = new Map(rows.map((row) => [row.id, Math.round(row.distance)]));
    const shopIds = shops.map((shop) => shop.id);
    if (shopIds.length === 0) return { location: point, shops: [], shelves: [] };

    const products = await this.prisma.product.findMany({
      where: { shopId: { in: shopIds }, ...DELIVERABLE_PRODUCT_WHERE },
      take: 180,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      include: {
        category: true,
        variants: { where: { isActive: true } },
        shop: {
          select: {
            id: true,
            slug: true,
            name: true,
            nameNp: true,
            categoryId: true,
            category: true,
            area: true,
            ratingAvg: true,
            ratingCount: true,
            isOpen: true,
            hours: true,
            emoji: true,
            verified: true,
            minOrder: true,
            phone: true,
            deliveryRadiusKm: true,
          },
        },
        _count: { select: { orderItems: true } },
      },
    });

    const ranked = withImageUrlsAll(this.storage, products).sort((a, b) => {
      if (a.shop.isOpen !== b.shop.isOpen) return a.shop.isOpen ? -1 : 1;
      if (a._count.orderItems !== b._count.orderItems)
        return b._count.orderItems - a._count.orderItems;
      return (
        (distanceByShop.get(a.shopId) ?? Number.MAX_SAFE_INTEGER) -
        (distanceByShop.get(b.shopId) ?? Number.MAX_SAFE_INTEGER)
      );
    });

    const shelfMap = new Map<
      string,
      {
        category: { id: string; slug: string; en: string; np: string; icon: string; hue: string };
        products: unknown[];
      }
    >();
    for (const product of ranked) {
      const category = product.category ?? product.shop.category;
      if (!category) continue;
      const shelf = shelfMap.get(category.id) ?? { category, products: [] };
      if (shelf.products.length < 10) {
        shelf.products.push({
          ...product,
          distanceMeters: distanceByShop.get(product.shopId) ?? null,
        });
      }
      shelfMap.set(category.id, shelf);
    }

    return {
      location: point,
      shops: shops.slice(0, 12),
      shelves: [...shelfMap.values()].filter((shelf) => shelf.products.length > 0).slice(0, 8),
    };
  }

  /**
   * Can `shop` deliver to `point`? Returns distance, ETA and the fee — the
   * customer app calls this before checkout to show "delivers to you • Rs X".
   */
  async deliveryCheck(shopId: string, point: GeoPoint) {
    const shop = await this.prisma.shop.findUnique({
      where: { id: shopId },
      include: { zones: true },
    });
    if (!shop) throw new NotFoundException("Shop not found");
    if (shop.lat == null || shop.lng == null) {
      return { deliverable: false, reason: "Shop location not set" as const };
    }

    const origin: GeoPoint = { lat: shop.lat, lng: shop.lng };
    const distanceMeters = haversineMeters(origin, point);
    const withinRadius = distanceMeters <= shop.deliveryRadiusKm * 1000;

    // custom polygon zones (if any) can extend/override the radius + set a fee
    let zoneOverride: number | null = null;
    let zoneMatched = false;
    for (const z of shop.zones) {
      const ring = (z.polygon as unknown as GeoPoint[]) ?? [];
      if (ring.length >= 3 && pointInPolygon(point, ring)) {
        zoneMatched = true;
        zoneOverride = z.feeOverride ?? null;
        break;
      }
    }

    const deliverable = shop.isOpen && (withinRadius || zoneMatched);
    const fee = computeDeliveryFee(distanceMeters, { override: zoneOverride });

    return {
      deliverable,
      distanceMeters,
      // Shop-page views are numerous; a route API call here would deplete the
      // shared Baato free allowance. Road geometry is requested only for an
      // order in transit. This estimate is explicitly marked approximate.
      etaSeconds: deliverable ? estimateDurationSeconds(distanceMeters) : null,
      etaDegraded: true,
      withinRadius,
      zoneMatched,
      deliveryRadiusKm: shop.deliveryRadiusKm,
      fee,
      minOrder: shop.minOrder,
      reason: deliverable ? undefined : shop.isOpen ? "Outside delivery range" : "Shop is closed",
    };
  }

  /** Combined product + shop search for the customer search page. */
  async search(q: string, point?: GeoPoint) {
    const term = q?.trim();
    if (!term || term.length < 2) throw new BadRequestException("Enter at least 2 characters");
    const serviceable = point ? await this.serviceableRows(point) : null;
    const serviceableIds = serviceable?.map((row) => row.id);
    const distanceByShop = new Map(
      serviceable?.map((row) => [row.id, Math.round(row.distance)]) ?? [],
    );
    const shopEligibility = serviceableIds ? { id: { in: serviceableIds } } : STOREFRONT_SHOP_WHERE;
    const [shops, products] = await Promise.all([
      this.prisma.shop.findMany({
        where: {
          ...STOREFRONT_SHOP_WHERE,
          ...(serviceableIds ? { id: { in: serviceableIds } } : {}),
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { nameNp: { contains: term, mode: "insensitive" } },
            { area: { contains: term, mode: "insensitive" } },
            { category: { en: { contains: term, mode: "insensitive" } } },
            { category: { np: { contains: term, mode: "insensitive" } } },
          ],
        },
        take: 12,
        include: {
          category: true,
          _count: { select: { products: { where: DELIVERABLE_PRODUCT_WHERE } } },
        },
      }),
      this.prisma.product.findMany({
        where: {
          ...DELIVERABLE_PRODUCT_WHERE,
          shop: shopEligibility,
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { nameNp: { contains: term, mode: "insensitive" } },
            { tags: { has: term.toLowerCase() } },
            { category: { en: { contains: term, mode: "insensitive" } } },
            { category: { np: { contains: term, mode: "insensitive" } } },
          ],
        },
        take: 24,
        include: {
          variants: { where: { isActive: true } },
          category: true,
          shop: {
            select: {
              id: true,
              slug: true,
              name: true,
              nameNp: true,
              categoryId: true,
              category: true,
              area: true,
              ratingAvg: true,
              ratingCount: true,
              isOpen: true,
              hours: true,
              emoji: true,
              verified: true,
              minOrder: true,
              phone: true,
              deliveryRadiusKm: true,
            },
          },
        },
      }),
    ]);
    return {
      query: term,
      locationApplied: Boolean(point),
      shops: shops
        .map((shop) => ({ ...shop, distanceMeters: distanceByShop.get(shop.id) ?? null }))
        .sort(
          (a, b) =>
            (a.distanceMeters ?? Number.MAX_SAFE_INTEGER) -
            (b.distanceMeters ?? Number.MAX_SAFE_INTEGER),
        ),
      products: withImageUrlsAll(this.storage, products)
        .map((product) => ({
          ...product,
          distanceMeters: distanceByShop.get(product.shopId) ?? null,
        }))
        .sort(
          (a, b) =>
            (a.distanceMeters ?? Number.MAX_SAFE_INTEGER) -
            (b.distanceMeters ?? Number.MAX_SAFE_INTEGER),
        ),
    };
  }

  async reverseGeocode(point: GeoPoint) {
    return { address: await this.maps.reverseGeocode(point) };
  }

  async suggestPlaces(query: string, near?: GeoPoint) {
    try {
      const suggestions = this.maps.searchPlaces
        ? await this.maps.searchPlaces(query.trim(), near, 6)
        : [];
      return {
        provider: this.maps.name,
        attribution: this.maps.name === "baato" ? "Search by baato.io" : null,
        suggestions,
      };
    } catch {
      throw new ServiceUnavailableException(
        "Location search is temporarily unavailable. You can still place the pin manually.",
      );
    }
  }

  async resolvePlace(placeId: string) {
    let place;
    try {
      place = this.maps.resolvePlace ? await this.maps.resolvePlace(placeId) : null;
    } catch {
      throw new ServiceUnavailableException(
        "Location search is temporarily unavailable. You can still place the pin manually.",
      );
    }
    if (!place) throw new NotFoundException("Location not found");
    return {
      provider: this.maps.name,
      attribution: this.maps.name === "baato" ? "Location by baato.io" : null,
      place,
    };
  }

  /** Front-end-safe map SDK config (provider + token), so the client never hardcodes it. */
  /**
   * What the apps should load, per surface.
   *
   * The base config is the server's own provider and stays first for
   * compatibility with clients that read the flat shape. `surfaces` lets the
   * pin picker and the tracking map be pointed at different vendors without an
   * app release — which matters because their volumes differ by orders of
   * magnitude and the free allowances are per vendor, not shared.
   *
   * Nothing here is a secret: these are the public, browser-safe tokens, the
   * same ones the web storefront already receives.
   */
  mapClientConfig() {
    const base = this.maps.clientConfig();
    const surfaces = this.config.get("maps.surfaces", { infer: true });

    const resolve = (name: "pin" | "tracking") => {
      const override = surfaces?.[name];
      if (!override?.provider) return base;
      if (override.provider === "google" && name === "pin") {
        return { provider: "google", token: override.token ?? null };
      }
      return base;
    };

    return { ...base, surfaces: { pin: resolve("pin"), tracking: resolve("tracking") } };
  }

  private async hydrate(rows: { id: string; distance: number }[]) {
    if (rows.length === 0) return [];
    const byId = new Map(rows.map((r) => [r.id, Math.round(r.distance)]));
    const shops = await this.prisma.shop.findMany({
      where: { id: { in: rows.map((r) => r.id) }, ...STOREFRONT_SHOP_WHERE },
      include: { category: true, _count: { select: { products: { where: { isActive: true } } } } },
    });
    return shops
      .map((s) => ({ ...s, distanceMeters: byId.get(s.id) ?? null }))
      .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  }

  /** Radius coverage plus the custom polygons a seller may define. */
  private async serviceableRows(point: GeoPoint) {
    const [radiusRows, zoneShops] = await Promise.all([
      this.prisma.shopsCovering(point),
      this.prisma.shop.findMany({
        where: { ...STOREFRONT_SHOP_WHERE, zones: { some: {} } },
        select: { id: true, lat: true, lng: true, zones: { select: { polygon: true } } },
      }),
    ]);
    const rows = new Map(radiusRows.map((row) => [row.id, row]));
    for (const shop of zoneShops) {
      if (rows.has(shop.id) || shop.lat == null || shop.lng == null) continue;
      const covered = shop.zones.some((zone) => {
        const ring = (zone.polygon as unknown as GeoPoint[]) ?? [];
        return ring.length >= 3 && pointInPolygon(point, ring);
      });
      if (covered) {
        rows.set(shop.id, {
          id: shop.id,
          distance: haversineMeters({ lat: shop.lat, lng: shop.lng }, point),
        });
      }
    }
    return [...rows.values()].sort((a, b) => a.distance - b.distance);
  }
}

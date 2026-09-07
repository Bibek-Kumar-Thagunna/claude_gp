import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { computeDeliveryFee } from '../../common/delivery-fee';
import { haversineMeters, pointInPolygon, type GeoPoint } from '../../providers/geo';
import { MAP_PROVIDER, type MapProvider } from '../../providers/map.provider';

@Injectable()
export class DiscoveryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAP_PROVIDER) private readonly maps: MapProvider,
  ) {}

  /** Active shops within `radiusKm` of the point (exploration), nearest first. */
  async shopsNear(point: GeoPoint, radiusKm = 5) {
    const near = await this.prisma.shopsWithinMeters(point, radiusKm * 1000);
    return this.hydrate(near);
  }

  /** Shops that actually deliver to the point (their own radius covers it). */
  async shopsDeliveringTo(point: GeoPoint) {
    const covering = await this.prisma.shopsCovering(point);
    return this.hydrate(covering);
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
    if (!shop) throw new NotFoundException('Shop not found');
    if (shop.lat == null || shop.lng == null) {
      return { deliverable: false, reason: 'Shop location not set' as const };
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
    const route = await this.maps.route(origin, point);

    return {
      deliverable,
      distanceMeters,
      etaSeconds: route.durationSeconds,
      etaDegraded: route.degraded,
      withinRadius,
      zoneMatched,
      deliveryRadiusKm: shop.deliveryRadiusKm,
      fee,
      minOrder: shop.minOrder,
      reason: deliverable ? undefined : shop.isOpen ? 'Outside delivery range' : 'Shop is closed',
    };
  }

  /** Combined product + shop search for the customer search page. */
  async search(q: string) {
    const term = q?.trim();
    if (!term || term.length < 2) throw new BadRequestException('Enter at least 2 characters');
    const [shops, products] = await Promise.all([
      this.prisma.shop.findMany({
        where: {
          status: 'ACTIVE',
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { area: { contains: term, mode: 'insensitive' } },
          ],
        },
        take: 12,
        include: { category: true },
      }),
      this.prisma.product.findMany({
        where: {
          isActive: true,
          shop: { status: 'ACTIVE' },
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { tags: { has: term.toLowerCase() } },
          ],
        },
        take: 24,
        include: { shop: { select: { id: true, name: true, slug: true } } },
      }),
    ]);
    return { query: term, shops, products };
  }

  /** Front-end-safe map SDK config (provider + token), so the client never hardcodes it. */
  mapClientConfig() {
    return this.maps.clientConfig();
  }

  private async hydrate(rows: { id: string; distance: number }[]) {
    if (rows.length === 0) return [];
    const byId = new Map(rows.map((r) => [r.id, Math.round(r.distance)]));
    const shops = await this.prisma.shop.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      include: { category: true, _count: { select: { products: { where: { isActive: true } } } } },
    });
    return shops
      .map((s) => ({ ...s, distanceMeters: byId.get(s.id) ?? null }))
      .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  }
}

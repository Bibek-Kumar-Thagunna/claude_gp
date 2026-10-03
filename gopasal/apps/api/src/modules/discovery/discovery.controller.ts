import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../../auth/decorators/public.decorator";
import { DiscoveryService } from "./discovery.service";
import {
  GeoQueryDto,
  NearbyQueryDto,
  PlaceResolveQueryDto,
  PlaceSuggestQueryDto,
  SearchQueryDto,
} from "./dto/discovery.dto";

/**
 * Public discovery surface — the customer storefront's home/search/map. No auth
 * required; this is what an anonymous visitor sees before signing in.
 */
@ApiTags("discovery")
@Public()
@Controller("discovery")
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get("shops/near")
  @ApiOperation({ summary: "Explore active shops near a point (nearest first)" })
  near(@Query() q: NearbyQueryDto) {
    return this.discovery.shopsNear({ lat: q.lat, lng: q.lng }, q.radiusKm);
  }

  @Get("shops/delivering")
  @ApiOperation({ summary: "Shops whose delivery range covers a point" })
  delivering(@Query() q: GeoQueryDto) {
    return this.discovery.shopsDeliveringTo({ lat: q.lat, lng: q.lng });
  }

  @Get("home")
  @ApiOperation({ summary: "Location-qualified homepage shops and product shelves" })
  home(@Query() q: GeoQueryDto) {
    return this.discovery.home({ lat: q.lat, lng: q.lng });
  }

  @Get("shops/:shopId/delivery-check")
  @ApiOperation({ summary: "Deliverable? distance, ETA and fee for a shop → point" })
  deliveryCheck(@Param("shopId") shopId: string, @Query() q: GeoQueryDto) {
    return this.discovery.deliveryCheck(shopId, { lat: q.lat, lng: q.lng });
  }

  @Get("search")
  @ApiOperation({ summary: "Search shops and products" })
  search(@Query() q: SearchQueryDto) {
    const point =
      q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : undefined;
    return this.discovery.search(q.q, point);
  }

  @Get("reverse-geocode")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: "Resolve a selected map point to a human-readable address when available",
  })
  reverseGeocode(@Query() q: GeoQueryDto) {
    return this.discovery.reverseGeocode({ lat: q.lat, lng: q.lng });
  }

  @Get("places/suggest")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: "Location autocomplete backed by the configured Nepal map provider" })
  suggestPlaces(@Query() q: PlaceSuggestQueryDto) {
    const near =
      q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : undefined;
    return this.discovery.suggestPlaces(q.q, near);
  }

  @Get("places/resolve")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: "Resolve a selected autocomplete result to a delivery pin" })
  resolvePlace(@Query() q: PlaceResolveQueryDto) {
    return this.discovery.resolvePlace(q.placeId);
  }

  @Get("map-config")
  @ApiOperation({ summary: "Client map SDK config (provider + public token)" })
  mapConfig() {
    return this.discovery.mapClientConfig();
  }
}

import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { DiscoveryService } from './discovery.service';
import { GeoQueryDto, NearbyQueryDto, SearchQueryDto } from './dto/discovery.dto';

/**
 * Public discovery surface — the customer storefront's home/search/map. No auth
 * required; this is what an anonymous visitor sees before signing in.
 */
@ApiTags('discovery')
@Public()
@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discovery: DiscoveryService) {}

  @Get('shops/near')
  @ApiOperation({ summary: 'Explore active shops near a point (nearest first)' })
  near(@Query() q: NearbyQueryDto) {
    return this.discovery.shopsNear({ lat: q.lat, lng: q.lng }, q.radiusKm);
  }

  @Get('shops/delivering')
  @ApiOperation({ summary: 'Shops whose delivery range covers a point' })
  delivering(@Query() q: GeoQueryDto) {
    return this.discovery.shopsDeliveringTo({ lat: q.lat, lng: q.lng });
  }

  @Get('shops/:shopId/delivery-check')
  @ApiOperation({ summary: 'Deliverable? distance, ETA and fee for a shop → point' })
  deliveryCheck(@Param('shopId') shopId: string, @Query() q: GeoQueryDto) {
    return this.discovery.deliveryCheck(shopId, { lat: q.lat, lng: q.lng });
  }

  @Get('search')
  @ApiOperation({ summary: 'Search shops and products' })
  search(@Query() q: SearchQueryDto) {
    return this.discovery.search(q.q);
  }

  @Get('map-config')
  @ApiOperation({ summary: 'Client map SDK config (provider + public token)' })
  mapConfig() {
    return this.discovery.mapClientConfig();
  }
}

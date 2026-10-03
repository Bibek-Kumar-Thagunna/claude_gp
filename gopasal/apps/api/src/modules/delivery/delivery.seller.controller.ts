import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequirePermissions } from "../../rbac/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { DeliveryService } from "./delivery.service";
import {
  AssignRiderDto,
  DeliveryStatusDto,
  RegisterRiderDto,
  UpsertZoneDto,
} from "./dto/delivery.dto";

/**
 * Seller delivery operations, shop-scoped. Covers the shop's own rider roster
 * (self-delivery, Model 4A), rider assignment, manual status updates and the
 * custom delivery zones that shape the shop's serviceable area + fees.
 */
@ApiTags("seller:delivery")
@ApiBearerAuth()
@Controller("seller/shops/:shopId")
export class DeliverySellerController {
  constructor(private readonly delivery: DeliveryService) {}

  // riders
  @Get("riders")
  @RequirePermissions("delivery.view")
  listRiders(@Param("shopId") shopId: string) {
    return this.delivery.listRiders(shopId);
  }

  @Post("riders")
  @RequirePermissions("delivery.assign")
  @ApiOperation({ summary: "Register a rider for this shop" })
  registerRider(@Param("shopId") shopId: string, @Body() dto: RegisterRiderDto) {
    return this.delivery.registerRider(shopId, dto);
  }

  @Delete("riders/:riderId")
  @RequirePermissions("delivery.assign")
  removeRider(@Param("shopId") shopId: string, @Param("riderId") riderId: string) {
    return this.delivery.removeRider(shopId, riderId);
  }

  // assignment
  @Post("orders/:orderId/assign")
  @RequirePermissions("delivery.assign")
  @ApiOperation({ summary: "Assign a rider to an order" })
  assign(
    @CurrentUser("id") userId: string,
    @Param("shopId") shopId: string,
    @Param("orderId") orderId: string,
    @Body() dto: AssignRiderDto,
  ) {
    return this.delivery.assignRider(shopId, orderId, dto.riderId, userId);
  }

  @Post("orders/:orderId/unassign")
  @RequirePermissions("delivery.assign")
  unassign(@Param("shopId") shopId: string, @Param("orderId") orderId: string) {
    return this.delivery.unassign(shopId, orderId);
  }

  @Patch("orders/:orderId/delivery")
  @RequirePermissions("delivery.update")
  @ApiOperation({ summary: "Update delivery, failure and return-to-shop status" })
  updateStatus(
    @CurrentUser("id") actorId: string,
    @Param("shopId") shopId: string,
    @Param("orderId") orderId: string,
    @Body() dto: DeliveryStatusDto,
  ) {
    return this.delivery.sellerUpdateStatus(shopId, orderId, dto, actorId);
  }

  // zones
  @Get("zones")
  @RequirePermissions("delivery.view")
  listZones(@Param("shopId") shopId: string) {
    return this.delivery.listZones(shopId);
  }

  @Post("zones")
  @RequirePermissions("settings.manage")
  createZone(@Param("shopId") shopId: string, @Body() dto: UpsertZoneDto) {
    return this.delivery.createZone(shopId, dto);
  }

  @Patch("zones/:zoneId")
  @RequirePermissions("settings.manage")
  updateZone(
    @Param("shopId") shopId: string,
    @Param("zoneId") zoneId: string,
    @Body() dto: UpsertZoneDto,
  ) {
    return this.delivery.updateZone(shopId, zoneId, dto);
  }

  @Delete("zones/:zoneId")
  @RequirePermissions("settings.manage")
  removeZone(@Param("shopId") shopId: string, @Param("zoneId") zoneId: string) {
    return this.delivery.removeZone(shopId, zoneId);
  }
}

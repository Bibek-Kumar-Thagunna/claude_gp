import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { GroupOrderService } from "./group-order.service";
import { CheckoutDto, CheckoutQuoteDto } from "../orders/dto/orders.dto";
import {
  CreateGroupOrderDto,
  GroupCodeParamDto,
  GroupOrderParamDto,
  JoinGroupOrderDto,
  SetGroupItemsDto,
} from "./dto/group-order.dto";

/** "Order together" — host-led group carts that place one combined order. */
@ApiTags("group-orders")
@ApiBearerAuth()
@Controller("group-orders")
export class GroupOrderController {
  constructor(private readonly groups: GroupOrderService) {}

  @Post()
  @ApiOperation({ summary: "Start a group order for a shop" })
  create(@CurrentUser("id") userId: string, @Body() dto: CreateGroupOrderDto) {
    return this.groups.create(userId, dto.shopId, dto.expiresInMinutes);
  }

  @Get("mine")
  mine(@CurrentUser("id") userId: string) {
    return this.groups.mine(userId);
  }

  @Get("code/:code")
  @ApiOperation({ summary: "Look up a group by its share code (to join)" })
  byCode(@Param() params: GroupCodeParamDto) {
    return this.groups.getByCode(params.code);
  }

  @Get(":groupOrderId")
  get(@CurrentUser("id") userId: string, @Param() params: GroupOrderParamDto) {
    return this.groups.get(userId, params.groupOrderId);
  }

  @Post("join")
  @ApiOperation({ summary: "Join a group using its code" })
  join(@CurrentUser("id") userId: string, @Body() dto: JoinGroupOrderDto) {
    return this.groups.join(userId, dto.code);
  }

  @Post(":groupOrderId/items")
  @ApiOperation({ summary: "Set my draft items in the group" })
  setItems(
    @CurrentUser("id") userId: string,
    @Param() params: GroupOrderParamDto,
    @Body() dto: SetGroupItemsDto,
  ) {
    return this.groups.setItems(userId, params.groupOrderId, dto.items);
  }

  @Post(":groupOrderId/leave")
  leave(@CurrentUser("id") userId: string, @Param() params: GroupOrderParamDto) {
    return this.groups.leave(userId, params.groupOrderId);
  }

  @Post(":groupOrderId/lock")
  @ApiOperation({ summary: "Host locks the group (no more edits)" })
  lock(@CurrentUser("id") userId: string, @Param() params: GroupOrderParamDto) {
    return this.groups.lock(userId, params.groupOrderId);
  }

  @Post(":groupOrderId/cancel")
  cancel(@CurrentUser("id") userId: string, @Param() params: GroupOrderParamDto) {
    return this.groups.cancel(userId, params.groupOrderId);
  }

  @Post(":groupOrderId/place")
  @ApiOperation({ summary: "Host places the combined order" })
  place(
    @CurrentUser("id") userId: string,
    @Param() params: GroupOrderParamDto,
    @Body() dto: CheckoutDto,
  ) {
    return this.groups.place(userId, params.groupOrderId, dto);
  }

  @Post(":groupOrderId/quote")
  @ApiOperation({ summary: "Quote the host’s combined group checkout" })
  quote(
    @CurrentUser("id") userId: string,
    @Param() params: GroupOrderParamDto,
    @Body() dto: CheckoutQuoteDto,
  ) {
    return this.groups.quote(userId, params.groupOrderId, dto);
  }
}

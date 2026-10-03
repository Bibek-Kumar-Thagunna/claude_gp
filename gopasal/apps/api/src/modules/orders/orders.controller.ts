import { Body, Controller, Get, Headers, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { OrdersService } from "./orders.service";
import {
  ApplyCouponDto,
  CancelOrderDto,
  CheckoutDto,
  CheckoutQuoteDto,
} from "./dto/orders.dto";

/** Customer order surface — place, track, cancel. Bound to the signed-in user. */
@ApiTags("orders")
@ApiBearerAuth()
@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get("payment-methods/:shopId")
  @ApiOperation({ summary: "Payment methods enabled by both this deployment and shop" })
  paymentMethods(@Param("shopId") shopId: string) {
    return this.orders.availablePaymentMethods(shopId);
  }

  @Post("checkout")
  @ApiOperation({
    summary: "Place an order from the current cart",
    description:
      "Send an `Idempotency-Key` header (any unique string per checkout attempt). " +
      "Retrying a timed-out checkout with the same key returns the order that was " +
      "already created instead of placing a second one.",
  })
  @ApiHeader({
    name: "Idempotency-Key",
    required: false,
    description: "Unique per checkout attempt; reused verbatim on retry.",
  })
  checkout(
    @CurrentUser("id") userId: string,
    @Body() dto: CheckoutDto,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return this.orders.checkout(userId, dto, idempotencyKey);
  }

  @Post("checkout/quote")
  @ApiOperation({ summary: "Authoritative delivery and total quote for the current cart" })
  quote(@CurrentUser("id") userId: string, @Body() dto: CheckoutQuoteDto) {
    return this.orders.checkoutQuote(userId, dto);
  }

  @Post("preview-coupon")
  @ApiOperation({ summary: "Preview a coupon discount against the current cart" })
  previewCoupon(@CurrentUser("id") userId: string, @Body() dto: ApplyCouponDto) {
    return this.orders.previewCoupon(userId, dto.couponCode);
  }

  @Get()
  @ApiOperation({ summary: "My order history" })
  list(@CurrentUser("id") userId: string) {
    return this.orders.listMine(userId);
  }

  @Get(":orderId")
  @ApiOperation({ summary: "Order detail incl. live tracking payload" })
  get(@CurrentUser("id") userId: string, @Param("orderId") orderId: string) {
    return this.orders.getMine(userId, orderId);
  }

  @Post(":orderId/cancel")
  @ApiOperation({ summary: "Cancel an order (only before it is dispatched)" })
  cancel(
    @CurrentUser("id") userId: string,
    @Param("orderId") orderId: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.orders.cancelMine(userId, orderId, dto.reason);
  }

  @Post(":orderId/payment/retry")
  @ApiOperation({ summary: "Start a fresh eSewa or Khalti attempt for an unpaid order" })
  retryGatewayPayment(@CurrentUser("id") userId: string, @Param("orderId") orderId: string) {
    return this.orders.retryGatewayPayment(userId, orderId);
  }
}

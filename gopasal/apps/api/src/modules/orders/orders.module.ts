import { Module } from "@nestjs/common";
import { CartModule } from "../cart/cart.module";
import { CouponsModule } from "../coupons/coupons.module";
import { FinanceModule } from "../finance/finance.module";
import { EngagementModule } from "../engagement/engagement.module";
import { OrdersController } from "./orders.controller";
import { OrdersSellerController } from "./orders.seller.controller";
import { OrdersService } from "./orders.service";
import { PaymentsCallbackController } from "./payments-callback.controller";

@Module({
  imports: [CartModule, CouponsModule, FinanceModule, EngagementModule],
  controllers: [OrdersController, OrdersSellerController, PaymentsCallbackController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}

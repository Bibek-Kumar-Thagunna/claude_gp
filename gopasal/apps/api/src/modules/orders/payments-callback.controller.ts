import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Response } from "express";
import { Public } from "../../auth/decorators/public.decorator";
import type { AppConfig } from "../../config/configuration";
import { OrdersService } from "./orders.service";

@ApiExcludeController()
@Public()
@Controller("payments/callback")
export class PaymentsCallbackController {
  constructor(
    private readonly orders: OrdersService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Get(":provider")
  async callback(
    @Param("provider") provider: string,
    @Query("orderId") orderId: string,
    @Res() response: Response,
  ) {
    const method = provider.toUpperCase();
    const destination = new URL(
      `/orders/${encodeURIComponent(orderId || "unknown")}`,
      this.config.get("customerWebUrl", { infer: true }),
    );
    if (!orderId || (method !== "ESEWA" && method !== "KHALTI")) {
      destination.pathname = "/orders";
      destination.searchParams.set("payment", "invalid_callback");
      return response.redirect(303, destination.toString());
    }
    try {
      const result = await this.orders.verifyGatewayPayment(orderId, method);
      destination.searchParams.set("payment", result.status.toLowerCase());
    } catch {
      destination.searchParams.set("payment", "verification_failed");
    }
    return response.redirect(303, destination.toString());
  }
}

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { OrderStatus, PaymentMethod } from "@prisma/client";
import { SEARCH_MAX_LENGTH } from "../../../common/dto/pagination.dto";

const CHECKOUT_PAYMENT_METHODS = [
  PaymentMethod.COD,
  PaymentMethod.ESEWA,
  PaymentMethod.KHALTI,
] as const;

export class CheckoutDto {
  @ApiProperty({ description: "Delivery address id (must belong to the user)" })
  @IsString()
  addressId!: string;

  @ApiProperty({ enum: CHECKOUT_PAYMENT_METHODS, default: PaymentMethod.COD })
  @IsIn(CHECKOUT_PAYMENT_METHODS)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ description: "Coupon code to apply" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  couponCode?: string;

  @ApiPropertyOptional({ description: "Note for the shop / rider" })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;

  @ApiPropertyOptional({ description: "Apply the maximum eligible GoCoins balance" })
  @IsOptional()
  @IsBoolean()
  useGoCoins?: boolean;
}

export class CheckoutQuoteDto {
  @ApiProperty({ description: "Delivery address id (must belong to the user)" })
  @IsString()
  addressId!: string;

  @ApiPropertyOptional({ description: "Coupon code to include in the quote" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  couponCode?: string;

  @ApiPropertyOptional({ description: "Include the maximum eligible GoCoins discount" })
  @IsOptional()
  @IsBoolean()
  useGoCoins?: boolean;
}

export class CancelOrderDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(280)
  reason!: string;
}

export class RejectOrderDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(280)
  reason!: string;
}

export class TransitionNoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string;
}

export class ApplyCouponDto {
  @ApiProperty()
  @IsString()
  couponCode!: string;
}

/** Newest-first is the queue's working order; oldest-first is for clearing a backlog. */
export const ORDER_SORTS = ["newest", "oldest"] as const;
export type OrderSort = (typeof ORDER_SORTS)[number];

/**
 * `?status=ACCEPTED,PACKED` → `['ACCEPTED', 'PACKED']`.
 *
 * Anything that is not a string is handed back untouched so `@IsArray` and
 * `@IsEnum(…, { each: true })` are the things that reject it, with a message that
 * names the field. Typed `unknown` in and out on purpose: `class-transformer` types
 * `value` as `any`, and letting that leak turns the decorator into an unchecked hole.
 */
function toStatusList(value: unknown): unknown {
  if (typeof value !== "string") return value;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * The seller order queue's query string.
 *
 * This is a class, not a set of loose `@Query('…')` parameters, and that is the
 * point. The route used to read `@Query('status') status?: OrderStatus` — a bare
 * string with a type annotation TypeScript erases, so nothing checked it and it went
 * straight into a Prisma `where` clause. `ValidationPipe` can only whitelist and
 * validate what it can see a class for.
 *
 * `status` is a *list* because the console's tabs are status groups, not single
 * statuses: "In progress" is ACCEPTED, PACKED and OUT_FOR_DELIVERY together, and
 * "Rejected & cancelled" is two more. Sending `?status=ACCEPTED,PACKED` lets the tab
 * be a server-side filter instead of a browser-side one. A single value still works,
 * so the previous `?status=PLACED` callers are unaffected.
 *
 * It deliberately does **not** extend `PaginationDto`: `page`/`limit`/`q` are
 * declared here so the queue can document what `q` actually searches, which
 * `PaginationDto` leaves open.
 */
export class ListShopOrdersQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({
    description: "Matches order code, recipient name or delivery area (case-insensitive)",
  })
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  q?: string;

  @ApiPropertyOptional({
    enum: OrderStatus,
    isArray: true,
    description: "One status, or several comma-separated (e.g. ACCEPTED,PACKED)",
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => toStatusList(value))
  @IsArray()
  @IsEnum(OrderStatus, { each: true })
  status?: OrderStatus[];

  @ApiPropertyOptional({ enum: ORDER_SORTS, default: "newest" })
  @IsOptional()
  @IsIn(ORDER_SORTS)
  sort: OrderSort = "newest";

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

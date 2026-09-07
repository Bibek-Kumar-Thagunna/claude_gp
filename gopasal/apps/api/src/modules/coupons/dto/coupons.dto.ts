import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CouponType } from '@prisma/client';
import { SEARCH_MAX_LENGTH } from '../../../common/dto/pagination.dto';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCouponDto {
  @ApiProperty({ example: 'GOPASAL50' })
  @IsString()
  @MinLength(3)
  code!: string;

  @ApiProperty({ enum: CouponType })
  @IsEnum(CouponType)
  type!: CouponType;

  @ApiProperty({ description: 'Percent (1–100) or flat NPR amount' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  value!: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minOrder?: number;

  @ApiPropertyOptional({ description: 'Cap for percent coupons (NPR)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxDiscount?: number;

  @ApiPropertyOptional({ description: 'Total redemptions allowed' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  perUserLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validTo?: string;
}

export class UpdateCouponDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validTo?: string;
}

/** Newest-first is how a shop reads its codes; oldest-first is for auditing old ones. */
export const COUPON_SORTS = ['newest', 'oldest'] as const;
export type CouponSort = (typeof COUPON_SORTS)[number];

/**
 * `?status=` — the two buckets the seller console offers, and the only two.
 *
 * `running` means "checkout will accept this code right now", which is not the
 * `isActive` column: a coupon can be switched on and still be scheduled, expired or
 * used up. `idle` is the exact complement, because from a shopper's point of view
 * off, not-started, expired and used-up are the same thing — the code does not work.
 *
 * Deliberately not `?active=true|false`. That would be a filter on the stored column
 * that reads like a filter on usability, and the console would end up labelling a row
 * "Expired" inside a list the server called active.
 */
export const COUPON_STATUSES = ['running', 'idle'] as const;
export type CouponStatusFilter = (typeof COUPON_STATUSES)[number];

/**
 * The seller coupon list's query string.
 *
 * `list({ shopId })` used to be `findMany({ where: { shopId } })` with no `take`, and
 * the console filtered and tallied the whole array in the browser. Nothing prunes this
 * table — `deactivate` writes `isActive: false` and no route deletes a row — so a shop
 * that runs a code per festival accumulates them for as long as it trades. It is not a
 * table that explodes the way orders and reviews do, and it is not one with a ceiling
 * either, which is why it is paged rather than left alone.
 *
 * `status` is a string enum rather than a boolean for the same reason `?answered=` on
 * the review list is: query strings are validated with `enableImplicitConversion` on,
 * and class-transformer converts a boolean-typed property with `!!value`, so `'false'`
 * would arrive as `true`.
 */
export class ListShopCouponsQueryDto {
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

  /**
   * Matches the code, case-insensitively, and nothing else: `Coupon` has no name,
   * no description and no note. There is nothing else on the row to search.
   */
  @ApiPropertyOptional({ description: 'Matches the coupon code (case-insensitive)' })
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  q?: string;

  @ApiPropertyOptional({
    enum: COUPON_STATUSES,
    description: 'running = checkout accepts it now; idle = off, scheduled, expired or used up',
  })
  @IsOptional()
  @IsIn(COUPON_STATUSES)
  status?: CouponStatusFilter;

  @ApiPropertyOptional({ enum: COUPON_SORTS, default: 'newest' })
  @IsOptional()
  @IsIn(COUPON_SORTS)
  sort: CouponSort = 'newest';

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

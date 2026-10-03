import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { DeliveryStatus, RiderStatus, VehicleType } from "@prisma/client";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Matches,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";

export class DeliveryOrderParamDto {
  @ApiProperty({ description: "Order id" })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  orderId!: string;
}

export class DeliveryShopOrderParamDto extends DeliveryOrderParamDto {
  @ApiProperty({ description: "Shop id" })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/)
  shopId!: string;
}

export class RiderDeliveryHistoryQueryDto extends PaginationDto {}

export class RegisterRiderDto {
  @ApiProperty({ example: "9812345678" })
  @IsString()
  phone!: string;

  @ApiProperty({ example: "Ram Bahadur" })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ enum: VehicleType, default: VehicleType.MOTORBIKE })
  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;
}

export class AssignRiderDto {
  @ApiProperty()
  @IsString()
  riderId!: string;
}

export class RiderStatusDto {
  @ApiProperty({ enum: [RiderStatus.ONLINE, RiderStatus.OFFLINE] })
  @IsEnum(RiderStatus)
  status!: RiderStatus;
}

/** A proof-of-delivery note, and the failure reason, are both free text a person
 *  types on a phone. Bounded so a single request cannot push an unbounded string
 *  into a Postgres `text` column: 500 characters is longer than anybody writes
 *  standing at a doorstep, and short enough to render in a dispute thread. */
export const POD_NOTE_MAX_LENGTH = 500;
export const FAIL_REASON_MAX_LENGTH = 500;

/**
 * The delivery status transition body.
 *
 * **There is no `podImageUrl` here, deliberately.** The column exists on
 * `model Delivery` and this DTO used to accept a string for it, which meant the
 * client chose where the platform's proof-of-delivery pointed. Two things are
 * wrong with that, and the second is the serious one:
 *
 * 1. Nothing validated the string. Any value — an external host, a `javascript:`
 *    URL, a `data:` blob, 10 kB of prose — was written to `Delivery.podImageUrl`
 *    and would later be rendered as an image source by whichever surface shows
 *    proof of delivery.
 * 2. **POD is evidence.** It is what settles "the customer says it never
 *    arrived". A URL supplied by the party being questioned points at bytes that
 *    party still controls: they can swap the photo, or delete it, after the claim
 *    is made. Evidence the platform does not hold is not evidence.
 *
 * So the field is gone rather than tightened, and `forbidNonWhitelisted` now
 * answers 400 to any request that sends it. Restoring it means an upload route
 * that stores the bytes under `private/` (a doorstep photo shows a customer's
 * home, and often the customer) and authenticated, audit-logged read endpoints.
 * Those endpoints now live in `delivery-proof.controller.ts`; this transition
 * DTO remains intentionally unable to choose or replace their storage key.
 */
export class DeliveryStatusDto {
  @ApiProperty({ enum: DeliveryStatus })
  @IsEnum(DeliveryStatus)
  status!: DeliveryStatus;

  @ApiPropertyOptional({ description: "Proof-of-delivery note", maxLength: POD_NOTE_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(POD_NOTE_MAX_LENGTH)
  podNote?: string;

  @ApiPropertyOptional({ description: "COD cash collected?" })
  @IsOptional()
  @IsBoolean()
  codCollected?: boolean;

  @ApiPropertyOptional({ maxLength: FAIL_REASON_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(FAIL_REASON_MAX_LENGTH)
  failReason?: string;

  @ApiPropertyOptional({
    description: "Factual condition of the parcel received back at the shop",
    maxLength: FAIL_REASON_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(FAIL_REASON_MAX_LENGTH)
  returnNote?: string;
}

export class RiderPingDto {
  @ApiProperty({ example: 27.7172 })
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @ApiProperty({ example: 85.324 })
  @Type(() => Number)
  @IsLongitude()
  lng!: number;

  @ApiPropertyOptional({ description: "Bearing in degrees (0–360)" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  heading?: number;

  @ApiPropertyOptional({ description: "Speed in m/s" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  speed?: number;

  @ApiPropertyOptional({ description: "GPS accuracy in metres" })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  accuracy?: number;
}

class LatLngDto {
  @Type(() => Number)
  @IsLatitude()
  lat!: number;

  @Type(() => Number)
  @IsLongitude()
  lng!: number;
}

export class UpsertZoneDto {
  @ApiProperty({ example: "Baneshwor ring" })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @ApiProperty({ type: [LatLngDto], description: "Polygon vertices (>= 3)" })
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => LatLngDto)
  polygon!: LatLngDto[];

  @ApiPropertyOptional({ description: "Flat delivery fee override (NPR) for this zone" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  feeOverride?: number;
}

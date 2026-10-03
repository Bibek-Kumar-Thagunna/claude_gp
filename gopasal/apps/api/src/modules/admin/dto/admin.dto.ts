import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ConfigEnvironment, FraudStatus } from '@prisma/client';

export class ModerateProductDto {
  @IsBoolean()
  isActive!: boolean;
}

export class ShopLifecycleReasonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class RaiseFraudDto {
  @IsIn(['user', 'shop', 'order'])
  subjectType!: string;

  @IsString()
  subjectId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  severity?: string;
}

export class SetFraudStatusDto {
  @IsIn(['OPEN', 'REVIEWING', 'CONFIRMED', 'DISMISSED'])
  status!: FraudStatus;
}

export class CreatePlatformConfigDto {
  @IsEnum(ConfigEnvironment)
  environment!: ConfigEnvironment;

  @IsInt()
  @Min(0)
  @Max(10_000)
  commissionRateBps!: number;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  baseDeliveryFee!: number;

  @IsInt()
  @Min(0)
  @Max(1_000_000)
  perKmDeliveryFee!: number;

  @IsInt()
  @Min(0)
  @Max(10_000_000)
  codLimit!: number;

  @IsInt()
  @Min(1)
  @Max(2_160)
  refundWindowHours!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  changeNote!: string;
}

export class SetFeatureFlagDto {
  @IsString()
  @Matches(/^[a-z][a-z0-9_.-]{1,79}$/)
  key!: string;

  @IsEnum(ConfigEnvironment)
  environment!: ConfigEnvironment;

  @IsOptional()
  @IsString()
  shopId?: string;

  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  changeNote!: string;
}

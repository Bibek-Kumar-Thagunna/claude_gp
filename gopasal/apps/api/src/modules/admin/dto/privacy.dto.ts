import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class PlaceLegalHoldDto {
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  userId!: string;

  @IsString()
  @MinLength(15)
  @MaxLength(1000)
  reason!: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class ReleaseLegalHoldDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}

export class UpdateRetentionPolicyDto {
  @IsInt()
  @Min(1830)
  @Max(36500)
  days!: number;

  @IsString()
  @MinLength(15)
  @MaxLength(1000)
  legalBasis!: string;
}

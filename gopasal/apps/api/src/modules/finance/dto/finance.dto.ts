import { RefundMethod } from '@prisma/client';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class IssueRefundDto {
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  amount!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsEnum(RefundMethod)
  method!: RefundMethod;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  providerRef?: string;
}

export class CompleteSettlementDto {
  @IsIn(['success', 'failure'])
  outcome!: 'success' | 'failure';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  providerReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  failureReason?: string;
}

export class CompleteRefundDto {
  @IsIn(['success', 'failure'])
  outcome!: 'success' | 'failure';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  providerReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  failureReason?: string;
}

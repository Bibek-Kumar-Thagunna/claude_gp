import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { FraudStatus } from '@prisma/client';

export class ModerateProductDto {
  @IsBoolean()
  isActive!: boolean;
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

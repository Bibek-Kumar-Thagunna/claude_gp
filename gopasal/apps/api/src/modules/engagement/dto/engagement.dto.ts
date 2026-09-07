import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class RedeemReferralDto {
  @IsString()
  @Length(4, 40)
  code!: string;
}

export class SubscribeDto {
  @IsOptional()
  @IsIn(['gold'])
  plan?: string;
}

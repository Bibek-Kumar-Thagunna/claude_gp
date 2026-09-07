import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class CreateGroupOrderDto {
  @IsString()
  shopId!: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  expiresInMinutes?: number;
}

export class JoinGroupOrderDto {
  @IsString()
  code!: string;
}

export class DraftItemDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  variantId?: string | null;

  @IsInt()
  @Min(1)
  @Max(99)
  qty!: number;
}

export class SetGroupItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DraftItemDto)
  items!: DraftItemDto[];
}

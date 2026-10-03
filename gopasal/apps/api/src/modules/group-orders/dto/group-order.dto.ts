import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { GROUP_DRAFT_ITEM_LIMIT } from "../group-order-items";

export class CreateGroupOrderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  shopId!: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  expiresInMinutes?: number;
}

export class JoinGroupOrderDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^GRP-[A-HJ-NP-Z2-9]{6}$/)
  code!: string;
}

export class GroupCodeParamDto extends JoinGroupOrderDto {}

export class GroupOrderParamDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  groupOrderId!: string;
}

export class DraftItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  productId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  variantId?: string | null;

  @IsInt()
  @Min(1)
  @Max(99)
  qty!: number;
}

export class SetGroupItemsDto {
  @IsArray()
  @ArrayMaxSize(GROUP_DRAFT_ITEM_LIMIT)
  @ValidateNested({ each: true })
  @Type(() => DraftItemDto)
  items!: DraftItemDto[];
}

import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class SendShopMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;

  /** Stable client id makes retries safe on slow or interrupted connections. */
  @IsUUID('4')
  clientMessageId!: string;
}

export class StartCustomerConversationDto extends SendShopMessageDto {
  @IsString()
  shopId!: string;

  @IsOptional()
  @IsString()
  orderId?: string;
}

export class StartOrderConversationDto extends SendShopMessageDto {
  @IsString()
  orderId!: string;
}

export class ListConversationsQueryDto extends PaginationDto {}

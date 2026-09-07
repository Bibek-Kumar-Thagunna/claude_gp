import { IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { DisputeStatus, TicketPriority, TicketStatus } from '@prisma/client';

export class CreateTicketDto {
  @IsString()
  @MinLength(3)
  @MaxLength(140)
  subject!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  message!: string;
}

export class TicketMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;

  @IsOptional()
  attachments?: string[];
}

export class SetTicketStatusDto {
  @IsEnum(TicketStatus)
  status!: TicketStatus;
}

export class SetTicketPriorityDto {
  @IsEnum(TicketPriority)
  priority!: TicketPriority;
}

export class RaiseDisputeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  detail?: string;
}

export class ResolveDisputeDto {
  @IsIn(['RESOLVED_CUSTOMER', 'RESOLVED_SHOP', 'REJECTED'])
  status!: DisputeStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resolution?: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { ApplicationStatus, PayoutMethod } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { EDITABLE_FIELDS } from '../application-state';

/**
 * Onboarding input. Every field is validated here rather than in the service:
 * the global ValidationPipe runs with `whitelist` + `forbidNonWhitelisted`, so
 * anything not declared on these classes is stripped and the request rejected.
 * That is also the reason `ApplicationFieldsDto` lists the columns explicitly —
 * a `Partial<ShopApplication>` would let a caller post `status: 'APPROVED'`.
 */

const PAYOUT_METHODS: PayoutMethod[] = ['BANK', 'ESEWA', 'KHALTI'];

/** The applicant-writable part of an application. Shared by apply and patch. */
export class ApplicationFieldsDto {
  // ── shop identity ──
  @ApiPropertyOptional({ example: 'Namaste Kirana Pasal' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  shopName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  shopNameNp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  // ── contact, location, service area ──
  @IsOptional()
  @IsString()
  @MaxLength(20)
  contactPhone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  contactEmail?: string;

  @ApiPropertyOptional({ example: 'Baneshwor, Kathmandu' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  area?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  fullAddress?: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ description: 'How far the shop delivers, in km', minimum: 0.5, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(20)
  deliveryRadiusKm?: number;

  @ApiPropertyOptional({ example: '7am – 9pm' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  hours?: string;

  @ApiPropertyOptional({ description: 'The owner accepts AND delivers alone' })
  @IsOptional()
  @IsBoolean()
  soloMode?: boolean;

  // ── the person behind it ──
  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  ownerNameNp?: string;

  @ApiPropertyOptional({ description: 'Citizenship number. Reviewer-visible only; never returned to any other party.' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  citizenshipNo?: string;

  // ── business registration (optional by design) ──
  @IsOptional()
  @IsString()
  @MaxLength(40)
  registrationNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  panNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vatNo?: string;

  // ── how they get paid ──
  @ApiPropertyOptional({ enum: PAYOUT_METHODS })
  @IsOptional()
  @IsIn(PAYOUT_METHODS)
  payoutMethod?: PayoutMethod;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankBranch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  bankAccountNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankAccountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  walletNumber?: string;
}

/** `POST /seller/onboarding/applications` — start one, optionally pre-filled. */
export class CreateApplicationDto extends ApplicationFieldsDto {}

/** `PATCH …/:applicationId` — save progress. */
export class UpdateApplicationDto extends ApplicationFieldsDto {}

/**
 * Submitting is where the applicant agrees to the seller terms, so the flag is
 * required and must be `true` — a default-true checkbox is not consent, and the
 * accepted version is stamped onto the application from the published policy.
 */
export class SubmitApplicationDto {
  @ApiPropertyOptional({ description: 'Must be true. The published seller-terms version is recorded server-side.' })
  @IsBoolean()
  @Equals(true)
  acceptTerms!: boolean;

  @ApiPropertyOptional({ description: 'Anything the applicant wants the reviewer to know' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class WithdrawApplicationDto {
  @ApiPropertyOptional({ description: 'Why it is being withdrawn — recorded on the timeline' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

/**
 * `POST …/:applicationId/request-changes`. `note` is shown to the applicant
 * verbatim, so it is required: "changes requested" with no instruction is a
 * dead end. `fields` drives the wizard's highlighting and is validated against
 * the editable field list.
 */
export class RequestChangesDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note!: string;

  @ApiPropertyOptional({ enum: EDITABLE_FIELDS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsIn(EDITABLE_FIELDS, { each: true })
  fields?: string[];

  @ApiPropertyOptional({ description: 'Internal note. Never shown to the applicant.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNote?: string;
}

export class ApproveApplicationDto {
  @ApiPropertyOptional({ description: 'Welcome note shown to the new shop owner' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ description: 'Internal note. Never shown to the applicant.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNote?: string;
}

/** A rejection must say why, in words the applicant can act on. */
export class RejectApplicationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note!: string;

  @ApiPropertyOptional({ description: 'Internal note. Never shown to the applicant.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNote?: string;
}

const QUEUE_STATUSES: (ApplicationStatus | 'OPEN' | 'ALL')[] = [
  'OPEN',
  'ALL',
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'REJECTED',
  'WITHDRAWN',
];

/**
 * Review-queue filter. `OPEN` (the default) means "anything a reviewer can
 * still act on", which is the queue a human actually wants; DRAFT is excluded
 * from it because an unsubmitted draft is nobody's work item yet.
 *
 * Extends `PaginationDto` so page/limit/q behave exactly as they do on every
 * other list endpoint (including the `skip` getter).
 */
export class ReviewQueueQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: QUEUE_STATUSES, default: 'OPEN' })
  @IsOptional()
  @IsIn(QUEUE_STATUSES)
  status?: ApplicationStatus | 'OPEN' | 'ALL';

  @ApiPropertyOptional({ description: 'Only applications this reviewer has picked up' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  reviewerId?: string;
}

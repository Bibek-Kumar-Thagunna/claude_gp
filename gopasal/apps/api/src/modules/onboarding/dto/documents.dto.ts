import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ShopDocumentKind } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Input for the document routes.
 *
 * `UploadDocumentDto` is validated out of a `multipart/form-data` body, which
 * means every value arrives as a string — hence `kind` being an `@IsIn` over the
 * enum's members rather than anything numeric or transformed. The file itself is
 * not described here: multer takes it off the request before the pipe runs, and
 * the bytes are validated by `checkUpload`, which reads them rather than trusting
 * a declaration.
 */

/** Every kind an applicant may attach. `OTHER` is the "whatever was asked for" slot. */
export const UPLOADABLE_DOCUMENT_KINDS: ShopDocumentKind[] = [
  'CITIZENSHIP_FRONT',
  'CITIZENSHIP_BACK',
  'PAN_CERTIFICATE',
  'VAT_CERTIFICATE',
  'BUSINESS_LICENCE',
  'SHOP_PHOTO',
  'OWNER_PHOTO',
  'BANK_PROOF',
  'OTHER',
];

export class UploadDocumentDto {
  @ApiProperty({
    enum: UPLOADABLE_DOCUMENT_KINDS,
    description:
      'What this file is. Uploading a kind that is already attached replaces it, except for OTHER, which accumulates.',
  })
  @IsIn(UPLOADABLE_DOCUMENT_KINDS)
  kind!: ShopDocumentKind;
}

const DOCUMENT_DECISIONS = ['ACCEPTED', 'REJECTED'] as const;

/**
 * A reviewer's verdict on one document. `PENDING` is not accepted as input: it is
 * the state a document starts in, and "un-reviewing" one would erase a decision
 * that the applicant may already have been told about.
 *
 * A rejection must say why. The note is shown to the applicant verbatim, and a
 * rejected document stops satisfying its requirement, so without a reason the
 * applicant is told to fix something without being told what.
 */
export class ReviewDocumentDto {
  @ApiProperty({ enum: DOCUMENT_DECISIONS })
  @IsIn(DOCUMENT_DECISIONS)
  decision!: (typeof DOCUMENT_DECISIONS)[number];

  @ApiPropertyOptional({
    description: 'Required when rejecting. Shown to the applicant exactly as written.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

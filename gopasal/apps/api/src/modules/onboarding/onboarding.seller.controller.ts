import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile as FilePart,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { MULTIPART_HARD_LIMIT_BYTES } from '../../config/configuration';
import type { UploadedFile } from '../uploads/uploaded-file';
import { DocumentsService } from './documents.service';
import { UPLOADABLE_DOCUMENT_KINDS, UploadDocumentDto } from './dto/documents.dto';
import {
  CreateApplicationDto,
  SubmitApplicationDto,
  UpdateApplicationDto,
  WithdrawApplicationDto,
} from './dto/onboarding.dto';
import { OnboardingService } from './onboarding.service';
import { sendDocument } from './send-document';

/**
 * The applicant's own surface: "I would like to sell on GoPasal."
 *
 * These routes carry no `@RequirePermissions` on purpose, and that is not a hole.
 * The global `JwtAuthGuard` still applies, so a caller is always an authenticated
 * user; but an applicant has no shop and therefore no `ShopMembership`, so a
 * SHOP-scoped permission is impossible to hold at this point in their life. What
 * replaces it is ownership: every method takes the caller's id and the service
 * scopes every read and write by `applicantId`, so one applicant cannot see or
 * touch another's application. A KYC-bearing route that needs a permission is
 * the reviewer's, and it lives on the admin controller.
 */
@ApiTags('seller:onboarding')
@ApiBearerAuth()
@Controller('seller/onboarding/applications')
export class OnboardingSellerController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly documents: DocumentsService,
  ) {}


  @Post()
  @ApiOperation({
    summary: 'Start an application (or resume the one already open)',
    description:
      'Returns the application in progress if there is one, patched with anything sent — tapping "become a seller" twice must not create two applications.',
  })
  apply(@CurrentUser('id') userId: string, @Body() dto: CreateApplicationDto) {
    return this.onboarding.apply(userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Every application I have filed' })
  listMine(@CurrentUser('id') userId: string) {
    return this.onboarding.listMine(userId);
  }

  // Declared before `:applicationId` — Nest matches in declaration order, and
  // "current" would otherwise be read as an id.
  @Get('current')
  @ApiOperation({
    summary: 'The application I have open, if any',
    description: 'Returns `{ application: null }` when there is nothing in progress.',
  })
  current(@CurrentUser('id') userId: string) {
    return this.onboarding.current(userId);
  }

  @Get(':applicationId')
  @ApiOperation({ summary: 'One of my applications, with its status and timeline' })
  getMine(@CurrentUser('id') userId: string, @Param('applicationId') applicationId: string) {
    return this.onboarding.getMine(userId, applicationId);
  }

  @Patch(':applicationId')
  @ApiOperation({
    summary: 'Save progress',
    description:
      'Allowed while the application is a draft or has had changes requested. Once submitted it is read-only until a reviewer hands it back.',
  })
  patch(
    @CurrentUser('id') userId: string,
    @Param('applicationId') applicationId: string,
    @Body() dto: UpdateApplicationDto,
  ) {
    return this.onboarding.patch(userId, applicationId, dto);
  }

  @Post(':applicationId/submit')
  @ApiOperation({
    summary: 'Submit for review — also the resubmit action',
    description:
      'From a draft this submits; from "changes requested" this resubmits. Requires accepting the seller terms; the published version in force is recorded server-side.',
  })
  submit(
    @CurrentUser('id') userId: string,
    @Param('applicationId') applicationId: string,
    @Body() dto: SubmitApplicationDto,
  ) {
    return this.onboarding.submit(userId, applicationId, dto);
  }

  @Post(':applicationId/withdraw')
  @ApiOperation({
    summary: 'Withdraw my application',
    description: 'Terminal. Starting again means a new application; this one stays as a record.',
  })
  withdraw(
    @CurrentUser('id') userId: string,
    @Param('applicationId') applicationId: string,
    @Body() dto: WithdrawApplicationDto,
  ) {
    return this.onboarding.withdraw(userId, applicationId, dto);
  }

  // ── documents ──────────────────────────────────────────────────────────────

  /**
   * `multipart/form-data`, field name `file`, plus a `kind` field.
   *
   * The multer limit here is the hard multipart bound, not the configured one:
   * a decorator cannot read `ConfigService`. It stops a body large enough to
   * matter before any of it is buffered, and `UploadsService` then applies the
   * real ceiling — `validateConfig` guarantees the configured value is not above
   * this one, so nothing can fall between the two.
   *
   * `files: 1` matters as much as the size: without it, one request could carry
   * a hundred parts named `file` and each would be buffered.
   */
  @Post(':applicationId/documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTIPART_HARD_LIMIT_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['kind', 'file'],
      properties: {
        kind: { type: 'string', enum: UPLOADABLE_DOCUMENT_KINDS },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({
    summary: 'Attach a document (JPEG, PNG, WebP or PDF)',
    description:
      'Allowed while the application is a draft or has had changes requested. Uploading a kind that is already attached replaces it — except OTHER, which accumulates. The file type is decided by reading the bytes, not by the name or the Content-Type sent.',
  })
  uploadDocument(
    @CurrentUser('id') userId: string,
    @Param('applicationId') applicationId: string,
    @Body() dto: UploadDocumentDto,
    @FilePart() file: UploadedFile | undefined,
  ) {
    return this.documents.upload(userId, applicationId, dto, file);
  }

  /**
   * My own document back. `@Res` rather than a returned value: the response is
   * bytes, and the global `SanitizeInterceptor` rebuilds every object it is given.
   */
  @Get(':applicationId/documents/:documentId/file')
  @ApiOperation({
    summary: 'Download a document I uploaded',
    description:
      'Served as an attachment with a no-store cache policy. Scoped to the caller: a document belonging to another applicant answers 404, not 403.',
  })
  async downloadDocument(
    @CurrentUser('id') userId: string,
    @Param('applicationId') applicationId: string,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ): Promise<void> {
    sendDocument(res, await this.documents.downloadMine(userId, applicationId, documentId));
  }

  @Delete(':applicationId/documents/:documentId')
  @ApiOperation({
    summary: 'Remove a document',
    description:
      'Deletes the stored file as well as the record. Allowed only while the application is mine to edit — a document on an application under review or already decided is part of the record.',
  })
  removeDocument(
    @CurrentUser('id') userId: string,
    @Param('applicationId') applicationId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.documents.remove(userId, applicationId, documentId);
  }
}

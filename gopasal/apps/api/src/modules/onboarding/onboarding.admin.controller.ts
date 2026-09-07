import { Body, Controller, Get, Ip, Param, Post, Query, Res, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../rbac/require-permissions.decorator';
import { Audit } from '../audit/audit.decorator';
import { AuditInterceptor } from '../audit/audit.interceptor';
import { DocumentsService } from './documents.service';
import { ReviewDocumentDto } from './dto/documents.dto';
import {
  ApproveApplicationDto,
  RejectApplicationDto,
  RequestChangesDto,
  ReviewQueueQueryDto,
} from './dto/onboarding.dto';
import { OnboardingService } from './onboarding.service';
import { sendDocument } from './send-document';

/**
 * The reviewer's surface (admin.gopasal.com → Shops → Applications).
 *
 * Permissions reuse the platform keys that already exist and are already granted
 * to Operations Admin, rather than minting onboarding-specific ones: reading the
 * queue is `shops.view`, picking one up and approving it are `shops.approve`, and
 * both ways of turning one down — asking for changes, rejecting — are
 * `shops.reject`. Every mutation is audited, because approving an application is
 * the act that creates a shop and hands somebody Owner access.
 */
@ApiTags('admin:onboarding')
@ApiBearerAuth()
@Controller('admin/onboarding/applications')
@UseInterceptors(AuditInterceptor)
export class OnboardingAdminController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly documents: DocumentsService,
  ) {}

  @Get()
  @RequirePermissions('shops.view')
  @ApiOperation({
    summary: 'Review queue',
    description:
      'Defaults to everything still actionable (submitted, under review, changes requested), oldest submission first. Rows carry no KYC — the account number is masked and the applicant’s account phone is not returned.',
  })
  queue(@Query() query: ReviewQueueQueryDto) {
    return this.onboarding.queue(query);
  }

  @Get(':applicationId')
  @RequirePermissions('shops.view')
  @ApiOperation({
    summary: 'Full application for review',
    description:
      'Includes the KYC and payout details needed to check the uploaded documents, the internal reviewer note, and the timeline with internal metadata.',
  })
  getForReview(@Param('applicationId') applicationId: string) {
    return this.onboarding.getForReview(applicationId);
  }

  @Post(':applicationId/claim')
  @RequirePermissions('shops.approve')
  @Audit('onboarding.application.claim', 'ShopApplication', 'applicationId')
  @ApiOperation({
    summary: 'Pick this application up',
    description:
      'Marks it under review by you so two reviewers do not verify the same person in parallel. Idempotent if you already hold it.',
  })
  claim(@CurrentUser('id') reviewerId: string, @Param('applicationId') applicationId: string) {
    return this.onboarding.claim(reviewerId, applicationId);
  }

  @Post(':applicationId/request-changes')
  @RequirePermissions('shops.reject')
  @Audit('onboarding.application.request_changes', 'ShopApplication', 'applicationId')
  @ApiOperation({
    summary: 'Hand it back with instructions',
    description:
      '`note` is shown to the applicant verbatim and is required. `internalNote` is never returned to them.',
  })
  requestChanges(
    @CurrentUser('id') reviewerId: string,
    @Param('applicationId') applicationId: string,
    @Body() dto: RequestChangesDto,
  ) {
    return this.onboarding.requestChanges(reviewerId, applicationId, dto);
  }

  @Post(':applicationId/approve')
  @RequirePermissions('shops.approve')
  @Audit('onboarding.application.approve', 'ShopApplication', 'applicationId')
  @ApiOperation({
    summary: 'Approve, creating the shop and its Owner membership',
    description:
      'One transaction: claim the application, create the shop, grant the applicant the Owner role, back-link the two. Safe to retry — a second call returns the same shop.',
  })
  approve(
    @CurrentUser('id') reviewerId: string,
    @Param('applicationId') applicationId: string,
    @Body() dto: ApproveApplicationDto,
  ) {
    return this.onboarding.approve(reviewerId, applicationId, dto);
  }

  @Post(':applicationId/reject')
  @RequirePermissions('shops.reject')
  @Audit('onboarding.application.reject', 'ShopApplication', 'applicationId')
  @ApiOperation({
    summary: 'Reject',
    description:
      'Requires a reason, shown to the applicant verbatim. Not a ban: they may start a new application.',
  })
  reject(
    @CurrentUser('id') reviewerId: string,
    @Param('applicationId') applicationId: string,
    @Body() dto: RejectApplicationDto,
  ) {
    return this.onboarding.reject(reviewerId, applicationId, dto);
  }

  // ── documents ──────────────────────────────────────────────────────────────

  /**
   * The scan itself. `shops.view`, the same key as reading the application, on the
   * grounds that a reviewer who cannot open the citizenship photo cannot review
   * anything — and the queue row it hangs off already told them the person's name.
   *
   * There is no `@Audit` decorator here on purpose. The interceptor records
   * *after* a handler succeeds and keeps only `{ id, status, code }` of the result,
   * which for a `@Res` handler is nothing at all. `DocumentsService` writes the
   * entry itself, before the bytes are read, and includes which document of which
   * application was opened.
   */
  @Get(':applicationId/documents/:documentId/file')
  @RequirePermissions('shops.view')
  @ApiOperation({
    summary: 'Open a submitted document',
    description:
      'Private: served only through this endpoint, never from a public URL. Every read is written to the audit log with the reviewer, the document and the calling address.',
  })
  async downloadDocument(
    @CurrentUser('id') reviewerId: string,
    @Param('applicationId') applicationId: string,
    @Param('documentId') documentId: string,
    @Ip() ip: string,
    @Res() res: Response,
  ): Promise<void> {
    sendDocument(res, await this.documents.downloadForReview(reviewerId, applicationId, documentId, ip));
  }

  /**
   * Accept or reject one document. `shops.approve`, because accepting a document
   * is a step towards approving the shop, and a rejection is what sends the
   * applicant back with something specific to fix.
   */
  @Post(':applicationId/documents/:documentId/review')
  @RequirePermissions('shops.approve')
  @Audit('onboarding.document.review', 'ShopDocument', 'documentId')
  @ApiOperation({
    summary: 'Record a verdict on one document',
    description:
      'A rejected document stops counting towards the required set, so the applicant cannot resubmit until it is replaced. Rejecting requires a note, shown to them verbatim.',
  })
  reviewDocument(
    @CurrentUser('id') reviewerId: string,
    @Param('applicationId') applicationId: string,
    @Param('documentId') documentId: string,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.documents.review(reviewerId, applicationId, documentId, dto);
  }
}

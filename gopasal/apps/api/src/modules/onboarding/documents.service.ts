import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ShopDocument, ShopDocumentKind } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { UploadedFile } from '../uploads/uploaded-file';
import { UploadsService } from '../uploads/uploads.service';
import {
  MAX_DOCUMENTS_PER_APPLICATION,
  canEdit,
  humanStatus,
  isSingleInstanceKind,
} from './application-state';
import { toDocumentView, type DocumentView } from './document-view';
import type { ReviewDocumentDto, UploadDocumentDto } from './dto/documents.dto';

/** What a download handler needs to write a response, and nothing more. */
export interface DocumentDownload {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

/** Human-readable document names for the applicant's timeline. */
const KIND_LABEL: Record<ShopDocumentKind, string> = {
  CITIZENSHIP_FRONT: 'citizenship (front)',
  CITIZENSHIP_BACK: 'citizenship (back)',
  PAN_CERTIFICATE: 'PAN certificate',
  VAT_CERTIFICATE: 'VAT certificate',
  BUSINESS_LICENCE: 'business registration certificate',
  REGULATORY_LICENCE: 'sector regulator licence',
  SHOP_PHOTO: 'shop photo',
  OWNER_PHOTO: 'owner photo',
  BANK_PROOF: 'bank proof',
  OTHER: 'document',
};

/**
 * Documents attached to a seller application: the KYC path.
 *
 * Three rules govern this file.
 *
 * Ownership is a `where` clause, never an `if`. Every applicant-facing method
 * loads the document by its id *and* its application id *and* the applicant id in
 * one query, so "not yours" and "does not exist" are the same 404 — an endpoint
 * that answered differently would let one seller enumerate another's paperwork.
 *
 * Bytes and rows are kept consistent in one direction only. An object is written
 * before the row that names it, and an object is deleted only after the row that
 * named it is gone. A crash therefore leaves an unreferenced file (invisible,
 * reclaimable) rather than a row pointing at nothing (a document a reviewer cannot
 * open and cannot explain).
 *
 * Nothing here returns a storage key. `toDocumentView` is the only serialiser.
 */
@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
    private readonly audit: AuditService,
  ) {}

  // ── applicant ──────────────────────────────────────────────────────────────

  /**
   * Attach a file to an application, replacing what was there for every kind but
   * `OTHER`.
   *
   * The order of operations is the interesting part. Ownership and editability are
   * checked first, so an unauthorised caller never reaches the storage provider at
   * all; then the bytes are validated and written; then the row is created and any
   * superseded row deleted, in one transaction. Only after that transaction commits
   * are the superseded *bytes* removed — and if the transaction fails, the object
   * just written is removed instead, so a rejected upload leaves nothing behind.
   */
  async upload(
    userId: string,
    applicationId: string,
    dto: UploadDocumentDto,
    file: UploadedFile | undefined,
  ): Promise<DocumentView> {
    const app = await this.editableOrThrow(userId, applicationId);

    const existing = await this.prisma.shopDocument.findMany({
      where: { applicationId: app.id },
      select: { id: true, kind: true, storageKey: true },
    });
    const superseded = isSingleInstanceKind(dto.kind)
      ? existing.filter((doc) => doc.kind === dto.kind)
      : [];
    // The cap counts what will remain, so re-taking a photo is never blocked by it.
    if (existing.length - superseded.length >= MAX_DOCUMENTS_PER_APPLICATION) {
      throw new ConflictException(
        `An application can carry ${MAX_DOCUMENTS_PER_APPLICATION} documents. ` +
          'Remove one you no longer need before adding another.',
      );
    }

    const stored = await this.uploads.storeApplicationDocument(app.id, file);

    let created: ShopDocument;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        if (superseded.length > 0) {
          await tx.shopDocument.deleteMany({ where: { id: { in: superseded.map((d) => d.id) } } });
        }
        const row = await tx.shopDocument.create({
          data: {
            applicationId: app.id,
            kind: dto.kind,
            storageKey: stored.key,
            fileName: stored.displayName,
            mimeType: stored.mime,
            sizeBytes: stored.size,
          },
        });
        await tx.shopApplicationEvent.create({
          data: {
            applicationId: app.id,
            type: superseded.length > 0 ? 'document_replaced' : 'document_uploaded',
            message:
              superseded.length > 0
                ? `Replaced the ${KIND_LABEL[dto.kind]}.`
                : `Uploaded the ${KIND_LABEL[dto.kind]}.`,
            meta: { kind: dto.kind, mime: stored.mime, sizeBytes: stored.size },
            actorId: userId,
          },
        });
        return row;
      });
    } catch (err) {
      // The row never happened, so the object has no owner: take it back out
      // rather than leave a KYC scan on disk that nothing references.
      await this.discard(stored.key, 'a failed upload transaction');
      throw err;
    }

    for (const old of superseded) await this.discard(old.storageKey, 'a replaced document');

    await this.audit.record({
      actorId: userId,
      action: superseded.length > 0 ? 'onboarding.document.replace' : 'onboarding.document.upload',
      entityType: 'ShopDocument',
      entityId: created.id,
      surface: 'seller',
      after: { applicationId: app.id, kind: dto.kind, mime: stored.mime, sizeBytes: stored.size },
    });

    return toDocumentView(created);
  }

  /**
   * The applicant's own copy back — the wizard shows what it has on file, and a
   * seller is entitled to see the scan they sent us.
   */
  async downloadMine(
    userId: string,
    applicationId: string,
    documentId: string,
  ): Promise<DocumentDownload> {
    const doc = await this.ownedDocumentOrThrow(userId, applicationId, documentId);
    return this.fetch(doc);
  }

  /**
   * Detach a document and delete its bytes. Allowed only while the application is
   * the applicant's to edit: withdrawing evidence from underneath a reviewer who
   * has the application open would make the queue unreviewable, and a document on
   * an approved application is part of the record of why it was approved.
   */
  async remove(userId: string, applicationId: string, documentId: string): Promise<DocumentView> {
    await this.editableOrThrow(userId, applicationId);
    const doc = await this.ownedDocumentOrThrow(userId, applicationId, documentId);

    await this.prisma.$transaction(async (tx) => {
      await tx.shopDocument.delete({ where: { id: doc.id } });
      await tx.shopApplicationEvent.create({
        data: {
          applicationId,
          type: 'document_removed',
          message: `Removed the ${KIND_LABEL[doc.kind]}.`,
          meta: { kind: doc.kind },
          actorId: userId,
        },
      });
    });

    await this.discard(doc.storageKey, 'a removed document');
    await this.audit.record({
      actorId: userId,
      action: 'onboarding.document.remove',
      entityType: 'ShopDocument',
      entityId: doc.id,
      surface: 'seller',
      before: { applicationId, kind: doc.kind },
    });

    return toDocumentView(doc);
  }

  // ── reviewer ───────────────────────────────────────────────────────────────

  /**
   * A document for the person deciding the application. The route above this
   * carries `shops.view`; what this method adds is the audit entry, written
   * *before* the bytes are handed over.
   *
   * Reading somebody's citizenship card is exactly the action that has to be
   * accountable after the fact, and an entry written afterwards would be missing
   * for the case that matters most — a read that crashed, or that was cancelled
   * halfway through a large scan.
   */
  async downloadForReview(
    reviewerId: string,
    applicationId: string,
    documentId: string,
    ip?: string | null,
  ): Promise<DocumentDownload> {
    const doc = await this.documentOrThrow(applicationId, documentId);
    await this.audit.record({
      actorId: reviewerId,
      action: 'onboarding.document.view',
      entityType: 'ShopDocument',
      entityId: doc.id,
      surface: 'admin',
      ip,
      after: { applicationId, kind: doc.kind },
    });
    return this.fetch(doc);
  }

  /**
   * Accept or reject one document. A rejection needs a reason, because a rejected
   * document stops satisfying its requirement: the applicant will be told to fix
   * it, and "fix it" with no explanation is how an application dies in the queue.
   *
   * The verdict is per-document and independent of the application's status, so a
   * reviewer can work through the paperwork before deciding the application itself.
   */
  async review(
    reviewerId: string,
    applicationId: string,
    documentId: string,
    dto: ReviewDocumentDto,
  ): Promise<DocumentView> {
    const doc = await this.documentOrThrow(applicationId, documentId);
    const note = dto.note?.trim() ?? '';
    if (dto.decision === 'REJECTED' && note === '') {
      throw new BadRequestException(
        'Say why the document was rejected — the applicant is shown this note and has to act on it.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.shopDocument.update({
        where: { id: doc.id },
        data: { review: dto.decision, reviewNote: note === '' ? null : note },
      });
      await tx.shopApplicationEvent.create({
        data: {
          applicationId,
          type: dto.decision === 'ACCEPTED' ? 'document_accepted' : 'document_rejected',
          message:
            dto.decision === 'ACCEPTED'
              ? `The ${KIND_LABEL[doc.kind]} was accepted.`
              : `The ${KIND_LABEL[doc.kind]} was not accepted: ${note}`,
          meta: { kind: doc.kind, decision: dto.decision },
          actorId: reviewerId,
        },
      });
      return row;
    });

    await this.audit.record({
      actorId: reviewerId,
      action: `onboarding.document.${dto.decision === 'ACCEPTED' ? 'accept' : 'reject'}`,
      entityType: 'ShopDocument',
      entityId: doc.id,
      surface: 'admin',
      before: { review: doc.review },
      after: { applicationId, kind: doc.kind, review: dto.decision },
    });

    return toDocumentView(updated);
  }

  // ── lookups ────────────────────────────────────────────────────────────────

  /**
   * The application, proven to be this user's and proven to be open for edits.
   * Both facts in one query: a read-then-check would let a reviewer's
   * `request_changes` land in between and change the answer.
   */
  private async editableOrThrow(userId: string, applicationId: string) {
    const app = await this.prisma.shopApplication.findFirst({
      where: { id: applicationId, applicantId: userId },
      select: { id: true, status: true },
    });
    // Not theirs and not existing are the same answer on purpose: the difference
    // would turn this route into a way of testing whether a reference is real.
    if (!app) throw new NotFoundException('Application not found');
    if (!canEdit(app.status)) {
      throw new ConflictException(
        `This application is ${humanStatus(app.status)}, so its documents cannot be changed right now.`,
      );
    }
    return app;
  }

  /** One document, scoped to its application *and* to the applicant who owns it. */
  private async ownedDocumentOrThrow(
    userId: string,
    applicationId: string,
    documentId: string,
  ): Promise<ShopDocument> {
    const doc = await this.prisma.shopDocument.findFirst({
      where: { id: documentId, applicationId, application: { applicantId: userId } },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  /**
   * One document, scoped to its application but not to an applicant — the
   * reviewer's lookup. The application id is still part of the predicate so a
   * document id from one application cannot be read through another's URL, which
   * keeps the audit entry's `applicationId` true rather than merely plausible.
   */
  private async documentOrThrow(applicationId: string, documentId: string): Promise<ShopDocument> {
    const doc = await this.prisma.shopDocument.findFirst({
      where: { id: documentId, applicationId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  /**
   * The bytes, with the two headers a download needs. `mimeType` falls back to
   * `application/octet-stream` for rows written before the type was recorded:
   * serving a document as a type we are not sure of is how a browser gets talked
   * into rendering something.
   */
  private async fetch(doc: ShopDocument): Promise<DocumentDownload> {
    const buffer = await this.uploads.read(doc.storageKey);
    return {
      buffer,
      mimeType: doc.mimeType ?? 'application/octet-stream',
      fileName: doc.fileName ?? `${doc.kind.toLowerCase()}-${doc.id}`,
    };
  }

  /**
   * Delete an object that no row points at any more. Best-effort by design: the
   * database is already consistent by the time this runs, and a storage provider
   * having a bad minute must not turn a successful upload into a 500. What it
   * leaves behind is an unreferenced file, and the log line names it.
   */
  private async discard(key: string, why: string): Promise<void> {
    try {
      await this.uploads.remove(key);
    } catch (err) {
      this.logger.warn(
        `Could not delete ${key} after ${why}: ${(err as Error).message}. The object is now unreferenced.`,
      );
    }
  }
}

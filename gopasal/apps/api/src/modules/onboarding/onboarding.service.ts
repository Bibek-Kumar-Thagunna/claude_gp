import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, type ApplicationStatus, type PayoutMethod, type ShopApplication } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { paginate } from '../../common/dto/pagination.dto';
import {
  EVENTS,
  type ApplicationApprovedEvent,
  type ApplicationChangesRequestedEvent,
  type ApplicationClaimedEvent,
  type ApplicationRejectedEvent,
  type ApplicationSubmittedEvent,
  type ApplicationWithdrawnEvent,
} from '../../common/events';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { JsonObject } from '../../common/types/json';
import { ShopsService } from '../catalog/shops.service';
import { maskPhone } from '../invites/invites.service';
import { PolicyService } from '../policy/policy.service';
import {
  DECIDABLE_STATUSES,
  EDITABLE_STATUSES,
  OPEN_STATUSES,
  REVIEWABLE_STATUSES,
  TRANSITIONS,
  canEdit,
  checkTransition,
  humanStatus,
  isOpen,
  missingDocuments,
  missingForSubmit,
  type ApplicationAction,
} from './application-state';
import { toDocumentView } from './document-view';
import type {
  ApplicationFieldsDto,
  ApproveApplicationDto,
  CreateApplicationDto,
  RejectApplicationDto,
  RequestChangesDto,
  ReviewQueueQueryDto,
  SubmitApplicationDto,
  UpdateApplicationDto,
  WithdrawApplicationDto,
} from './dto/onboarding.dto';

/** Same alphabet as ticket/group codes: no O/I/1/0 to confuse over the phone. */
const referenceCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

/**
 * What an applicant's own view needs: their documents, their timeline, the
 * category they chose and the shop if they got one. Deliberately no
 * `reviewedBy` — an applicant is told what GoPasal decided, not which member
 * of staff decided it.
 */
const APPLICATION_INCLUDE = {
  documents: { orderBy: { createdAt: 'asc' } },
  events: { orderBy: { createdAt: 'asc' } },
  category: { select: { id: true, slug: true, en: true, np: true } },
  shop: { select: { id: true, slug: true, name: true, status: true } },
} satisfies Prisma.ShopApplicationInclude;

type LoadedApplication = Prisma.ShopApplicationGetPayload<{ include: typeof APPLICATION_INCLUDE }>;

/** The reviewer additionally sees who the applicant is and who has it open. */
const REVIEW_INCLUDE = {
  ...APPLICATION_INCLUDE,
  applicant: { select: { id: true, name: true, phone: true, email: true, createdAt: true } },
  reviewedBy: { select: { id: true, name: true } },
} satisfies Prisma.ShopApplicationInclude;

type ReviewApplication = Prisma.ShopApplicationGetPayload<{ include: typeof REVIEW_INCLUDE }>;

/**
 * The queue is a browsed, often screen-shared list, so it carries no KYC at
 * all: no citizenship number, no full account number, no account phone. What a
 * reviewer needs to *decide* lives behind the detail route instead.
 */
const QUEUE_SELECT = {
  id: true,
  reference: true,
  status: true,
  shopName: true,
  area: true,
  contactPhone: true,
  payoutMethod: true,
  bankAccountNo: true,
  submittedAt: true,
  submitCount: true,
  createdAt: true,
  updatedAt: true,
  applicant: { select: { id: true, name: true, phone: true } },
  reviewedBy: { select: { id: true, name: true } },
  category: { select: { id: true, en: true, np: true } },
  _count: { select: { documents: true } },
} satisfies Prisma.ShopApplicationSelect;

type QueueRow = Prisma.ShopApplicationGetPayload<{ select: typeof QUEUE_SELECT }>;

/**
 * Exactly the columns an applicant may write, in the shape Prisma accepts for
 * both `create` and `update`: a value, `null` to clear an optional field, or
 * `undefined` to leave it alone. Declared by hand rather than derived from a
 * Prisma input type because the two operations' generated types differ, and
 * spelled out in full because this is the allow-list that stops a caller from
 * posting `status: 'APPROVED'`.
 */
interface WritableApplicationData {
  shopName?: string | null;
  shopNameNp?: string | null;
  categoryId?: string | null;
  description?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  area?: string | null;
  fullAddress?: string | null;
  lat?: number | null;
  lng?: number | null;
  deliveryRadiusKm?: number;
  hours?: string | null;
  soloMode?: boolean;
  ownerName?: string | null;
  ownerNameNp?: string | null;
  citizenshipNo?: string | null;
  registrationNo?: string | null;
  panNo?: string | null;
  vatNo?: string | null;
  payoutMethod?: PayoutMethod | null;
  bankName?: string | null;
  bankBranch?: string | null;
  bankAccountNo?: string | null;
  bankAccountName?: string | null;
  walletNumber?: string | null;
}

/** True when Prisma refused a write because `field` is already taken. */
function isUniqueViolation(err: unknown, field: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  const target = err.meta?.target;
  if (typeof target === 'string') return target.includes(field);
  if (Array.isArray(target)) return target.some((t) => typeof t === 'string' && t.includes(field));
  return false;
}

/** Last four digits only — enough to recognise an account, not to use one. */
function maskAccount(value: string | null): string | null {
  if (!value) return value;
  const trimmed = value.trim();
  if (trimmed.length <= 4) return '•'.repeat(trimmed.length);
  return `${'•'.repeat(Math.min(8, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

/**
 * `changesRequested` is written by this service as `{ fields, at }`, but it is a
 * Json column, so it is read back defensively rather than trusted.
 */
function readRequestedFields(value: Prisma.JsonValue | null): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const fields = value.fields;
  if (!Array.isArray(fields)) return [];
  return fields.filter((f): f is string => typeof f === 'string');
}

/**
 * An empty text input means "clear this", not "store an empty string" — the
 * completeness check and every downstream consumer test for null.
 */
function blankToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * DTO → column payload. The mapping is written out field by field on purpose:
 * this function is the only door between request input and the row, so it should
 * be readable as an allow-list, and a key-looping version would need a cast to
 * satisfy the compiler.
 */
function writableFields(dto: ApplicationFieldsDto): WritableApplicationData {
  return {
    shopName: blankToNull(dto.shopName),
    shopNameNp: blankToNull(dto.shopNameNp),
    categoryId: blankToNull(dto.categoryId),
    description: blankToNull(dto.description),
    contactPhone: blankToNull(dto.contactPhone),
    contactEmail: blankToNull(dto.contactEmail),
    area: blankToNull(dto.area),
    fullAddress: blankToNull(dto.fullAddress),
    lat: dto.lat,
    lng: dto.lng,
    deliveryRadiusKm: dto.deliveryRadiusKm,
    hours: blankToNull(dto.hours),
    soloMode: dto.soloMode,
    ownerName: blankToNull(dto.ownerName),
    ownerNameNp: blankToNull(dto.ownerNameNp),
    citizenshipNo: blankToNull(dto.citizenshipNo),
    registrationNo: blankToNull(dto.registrationNo),
    panNo: blankToNull(dto.panNo),
    vatNo: blankToNull(dto.vatNo),
    payoutMethod: dto.payoutMethod,
    bankName: blankToNull(dto.bankName),
    bankBranch: blankToNull(dto.bankBranch),
    bankAccountNo: blankToNull(dto.bankAccountNo),
    bankAccountName: blankToNull(dto.bankAccountName),
    walletNumber: blankToNull(dto.walletNumber),
  };
}

/**
 * Seller onboarding: an applicant fills in an application, GoPasal reviews it,
 * and a Shop exists only because a reviewer approved one.
 *
 * Two rules hold this file together. Status is written in exactly two places —
 * `applyTransition` and the approval claim — both guarded by the state machine
 * in `application-state.ts`. And the applicant view and the reviewer view are
 * built by separate projections, so KYC cannot leak by someone adding a field
 * to a shared serialiser.
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shops: ShopsService,
    private readonly policy: PolicyService,
    private readonly events: EventEmitter2,
  ) {}

  // ── applicant ──────────────────────────────────────────────────────────────

  /**
   * Start an application, or resume the one already in progress. Resuming
   * rather than creating a second row is deliberate: a seller who taps "become
   * a seller" twice should land back in their own wizard, and a reviewer should
   * never have to guess which of two open applications is the real one.
   */
  async apply(userId: string, dto: CreateApplicationDto) {
    const open = await this.prisma.shopApplication.findFirst({
      where: { applicantId: userId, status: { in: [...OPEN_STATUSES] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, reference: true, status: true },
    });

    if (open) {
      if (!canEdit(open.status)) {
        throw new ConflictException(
          `Application ${open.reference} is ${humanStatus(open.status)}, so it cannot be changed right now.`,
        );
      }
      return this.patch(userId, open.id, dto);
    }

    const created = await this.createWithReference(userId, dto);
    return this.getMine(userId, created.id);
  }

  /**
   * `reference` is unique and generated, not derived, so a collision is possible
   * however unlikely. Retrying on P2002 is cheaper and more honest than
   * pretending six random characters can never repeat.
   */
  private async createWithReference(
    userId: string,
    dto: CreateApplicationDto,
  ): Promise<ShopApplication> {
    const fields = writableFields(dto);
    for (let attempt = 0; attempt < 5; attempt++) {
      const reference = `GP-${referenceCode()}`;
      try {
        return await this.prisma.$transaction(async (tx) => {
          const application = await tx.shopApplication.create({
            data: { ...fields, reference, applicantId: userId },
          });
          await tx.shopApplicationEvent.create({
            data: {
              applicationId: application.id,
              type: 'created',
              message: 'Application started.',
              actorId: userId,
            },
          });
          return application;
        });
      } catch (err) {
        if (isUniqueViolation(err, 'reference') && attempt < 4) continue;
        throw err;
      }
    }
    // Unreachable: the loop either returns or rethrows on the final attempt.
    throw new ConflictException('Could not allocate an application reference. Please try again.');
  }

  /**
   * Save progress. Ownership and editability are one `updateMany` predicate
   * rather than a read-then-write: two taps on "save" while a reviewer is
   * requesting changes must not race into an application that is no longer the
   * applicant's to edit.
   */
  async patch(userId: string, applicationId: string, dto: UpdateApplicationDto) {
    const result = await this.prisma.shopApplication.updateMany({
      where: { id: applicationId, applicantId: userId, status: { in: [...EDITABLE_STATUSES] } },
      data: writableFields(dto),
    });

    if (result.count === 0) await this.explainFailedEdit(userId, applicationId);
    return this.getMine(userId, applicationId);
  }

  /**
   * Why a scoped `updateMany` matched nothing: either it is not theirs (or does
   * not exist — indistinguishable on purpose, so the endpoint cannot be used to
   * probe for references) or it is not editable in its current status.
   */
  private async explainFailedEdit(userId: string, applicationId: string): Promise<never> {
    const app = await this.prisma.shopApplication.findFirst({
      where: { id: applicationId, applicantId: userId },
      select: { status: true },
    });
    if (!app) throw new NotFoundException('Application not found');
    throw new ConflictException(
      `This application is ${humanStatus(app.status)} and cannot be edited right now.`,
    );
  }

  /** Every application this person has ever filed, newest first. */
  async listMine(userId: string) {
    const rows = await this.prisma.shopApplication.findMany({
      where: { applicantId: userId },
      orderBy: { createdAt: 'desc' },
      include: APPLICATION_INCLUDE,
    });
    return { data: rows.map((row) => this.toApplicantView(row)) };
  }

  /**
   * What the wizard asks for on load: the open application if there is one.
   * `null` rather than a 404 — "you have no application" is a normal answer.
   */
  async current(userId: string) {
    const row = await this.prisma.shopApplication.findFirst({
      where: { applicantId: userId, status: { in: [...OPEN_STATUSES] } },
      orderBy: { createdAt: 'desc' },
      include: APPLICATION_INCLUDE,
    });
    return { application: row ? this.toApplicantView(row) : null };
  }

  async getMine(userId: string, applicationId: string) {
    const row = await this.prisma.shopApplication.findFirst({
      where: { id: applicationId, applicantId: userId },
      include: APPLICATION_INCLUDE,
    });
    if (!row) throw new NotFoundException('Application not found');
    return this.toApplicantView(row);
  }

  /** The row itself, scoped to its owner. Used by the mutating paths. */
  private async ownedOrThrow(userId: string, applicationId: string): Promise<ShopApplication> {
    const row = await this.prisma.shopApplication.findFirst({
      where: { id: applicationId, applicantId: userId },
    });
    if (!row) throw new NotFoundException('Application not found');
    return row;
  }

  /**
   * The one place that moves an application from one status to another (approval
   * uses the same guard, expressed as its own claim inside a larger
   * transaction). The check is applied twice on purpose: once against the row we
   * read, for a clear message, and once as the `where` clause of the write, so
   * two reviewers pressing different buttons at the same moment cannot both win.
   */
  private async applyTransition(args: {
    applicationId: string;
    action: ApplicationAction;
    from: ApplicationStatus;
    data?: Prisma.ShopApplicationUncheckedUpdateManyInput;
    event?: { message?: string; meta?: JsonObject; actorId?: string };
  }): Promise<ShopApplication> {
    const verdict = checkTransition(args.from, args.action);
    if (!verdict.allowed) throw new ConflictException(verdict.reason);
    const def = TRANSITIONS[args.action];

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.shopApplication.updateMany({
        where: { id: args.applicationId, status: { in: [...def.from] } },
        data: { ...args.data, status: verdict.to },
      });

      if (claimed.count === 0) {
        const now = await tx.shopApplication.findUnique({
          where: { id: args.applicationId },
          select: { status: true },
        });
        if (!now) throw new NotFoundException('Application not found');
        throw new ConflictException(`${def.refusal} (it is currently ${humanStatus(now.status)}.)`);
      }

      await tx.shopApplicationEvent.create({
        data: {
          applicationId: args.applicationId,
          type: verdict.event,
          message: args.event?.message,
          meta: args.event?.meta,
          actorId: args.event?.actorId,
        },
      });

      return tx.shopApplication.findUniqueOrThrow({ where: { id: args.applicationId } });
    });
  }

  /**
   * Submit, or resubmit after changes were requested — the same endpoint, because
   * to the applicant it is the same button. Terms acceptance is stamped here
   * rather than at create time so the version recorded is the one in force when
   * they actually agreed.
   */
  async submit(userId: string, applicationId: string, dto: SubmitApplicationDto) {
    const app = await this.ownedOrThrow(userId, applicationId);
    if (!canEdit(app.status)) {
      throw new ConflictException(
        `This application is ${humanStatus(app.status)}, so there is nothing to submit.`,
      );
    }

    const missing = missingForSubmit(app);
    // Attached documents are checked in the same breath as the typed fields, and
    // reported in the same error, because to the applicant they are one wizard
    // and being told about the empty fields first and the missing citizenship
    // photo on the next attempt is two round trips for one mistake.
    const attached = await this.prisma.shopDocument.findMany({
      where: { applicationId },
      select: { kind: true, review: true },
      orderBy: { createdAt: 'asc' },
    });
    const missingDocs = missingDocuments({ payoutMethod: app.payoutMethod, documents: attached });

    if (missing.length > 0 || missingDocs.length > 0) {
      throw new BadRequestException({
        message:
          missing.length > 0 && missingDocs.length > 0
            ? 'Some required details and documents are still missing.'
            : missing.length > 0
              ? 'Some required details are still missing.'
              : 'Some required documents are still missing.',
        missing,
        missingDocuments: missingDocs,
      });
    }

    const terms = await this.currentTerms();
    const action: ApplicationAction = app.status === 'CHANGES_REQUESTED' ? 'resubmit' : 'submit';
    const resubmission = action === 'resubmit';

    const updated = await this.applyTransition({
      applicationId,
      action,
      from: app.status,
      data: {
        submittedAt: new Date(),
        submitCount: { increment: 1 },
        acceptedTermsAt: new Date(),
        acceptedTermsVersion: terms.version,
        // The previous change request is answered by this submission.
        changesRequested: Prisma.DbNull,
      },
      event: {
        message: resubmission
          ? 'Resubmitted for review.'
          : 'Submitted to GoPasal for review.',
        // The kinds, not a count: a reviewer reading the timeline of a
        // resubmission wants to know *what* was attached this time round, and a
        // bare number cannot answer that.
        meta: {
          documents: attached.map((doc) => doc.kind),
          termsVersion: terms.version,
          note: dto.note ?? null,
        },
        actorId: userId,
      },
    });

    // Consent lives with every other consent this person has given, so the
    // seller terms are recorded through the same acceptance table as the rest.
    await this.policy.accept(userId, terms.id);

    this.events.emit(EVENTS.APPLICATION_SUBMITTED, {
      applicationId: updated.id,
      reference: updated.reference,
      applicantId: userId,
      shopName: updated.shopName ?? updated.reference,
      area: updated.area ?? undefined,
      submitCount: updated.submitCount,
      resubmission,
    } satisfies ApplicationSubmittedEvent);

    return this.getMine(userId, applicationId);
  }

  /**
   * The published terms an applicant is agreeing to. A missing published policy
   * is a deployment problem, not a bad request from the applicant, so it is
   * translated into a message that says so instead of a bare 404.
   */
  private async currentTerms() {
    try {
      return await this.policy.current('terms');
    } catch (err) {
      if (err instanceof NotFoundException) {
        this.logger.error('No published "terms" policy — seller submissions are blocked.');
        throw new BadRequestException(
          'Seller terms are not published yet, so applications cannot be submitted. Please contact support.',
        );
      }
      throw err;
    }
  }

  /** Withdrawing is final: the record stays, but a new attempt is a new application. */
  async withdraw(userId: string, applicationId: string, dto: WithdrawApplicationDto) {
    const app = await this.ownedOrThrow(userId, applicationId);
    const reason = blankToNull(dto.reason) ?? undefined;

    const updated = await this.applyTransition({
      applicationId,
      action: 'withdraw',
      from: app.status,
      event: {
        message: 'Withdrawn by the applicant.',
        meta: { reason: reason ?? null, previousStatus: app.status },
        actorId: userId,
      },
    });

    this.events.emit(EVENTS.APPLICATION_WITHDRAWN, {
      applicationId: updated.id,
      reference: updated.reference,
      applicantId: userId,
      reviewerId: app.reviewedById ?? undefined,
      reason,
    } satisfies ApplicationWithdrawnEvent);

    return this.getMine(userId, applicationId);
  }

  // ── reviewer ───────────────────────────────────────────────────────────────

  /**
   * The review queue. Oldest submission first: onboarding is a queue people are
   * waiting in, and sorting by anything else is how an application sits for a
   * fortnight. Rows carry no KYC — see `QUEUE_SELECT`.
   */
  async queue(query: ReviewQueueQueryDto) {
    const requested = query.status ?? 'OPEN';
    const statusWhere: Prisma.ShopApplicationWhereInput =
      requested === 'ALL'
        ? {}
        : requested === 'OPEN'
          ? { status: { in: [...REVIEWABLE_STATUSES] } }
          : { status: requested };

    const search = query.q?.trim();
    const where: Prisma.ShopApplicationWhereInput = {
      ...statusWhere,
      ...(query.reviewerId ? { reviewedById: query.reviewerId } : {}),
      ...(search
        ? {
            OR: [
              { reference: { contains: search, mode: 'insensitive' } },
              { shopName: { contains: search, mode: 'insensitive' } },
              { area: { contains: search, mode: 'insensitive' } },
              { contactPhone: { contains: search } },
              { applicant: { phone: { contains: search } } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.shopApplication.findMany({
        where,
        skip: query.skip,
        take: query.limit,
        orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
        select: QUEUE_SELECT,
      }),
      this.prisma.shopApplication.count({ where }),
    ]);

    return paginate(rows.map((row) => this.toQueueRow(row)), total, query.page, query.limit);
  }

  async getForReview(applicationId: string) {
    const row = await this.prisma.shopApplication.findUnique({
      where: { id: applicationId },
      include: REVIEW_INCLUDE,
    });
    if (!row) throw new NotFoundException('Application not found');
    return this.toReviewerView(row);
  }

  /**
   * Pick an application up. Claiming is what stops two reviewers verifying the
   * same citizenship number in parallel, and it is idempotent for the reviewer
   * who already holds it — re-opening the page is not an error.
   */
  async claim(reviewerId: string, applicationId: string) {
    const app = await this.prisma.shopApplication.findUnique({
      where: { id: applicationId },
      select: { id: true, status: true, reference: true, applicantId: true, reviewedById: true },
    });
    if (!app) throw new NotFoundException('Application not found');

    if (app.status === 'UNDER_REVIEW') {
      if (app.reviewedById === reviewerId) return this.getForReview(applicationId);
      throw new ConflictException('Another reviewer already has this application open.');
    }

    await this.applyTransition({
      applicationId,
      action: 'claim',
      from: app.status,
      data: { reviewedById: reviewerId },
      event: { message: 'A GoPasal reviewer is looking at your application.', actorId: reviewerId },
    });

    this.events.emit(EVENTS.APPLICATION_CLAIMED, {
      applicationId: app.id,
      reference: app.reference,
      applicantId: app.applicantId,
      reviewerId,
    } satisfies ApplicationClaimedEvent);

    return this.getForReview(applicationId);
  }

  /**
   * Hand it back to the applicant with instructions. `note` goes to them
   * verbatim; `internalNote` never leaves the reviewer surface — it is stored in
   * `reviewerNote` and preserved on the timeline's internal `meta`.
   */
  async requestChanges(reviewerId: string, applicationId: string, dto: RequestChangesDto) {
    const app = await this.prisma.shopApplication.findUnique({
      where: { id: applicationId },
      select: { id: true, status: true, reference: true, applicantId: true },
    });
    if (!app) throw new NotFoundException('Application not found');

    const note = dto.note.trim();
    const fields = dto.fields ?? [];

    await this.applyTransition({
      applicationId,
      action: 'request_changes',
      from: app.status,
      data: {
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        decisionNote: note,
        reviewerNote: blankToNull(dto.internalNote) ?? undefined,
        // Only field names and a timestamp: this object is serialised straight
        // to the applicant, so it must not carry who asked.
        changesRequested: { fields, at: new Date().toISOString() },
      },
      event: {
        message: note,
        meta: { fields, internalNote: blankToNull(dto.internalNote) ?? null },
        actorId: reviewerId,
      },
    });

    this.events.emit(EVENTS.APPLICATION_CHANGES_REQUESTED, {
      applicationId: app.id,
      reference: app.reference,
      applicantId: app.applicantId,
      reviewerId,
      note,
      fields,
    } satisfies ApplicationChangesRequestedEvent);

    return this.getForReview(applicationId);
  }

  /**
   * Reject. Terminal, but not a ban: the applicant can start a fresh application,
   * and this row survives as the record of what was decided and why.
   */
  async reject(reviewerId: string, applicationId: string, dto: RejectApplicationDto) {
    const app = await this.prisma.shopApplication.findUnique({
      where: { id: applicationId },
      select: { id: true, status: true, reference: true, applicantId: true },
    });
    if (!app) throw new NotFoundException('Application not found');

    const note = dto.note.trim();

    await this.applyTransition({
      applicationId,
      action: 'reject',
      from: app.status,
      data: {
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        decisionNote: note,
        reviewerNote: blankToNull(dto.internalNote) ?? undefined,
      },
      event: {
        message: note,
        meta: { internalNote: blankToNull(dto.internalNote) ?? null },
        actorId: reviewerId,
      },
    });

    this.events.emit(EVENTS.APPLICATION_REJECTED, {
      applicationId: app.id,
      reference: app.reference,
      applicantId: app.applicantId,
      reviewerId,
      note,
    } satisfies ApplicationRejectedEvent);

    return this.getForReview(applicationId);
  }

  /**
   * Approve, and provision the shop.
   *
   * Everything that must be true is checked before the transaction opens, so the
   * transaction itself is short: claim the row, create the shop and the Owner
   * membership, back-link the two, write the event. The claim's `where` clause
   * carries `shopId: null` as well as the decidable statuses, so the unique
   * `shopId` column plus this predicate make a second shop impossible even if two
   * reviewers approve in the same instant or the client retries a timed-out call.
   */
  async approve(reviewerId: string, applicationId: string, dto: ApproveApplicationDto) {
    const app = await this.prisma.shopApplication.findUnique({ where: { id: applicationId } });
    if (!app) throw new NotFoundException('Application not found');

    // A retry of an approval that already landed is a success, not a conflict.
    if (app.status === 'APPROVED' && app.shopId) return this.getForReview(applicationId);

    const verdict = checkTransition(app.status, 'approve');
    if (!verdict.allowed) throw new ConflictException(verdict.reason);

    const missing = missingForSubmit(app);
    if (missing.length > 0) {
      throw new BadRequestException({
        message: 'This application cannot be approved while required details are missing.',
        missing,
      });
    }

    // The same document floor as submission, checked again here because this is
    // the last gate before a shop exists and starts taking money. It is not
    // redundant with the submit check: a reviewer can reject one document and
    // leave the application SUBMITTED, and approving it in that state would
    // create a shop whose citizenship scan the reviewer had just called unusable.
    // The remedy is `request-changes`, which is why this refuses rather than warns.
    const attached = await this.prisma.shopDocument.findMany({
      where: { applicationId },
      select: { kind: true, review: true },
    });
    const missingDocs = missingDocuments({ payoutMethod: app.payoutMethod, documents: attached });
    if (missingDocs.length > 0) {
      throw new BadRequestException({
        message:
          'This application cannot be approved until the required documents are attached and not rejected. ' +
          'Use "request changes" to ask the applicant for them.',
        missingDocuments: missingDocs,
      });
    }

    // `missingForSubmit` already proved this, but the shop's name column is not
    // nullable, so the narrowing has to be visible to the compiler too.
    const shopName = app.shopName?.trim();
    if (!shopName) throw new BadRequestException('The application has no shop name.');

    if (app.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: app.categoryId },
        select: { id: true },
      });
      if (!category) {
        throw new BadRequestException(
          'The category chosen on this application no longer exists. Ask the applicant to pick another.',
        );
      }
    }

    return this.runApproval(reviewerId, app, shopName, dto);
  }

  /**
   * The approval transaction, retried on a slug collision. `uniqueSlug` is
   * advisory — another approval can take the same slug between the lookup and the
   * insert — so P2002 on `slug` means "recompute and try again", and only that.
   */
  private async runApproval(
    reviewerId: string,
    app: ShopApplication,
    shopName: string,
    dto: ApproveApplicationDto,
  ) {
    const note = blankToNull(dto.note) ?? undefined;
    const internalNote = blankToNull(dto.internalNote) ?? undefined;

    for (let attempt = 0; attempt < 3; attempt++) {
      const slug = await this.shops.uniqueSlug(shopName);
      try {
        const shop = await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.shopApplication.updateMany({
            where: {
              id: app.id,
              status: { in: [...DECIDABLE_STATUSES] },
              shopId: null,
            },
            data: {
              status: 'APPROVED',
              reviewedAt: new Date(),
              reviewedById: reviewerId,
              decisionNote: note,
              reviewerNote: internalNote,
            },
          });
          if (claimed.count === 0) return null;

          const created = await this.shops.provisionApprovedShop(
            tx,
            app.applicantId,
            {
              name: shopName,
              nameNp: app.shopNameNp ?? undefined,
              description: app.description ?? undefined,
              categoryId: app.categoryId ?? undefined,
              phone: app.contactPhone ?? undefined,
              area: app.area ?? undefined,
              fullAddress: app.fullAddress ?? undefined,
              lat: app.lat ?? undefined,
              lng: app.lng ?? undefined,
              deliveryRadiusKm: app.deliveryRadiusKm,
              hours: app.hours ?? undefined,
              soloMode: app.soloMode,
            },
            slug,
          );

          await tx.shopApplication.update({
            where: { id: app.id },
            data: { shopId: created.id },
          });

          await tx.shopApplicationEvent.create({
            data: {
              applicationId: app.id,
              type: 'approved',
              message: note ?? 'Approved. Your shop is live on GoPasal.',
              meta: { shopId: created.id, slug: created.slug, internalNote: internalNote ?? null },
              actorId: reviewerId,
            },
          });

          return created;
        });

        if (!shop) return this.settleLostApproval(app.id);

        this.events.emit(EVENTS.APPLICATION_APPROVED, {
          applicationId: app.id,
          reference: app.reference,
          applicantId: app.applicantId,
          reviewerId,
          shopId: shop.id,
          shopName: shop.name,
          shopSlug: shop.slug,
          note,
        } satisfies ApplicationApprovedEvent);

        return this.getForReview(app.id);
      } catch (err) {
        if (isUniqueViolation(err, 'slug')) {
          if (attempt < 2) {
            this.logger.warn(`slug "${slug}" was taken mid-approval; retrying with a new one`);
            continue;
          }
          // Three losses in a row is not a slug problem any more, so the reviewer
          // gets a 409 they can act on rather than the raw Prisma error as a 500.
          this.logger.error(
            `could not allocate a unique slug for "${shopName}" after 3 attempts; last tried "${slug}"`,
          );
          throw new ConflictException(
            'Could not allocate a storefront address for this shop. Please try again.',
          );
        }
        throw err;
      }
    }

    // Unreachable: every path inside the loop returns or throws. Present because
    // the compiler cannot see that, and a silent `undefined` would be worse.
    throw new ConflictException(
      'Could not allocate a storefront address for this shop. Please try again.',
    );
  }

  /**
   * The claim matched nothing, so somebody else decided this application while we
   * were reading it. If they approved it, the caller's intent is already
   * satisfied and they get the same payload a winner would; anything else is a
   * genuine conflict.
   */
  private async settleLostApproval(applicationId: string) {
    const now = await this.prisma.shopApplication.findUnique({
      where: { id: applicationId },
      select: { status: true, shopId: true },
    });
    if (!now) throw new NotFoundException('Application not found');
    if (now.status === 'APPROVED' && now.shopId) return this.getForReview(applicationId);
    throw new ConflictException(
      `${TRANSITIONS.approve.refusal} (it is currently ${humanStatus(now.status)}.)`,
    );
  }

  // ── projections ────────────────────────────────────────────────────────────
  //
  // The applicant view and the reviewer view are built separately and neither is
  // a spread of the row. That is the mechanism preventing a future field — a
  // reviewer's note, a storage key — from reaching the wrong audience because
  // somebody added a column.

  /** Shop identity + service area. Identical in both detail views. */
  private shopFields(app: ShopApplication) {
    return {
      shopName: app.shopName,
      shopNameNp: app.shopNameNp,
      categoryId: app.categoryId,
      description: app.description,
      contactPhone: app.contactPhone,
      contactEmail: app.contactEmail,
      area: app.area,
      fullAddress: app.fullAddress,
      lat: app.lat,
      lng: app.lng,
      deliveryRadiusKm: app.deliveryRadiusKm,
      hours: app.hours,
      soloMode: app.soloMode,
    };
  }

  /** The person and their papers. Reviewer-visible; also echoed back to the applicant who typed it. */
  private ownerFields(app: ShopApplication) {
    return {
      ownerName: app.ownerName,
      ownerNameNp: app.ownerNameNp,
      citizenshipNo: app.citizenshipNo,
      registrationNo: app.registrationNo,
      panNo: app.panNo,
      vatNo: app.vatNo,
    };
  }

  /** Payout details in full. Only ever nested inside a detail view. */
  private payoutFields(app: ShopApplication) {
    return {
      payoutMethod: app.payoutMethod,
      bankName: app.bankName,
      bankBranch: app.bankBranch,
      bankAccountNo: app.bankAccountNo,
      bankAccountName: app.bankAccountName,
      walletNumber: app.walletNumber,
    };
  }

  /**
   * What the applicant gets back. Their own answers, GoPasal's decision in plain
   * language, and the timeline — with no `reviewerNote`, no event `meta`, no
   * reviewer identity and no document storage key.
   */
  private toApplicantView(app: LoadedApplication) {
    return {
      id: app.id,
      reference: app.reference,
      status: app.status,
      statusLabel: humanStatus(app.status),
      canEdit: canEdit(app.status),
      isOpen: isOpen(app.status),
      /** Empty once it is submittable — the wizard uses it to mark unfinished steps. */
      missing: missingForSubmit(app),
      /** The same idea for attachments: which required kinds are not yet usable. */
      missingDocuments: missingDocuments(app),
      ...this.shopFields(app),
      ...this.ownerFields(app),
      ...this.payoutFields(app),
      category: app.category,
      terms: { acceptedAt: app.acceptedTermsAt, version: app.acceptedTermsVersion },
      review: {
        submittedAt: app.submittedAt,
        decidedAt: app.reviewedAt,
        submitCount: app.submitCount,
        /** `decisionNote`, written to be read by the applicant. */
        note: app.decisionNote,
        changesRequested: readRequestedFields(app.changesRequested),
      },
      shop: app.shop,
      documents: app.documents.map(toDocumentView),
      timeline: app.events.map((event) => ({
        id: event.id,
        type: event.type,
        message: event.message,
        at: event.createdAt,
      })),
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    };
  }

  /**
   * What a reviewer behind `shops.view` gets: the same answers plus the KYC and
   * payout details they have to check against the uploaded documents, the
   * internal note, and the timeline including internal `meta`.
   *
   * The applicant's *account* phone is masked even here — it is a login
   * identifier. `contactPhone`, which the applicant gave as the shop's number, is
   * shown in full because ringing it is part of verification.
   */
  private toReviewerView(app: ReviewApplication) {
    return {
      id: app.id,
      reference: app.reference,
      status: app.status,
      statusLabel: humanStatus(app.status),
      isOpen: isOpen(app.status),
      missing: missingForSubmit(app),
      missingDocuments: missingDocuments(app),
      applicant: {
        id: app.applicant.id,
        name: app.applicant.name,
        phoneMasked: maskPhone(app.applicant.phone),
        email: app.applicant.email,
        joinedAt: app.applicant.createdAt,
      },
      ...this.shopFields(app),
      kyc: this.ownerFields(app),
      payout: this.payoutFields(app),
      category: app.category,
      terms: { acceptedAt: app.acceptedTermsAt, version: app.acceptedTermsVersion },
      review: {
        submittedAt: app.submittedAt,
        decidedAt: app.reviewedAt,
        submitCount: app.submitCount,
        decisionNote: app.decisionNote,
        changesRequested: readRequestedFields(app.changesRequested),
      },
      internal: { reviewerNote: app.reviewerNote, reviewer: app.reviewedBy },
      shop: app.shop,
      documents: app.documents.map(toDocumentView),
      timeline: app.events.map((event) => ({
        id: event.id,
        type: event.type,
        message: event.message,
        meta: event.meta,
        actorId: event.actorId,
        at: event.createdAt,
      })),
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    };
  }

  /**
   * A queue row: enough to triage, nothing worth shoulder-surfing. The payout
   * method is useful at a glance, the account number is not, and the applicant's
   * account phone is masked here as it is everywhere else.
   */
  private toQueueRow(row: QueueRow) {
    return {
      id: row.id,
      reference: row.reference,
      status: row.status,
      statusLabel: humanStatus(row.status),
      shopName: row.shopName,
      area: row.area,
      contactPhone: row.contactPhone,
      category: row.category,
      payoutMethod: row.payoutMethod,
      payoutAccountMasked: maskAccount(row.bankAccountNo),
      documentCount: row._count.documents,
      applicant: {
        id: row.applicant.id,
        name: row.applicant.name,
        phoneMasked: maskPhone(row.applicant.phone),
      },
      reviewer: row.reviewedBy,
      submittedAt: row.submittedAt,
      submitCount: row.submitCount,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataErasureStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from '../../providers/storage.provider';

const REDACTED = '[Personal details removed after retention]';
const POLICY_KEY = 'deleted_account_order_pii';
const MIN_RETENTION_DAYS = 1830;
const MAX_BATCH = 100;
type RunTotals = { scanned: number; purged: number; held: number; failed: number; objectScanned: number; objectsRemoved: number; objectFailed: number; objectHeld: number };

@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  async overview() {
    const now = new Date();
    const requestFields = { id: true, userId: true, status: true, requestedAt: true, purgeEligibleAt: true, purgedAt: true, attempts: true, lastError: true } as const;
    const urgent = await this.prisma.dataErasureRequest.findMany({
      where: { status: { in: ['ANONYMIZED', 'PURGING'] }, purgeEligibleAt: { lte: now } },
      orderBy: [{ purgeEligibleAt: 'asc' }, { id: 'asc' }],
      take: 50,
      select: requestFields,
    });
    const objectFields = { id: true, userId: true, source: true, attempts: true, lastError: true, createdAt: true } as const;
    const failedObjects = await this.prisma.privateObjectDeletion.findMany({
      where: { status: 'PENDING', lastError: { not: null } },
      orderBy: [{ lastAttemptAt: 'desc' }, { id: 'desc' }],
      take: 25,
      select: objectFields,
    });
    const [policy, due, pending, purged, activeHolds, objectsPending, objectsFailed, recent, holds, runs, objectDeletions] = await Promise.all([
      this.prisma.retentionPolicy.findUnique({ where: { key: POLICY_KEY } }),
      this.prisma.dataErasureRequest.count({ where: { status: { in: ['ANONYMIZED', 'PURGING'] }, purgeEligibleAt: { lte: now } } }),
      this.prisma.dataErasureRequest.count({ where: { status: { in: ['ANONYMIZED', 'PURGING'] } } }),
      this.prisma.dataErasureRequest.count({ where: { status: 'PURGED' } }),
      this.prisma.legalHold.count({ where: this.activeHoldWhere(now) }),
      this.prisma.privateObjectDeletion.count({ where: { status: 'PENDING' } }),
      this.prisma.privateObjectDeletion.count({ where: { status: 'PENDING', lastError: { not: null } } }),
      this.prisma.dataErasureRequest.findMany({
        where: { id: { notIn: urgent.map((row) => row.id) } },
        orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }],
        take: 100 - urgent.length,
        select: requestFields,
      }),
      this.prisma.legalHold.findMany({
        orderBy: { placedAt: 'desc' },
        take: 100,
        select: { id: true, subjectType: true, subjectId: true, reason: true, placedById: true, placedAt: true, expiresAt: true, releasedAt: true, releasedById: true, releaseReason: true },
      }),
      this.prisma.retentionRun.findMany({ orderBy: { startedAt: 'desc' }, take: 20 }),
      this.prisma.privateObjectDeletion.findMany({
        where: { status: 'PENDING', id: { notIn: failedObjects.map((row) => row.id) } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: 50 - failedObjects.length,
        select: objectFields,
      }),
    ]);
    return { policy, counts: { due, pending, purged, activeHolds, objectsPending, objectsFailed }, requests: [...urgent, ...recent], holds, runs, objectDeletions: [...failedObjects, ...objectDeletions], generatedAt: now };
  }

  async updatePolicy(actorId: string, days: number, legalBasis: string) {
    if (days < MIN_RETENTION_DAYS) {
      throw new BadRequestException(`Retention must be at least ${MIN_RETENTION_DAYS} days until counsel approves a different legal baseline`);
    }
    return this.prisma.retentionPolicy.upsert({
      where: { key: POLICY_KEY },
      create: {
        key: POLICY_KEY,
        days,
        legalBasis,
        description: 'Retain transaction-linked personal snapshots after account deletion, then redact direct personal fields while preserving accounting totals.',
        updatedById: actorId,
      },
      update: { days, legalBasis, isActive: true, updatedById: actorId },
    });
  }

  async placeHold(actorId: string, userId: string, reason: string, expiresAt?: Date) {
    return this.prisma.$transaction(async (tx) => {
      // The same lock is taken by account deletion and expiry processing.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(83538, hashtext(${userId}))::text AS acquired`;
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) throw new NotFoundException('User not found');
      const request = await tx.dataErasureRequest.findUnique({ where: { userId }, select: { status: true } });
      if (request?.status === 'PURGING' || request?.status === 'PURGED') {
        throw new ConflictException('Personal snapshot redaction has already started');
      }
      const existing = await tx.legalHold.findFirst({ where: { subjectType: 'USER', subjectId: userId, ...this.activeHoldWhere(new Date()) } });
      if (existing) throw new ConflictException('An active hold already exists for this user');
      return tx.legalHold.create({
        data: { subjectType: 'USER', subjectId: userId, reason, placedById: actorId, expiresAt },
      });
    });
  }

  async releaseHold(actorId: string, holdId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const hold = await tx.legalHold.findUnique({ where: { id: holdId } });
      if (!hold) throw new NotFoundException('Legal hold not found');
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(83538, hashtext(${hold.subjectId}))::text AS acquired`;
      const changed = await tx.legalHold.updateMany({
        where: { id: holdId, releasedAt: null },
        data: { releasedAt: new Date(), releasedById: actorId, releaseReason: reason },
      });
      if (!changed.count) throw new ConflictException('This hold has already been released');
      return tx.legalHold.findUniqueOrThrow({ where: { id: holdId } });
    });
  }

  @Cron('0 45 * * * *', { name: 'privacy-retention-expiry', timeZone: 'Asia/Kathmandu' })
  async scheduledRun() {
    try {
      await this.run('SCHEDULED');
    } catch (error) {
      this.logger.error(`Retention run failed: ${(error as Error).message}`);
    }
  }

  async run(source: 'SCHEDULED' | 'MANUAL', actorId?: string) {
    const now = new Date();
    const run = await this.prisma.retentionRun.create({ data: { source, actorId } });
    const totals: RunTotals = { scanned: 0, purged: 0, held: 0, failed: 0, objectScanned: 0, objectsRemoved: 0, objectFailed: 0, objectHeld: 0 };
    const retryBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    let cursor: { purgeEligibleAt: Date; id: string } | null = null;
    try {
      await this.cleanupPrivateObjects(source, now, retryBefore, totals);
      while (totals.scanned < MAX_BATCH) {
        // Exclude active holds in the scan itself. Otherwise the oldest 100
        // held requests would consume every bounded run and starve later ones.
        // purgeOne still rechecks the hold under the per-user lock to close the
        // race with a compliance administrator placing one.
        const afterCursor: Prisma.Sql = cursor ? Prisma.sql`AND (er."purgeEligibleAt", er.id) > (${cursor.purgeEligibleAt}, ${cursor.id})` : Prisma.empty;
        const retryFilter = source === 'SCHEDULED'
          ? Prisma.sql`AND (er."lastError" IS NULL OR er."lastAttemptAt" < ${retryBefore})`
          : Prisma.empty;
        const rows: Array<{ id: string; purgeEligibleAt: Date }> = await this.prisma.$queryRaw(Prisma.sql`
          SELECT er.id, er."purgeEligibleAt"
          FROM "DataErasureRequest" er
          WHERE er.status IN ('ANONYMIZED', 'PURGING')
            AND er."purgeEligibleAt" <= ${now}
            ${retryFilter}
            AND (
              er.status = 'PURGING' OR NOT EXISTS (
                SELECT 1 FROM "LegalHold" h
                WHERE h."subjectType" = 'USER' AND h."subjectId" = er."userId"
                  AND h."releasedAt" IS NULL
                  AND (h."expiresAt" IS NULL OR h."expiresAt" > ${now})
              )
            )
            ${afterCursor}
          ORDER BY er."purgeEligibleAt" ASC, er.id ASC
          LIMIT ${Math.min(20, MAX_BATCH - totals.scanned)}
        `);
        if (!rows.length) break;
        for (const row of rows) {
          cursor = row;
          totals.scanned++;
          try {
            const outcome = await this.purgeOne(row.id, now);
            if (outcome === 'purged') totals.purged++;
            if (outcome === 'held') totals.held++;
          } catch (error) {
            totals.failed++;
            const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown retention error';
            this.logger.error(`Retention request ${row.id} failed: ${message}`);
            await this.prisma.dataErasureRequest.updateMany({
              where: { id: row.id, status: { in: ['ANONYMIZED', 'PURGING'] } },
              data: { attempts: { increment: 1 }, lastAttemptAt: now, lastError: message },
            });
          }
        }
      }
      return this.prisma.retentionRun.update({
        where: { id: run.id }, data: { ...totals, status: 'COMPLETED', completedAt: new Date() },
      });
    } catch (error) {
      await this.prisma.retentionRun.update({
        where: { id: run.id },
        data: { ...totals, status: 'FAILED', error: (error as Error).message.slice(0, 500), completedAt: new Date() },
      });
      throw error;
    }
  }

  private activeHoldWhere(now: Date): Prisma.LegalHoldWhereInput {
    return { releasedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  }

  private async cleanupPrivateObjects(
    source: 'SCHEDULED' | 'MANUAL',
    now: Date,
    retryBefore: Date,
    totals: RunTotals,
  ) {
    let cursor: { createdAt: Date; id: string } | null = null;
    while (totals.objectScanned < MAX_BATCH) {
      const afterCursor: Prisma.Sql = cursor
        ? Prisma.sql`AND (task."createdAt", task.id) > (${cursor.createdAt}, ${cursor.id})`
        : Prisma.empty;
      const retryFilter = source === 'SCHEDULED'
        ? Prisma.sql`AND (task."lastError" IS NULL OR task."lastAttemptAt" < ${retryBefore})`
        : Prisma.empty;
      // Skip holds in SQL so a large legal-preservation queue cannot starve
      // other users. The hold is checked again under the user's lock below.
      const rows: Array<{ id: string; createdAt: Date }> = await this.prisma.$queryRaw(Prisma.sql`
        SELECT task.id, task."createdAt"
        FROM "PrivateObjectDeletion" task
        WHERE task.status = 'PENDING'
          ${retryFilter}
          AND NOT EXISTS (
            SELECT 1 FROM "LegalHold" h
            WHERE h."subjectType" = 'USER' AND h."subjectId" = task."userId"
              AND h."releasedAt" IS NULL
              AND (h."expiresAt" IS NULL OR h."expiresAt" > ${now})
          )
          ${afterCursor}
        ORDER BY task."createdAt" ASC, task.id ASC
        LIMIT ${Math.min(20, MAX_BATCH - totals.objectScanned)}
      `);
      if (!rows.length) break;
      for (const row of rows) {
        cursor = row;
        totals.objectScanned++;
        try {
          const outcome = await this.deletePrivateObject(row.id, now);
          if (outcome === 'deleted') totals.objectsRemoved++;
          if (outcome === 'held') totals.objectHeld++;
        } catch (error) {
          totals.objectFailed++;
          const message = error instanceof Error ? error.message.slice(0, 500) : 'Unknown object deletion error';
          this.logger.error(`Private object cleanup ${row.id} failed: ${message}`);
          await this.prisma.privateObjectDeletion.updateMany({
            where: { id: row.id, status: 'PENDING' },
            data: { attempts: { increment: 1 }, lastAttemptAt: now, lastError: message },
          });
        }
      }
    }
  }

  private async deletePrivateObject(taskId: string, now: Date): Promise<'deleted' | 'held' | 'skipped'> {
    return this.prisma.$transaction(async (tx) => {
      const initial = await tx.privateObjectDeletion.findUnique({ where: { id: taskId }, select: { userId: true } });
      if (!initial) return 'skipped';
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(83538, hashtext(${initial.userId}))::text AS acquired`;
      const task = await tx.privateObjectDeletion.findUnique({ where: { id: taskId } });
      if (!task || task.status !== 'PENDING') return 'skipped';
      const hold = await tx.legalHold.findFirst({
        where: { subjectType: 'USER', subjectId: task.userId, ...this.activeHoldWhere(now) },
        select: { id: true },
      });
      if (hold) return 'held';
      if (task.source !== 'ACCOUNT_DELETION_APPLICATION' || !task.storageKey.startsWith('private/shop-applications/')) {
        throw new ConflictException('Private object deletion manifest has an unrecognized source or key');
      }
      // The owning application row is already gone. A crash after this remove
      // but before commit simply retries an idempotent deletion next run.
      await this.storage.remove(task.storageKey);
      await tx.privateObjectDeletion.update({
        where: { id: taskId },
        data: { status: 'DELETED', deletedAt: now, attempts: { increment: 1 }, lastAttemptAt: now, lastError: null },
      });
      return 'deleted';
    }, { timeout: 60_000 });
  }

  private async purgeOne(requestId: string, now: Date): Promise<'purged' | 'held' | 'skipped'> {
    const prepared = await this.prisma.$transaction(async (tx) => {
      const initial = await tx.dataErasureRequest.findUnique({ where: { id: requestId }, select: { userId: true } });
      if (!initial) return 'skipped';
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(83538, hashtext(${initial.userId}))::text AS acquired`;
      const request = await tx.dataErasureRequest.findUnique({ where: { id: requestId } });
      if (!request || request.status === DataErasureStatus.PURGED || request.purgeEligibleAt > now) return 'skipped';
      // A previous attempt may have committed the redaction already. Resume
      // its persisted object manifest instead of rebuilding it from cleared rows.
      if (request.status === DataErasureStatus.PURGING) return 'ready';
      const hold = await tx.legalHold.findFirst({
        where: { subjectType: 'USER', subjectId: request.userId, ...this.activeHoldWhere(now) },
        select: { id: true },
      });
      if (hold) return 'held';
      const user = await tx.user.findUnique({ where: { id: request.userId }, select: { status: true } });
      if (user?.status !== 'DELETED') throw new ConflictException('Erasure request user is not deleted');
      const unsettled = await tx.order.count({
        where: {
          customerId: request.userId,
          OR: [
            { status: { in: ['PLACED', 'ACCEPTED', 'PACKED', 'OUT_FOR_DELIVERY'] } },
            { refunds: { some: { status: { in: ['PENDING', 'PROCESSING'] } } } },
            { dispute: { status: { in: ['OPEN', 'UNDER_REVIEW'] } } },
          ],
        },
      });
      if (unsettled) throw new ConflictException('A transaction still needs operational resolution');
      const pendingEvidence = await tx.privateObjectDeletion.count({ where: { userId: request.userId, status: 'PENDING' } });
      if (pendingEvidence) throw new ConflictException('Private application evidence cleanup is still pending');

      const orderIds = (await tx.order.findMany({ where: { customerId: request.userId }, select: { id: true } })).map((row) => row.id);
      const proofs = await tx.delivery.findMany({ where: { orderId: { in: orderIds }, podImageUrl: { not: null } }, select: { podImageUrl: true } });
      const supportFiles = await tx.ticketAttachment.findMany({
        where: { message: { ticket: { userId: request.userId } } },
        select: { id: true, storageKey: true },
      });
      // Legacy TicketMessage.attachments strings have no ownership record and
      // must never be used as deletion keys. Only server-owned proof and new
      // TicketAttachment rows are eligible for the resumable manifest.
      const privateKeys = new Set(proofs
        .map((row) => row.podImageUrl)
        .filter((key): key is string => Boolean(key?.startsWith('private/delivery-proofs/'))));
      for (const file of supportFiles) {
        if (/^private\/support-tickets\/[A-Za-z0-9_-]{1,64}\/[a-f0-9]{32}\.(jpg|png|webp|pdf)$/.test(file.storageKey)) {
          privateKeys.add(file.storageKey);
        } else {
          throw new ConflictException(`Support attachment ${file.id} has an invalid private key`);
        }
      }
      await tx.order.updateMany({
        where: { customerId: request.userId },
        data: { addressId: null, recipientName: REDACTED, recipientPhone: '', area: REDACTED, landmark: null, fullAddress: REDACTED, lat: null, lng: null, note: null, cancelReason: null },
      });
      await tx.delivery.updateMany({
        where: { orderId: { in: orderIds } },
        data: { destLat: null, destLng: null, podImageUrl: null, podNote: null, failReason: null, returnNote: null },
      });
      await tx.orderEvent.updateMany({ where: { orderId: { in: orderIds } }, data: { note: null } });
      await tx.shopMessage.updateMany({ where: { conversation: { customerId: request.userId } }, data: { body: REDACTED } });
      await tx.supportAssistantMessage.updateMany({ where: { session: { userId: request.userId } }, data: { body: REDACTED, sourceIds: [] } });
      await tx.ticketAttachment.deleteMany({ where: { message: { ticket: { userId: request.userId } } } });
      await tx.ticketMessage.updateMany({ where: { ticket: { userId: request.userId } }, data: { body: REDACTED, attachments: [] } });
      await tx.supportTicket.updateMany({ where: { userId: request.userId }, data: { subject: REDACTED } });
      await tx.dispute.updateMany({ where: { orderId: { in: orderIds } }, data: { reason: REDACTED, detail: null, resolution: null } });
      await tx.review.updateMany({ where: { customerId: request.userId }, data: { comment: null, sellerReply: null } });
      await tx.refund.updateMany({ where: { orderId: { in: orderIds } }, data: { reason: REDACTED, failureReason: null } });
      await tx.paymentIntent.updateMany({ where: { orderId: { in: orderIds } }, data: { rawPayload: Prisma.DbNull } });
      await tx.paymentAttempt.updateMany({ where: { paymentIntent: { orderId: { in: orderIds } } }, data: { rawPayload: Prisma.DbNull } });
      await tx.groupOrderParticipant.updateMany({ where: { userId: request.userId }, data: { items: [] } });
      await tx.fraudFlag.updateMany({ where: { subjectType: 'user', subjectId: request.userId }, data: { reason: REDACTED } });
      await tx.auditLog.updateMany({
        where: { OR: [{ actorId: request.userId }, { entityType: 'User', entityId: request.userId }] },
        data: { before: Prisma.DbNull, after: Prisma.DbNull, ip: null },
      });
      await tx.dataErasureRequest.update({
        where: { id: request.id },
        data: { status: 'PURGING', proofKeys: [...privateKeys], attempts: { increment: 1 }, lastAttemptAt: now, lastError: null },
      });
      await tx.auditLog.create({
        data: { action: 'privacy.retention_redacted', entityType: 'User', entityId: request.userId, surface: 'system', after: { orderCount: orderIds.length, privateFilesQueued: privateKeys.size } },
      });
      return 'ready';
    }, { timeout: 60_000 });
    if (prepared !== 'ready') return prepared;

    const manifest = await this.prisma.dataErasureRequest.findUnique({
      where: { id: requestId }, select: { status: true, proofKeys: true },
    });
    if (!manifest || manifest.status !== 'PURGING') return 'skipped';
    // Storage removal is outside the DB transaction. Failure or a crash leaves
    // a durable manifest that the next run can safely retry.
    for (const key of manifest.proofKeys) await this.storage.remove(key);
    return this.prisma.$transaction(async (tx) => {
      const initial = await tx.dataErasureRequest.findUnique({ where: { id: requestId }, select: { userId: true } });
      if (!initial) return 'skipped';
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(83538, hashtext(${initial.userId}))::text AS acquired`;
      const changed = await tx.dataErasureRequest.updateMany({
        where: { id: requestId, status: 'PURGING' },
        data: { status: 'PURGED', purgedAt: new Date(), proofKeys: [], lastError: null },
      });
      if (!changed.count) return 'skipped';
      await tx.auditLog.create({
        data: { action: 'privacy.retention_purged', entityType: 'User', entityId: initial.userId, surface: 'system', after: { privateFilesRemoved: manifest.proofKeys.length } },
      });
      return 'purged';
    });
  }
}

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { EDITABLE_STATUSES, humanStatus } from '../onboarding/application-state';
import { RbacService } from '../../rbac/rbac.service';
import type { LocationCaptureMode, SubmitCapturedLocationDto } from './dto/location-capture.dto';

const CAPTURE_TTL_SECONDS = 10 * 60;
const CAPTURE_FRESHNESS_MS = 2 * 60 * 1000;

type TargetKind = 'APPLICATION' | 'SHOP';
type CaptureState = 'WAITING' | 'CAPTURED';

interface StoredCapture {
  captureId: string;
  targetKind: TargetKind;
  targetId: string;
  requestedById: string;
  mode: LocationCaptureMode;
  status: CaptureState;
  createdAt: string;
  expiresAt: string;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  capturedAt?: string;
}

/**
 * A short-lived bearer link that lets a phone at the shop set a pin without
 * giving that phone the seller's account session. Redis is the right store: the
 * link expires automatically, is never business history, and can be revoked by
 * issuing a newer link for the same target. Only the token hash is stored.
 */
@Injectable()
export class LocationCaptureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly rbac: RbacService,
  ) {}

  async createForApplication(
    userId: string,
    applicationId: string,
    mode: LocationCaptureMode,
  ) {
    const application = await this.prisma.shopApplication.findFirst({
      where: { id: applicationId, applicantId: userId },
      select: { id: true, status: true },
    });
    if (!application) throw new NotFoundException('Application not found');
    if (!EDITABLE_STATUSES.includes(application.status)) {
      throw new ConflictException(
        `The location cannot be changed while this application is ${humanStatus(application.status)}.`,
      );
    }
    return this.create('APPLICATION', applicationId, userId, mode);
  }

  async createForShop(userId: string, shopId: string, mode: LocationCaptureMode) {
    const shop = await this.prisma.shop.findUnique({ where: { id: shopId }, select: { id: true } });
    if (!shop) throw new NotFoundException('Shop not found');
    return this.create('SHOP', shopId, userId, mode);
  }

  async statusForApplication(userId: string, applicationId: string, captureId: string) {
    return this.status(userId, 'APPLICATION', applicationId, captureId);
  }

  async statusForShop(userId: string, shopId: string, captureId: string) {
    return this.status(userId, 'SHOP', shopId, captureId);
  }

  async publicInfo(token: string) {
    const capture = await this.byToken(token);
    return {
      status: capture.status,
      purpose: capture.targetKind === 'APPLICATION' ? 'seller registration' : 'shop location update',
      expiresAt: capture.expiresAt,
      maximumAccuracyM: 100,
    };
  }

  async submit(token: string, dto: SubmitCapturedLocationDto) {
    const hash = this.hash(token);
    const key = this.recordKey(hash);
    const capture = await this.read(key);
    if (!capture) throw this.invalidLink();
    if (capture.status === 'CAPTURED') {
      return { status: 'CAPTURED', capturedAt: capture.capturedAt };
    }

    const measuredAt = new Date(dto.capturedAt);
    const age = Date.now() - measuredAt.getTime();
    if (age > CAPTURE_FRESHNESS_MS || age < -30_000) {
      throw new ConflictException('That GPS reading is not fresh. Ask the phone for location again.');
    }

    // Across API replicas, only one request may consume this bearer token. The
    // claim is deliberately short; a failed database write releases it below.
    const claimKey = `location-capture:claim:${hash}`;
    const claimed = await this.redis.client.set(claimKey, '1', 'EX', 30, 'NX');
    if (claimed !== 'OK') throw new ConflictException('This location is already being recorded.');

    try {
      const active = await this.redis.client.get(this.targetKey(capture.targetKind, capture.targetId));
      if (active !== hash) throw this.invalidLink();

      const storedAt = new Date();
      const data = {
        lat: dto.lat,
        lng: dto.lng,
        locationAccuracyM: dto.accuracyM,
        locationCapturedAt: storedAt,
        locationCaptureMethod: capture.mode,
      };

      if (capture.targetKind === 'APPLICATION') {
        await this.prisma.$transaction(async (tx) => {
          const updated = await tx.shopApplication.updateMany({
            where: {
              id: capture.targetId,
              applicantId: capture.requestedById,
              status: { in: [...EDITABLE_STATUSES] },
            },
            data,
          });
          if (updated.count !== 1) {
            throw new ConflictException('This application is no longer editable.');
          }
          await tx.shopApplicationEvent.create({
            data: {
              applicationId: capture.targetId,
              type: 'location_captured',
              message: `Shop location captured from a phone with ±${Math.round(dto.accuracyM)} m accuracy.`,
              meta: { mode: capture.mode, accuracyM: dto.accuracyM },
              actorId: capture.requestedById,
            },
          });
        });
      } else {
        // The bearer link does not freeze authorization. If the requester loses
        // settings.manage while the QR is open, consuming it is refused too.
        await this.rbac.assert(capture.requestedById, 'settings.manage', capture.targetId);
        await this.prisma.shop.update({ where: { id: capture.targetId }, data });
        await this.audit.record({
          actorId: capture.requestedById,
          action: 'shop.location_captured',
          entityType: 'Shop',
          entityId: capture.targetId,
          surface: 'seller-location-capture',
          after: { lat: dto.lat, lng: dto.lng, accuracyM: dto.accuracyM, mode: capture.mode },
        });
      }

      const complete: StoredCapture = {
        ...capture,
        status: 'CAPTURED',
        lat: dto.lat,
        lng: dto.lng,
        accuracyM: dto.accuracyM,
        capturedAt: storedAt.toISOString(),
      };
      // If the link reaches its deadline while the database transaction is in
      // flight, keep the completed receipt briefly. The accepted GPS write must
      // never be reported as a failure merely because Redis expired a moment
      // after the request began.
      const ttl = Math.max(await this.redis.client.ttl(key), 60);
      await this.redis.client
        .multi()
        .set(key, JSON.stringify(complete), 'EX', ttl)
        .set(this.idKey(capture.captureId), hash, 'EX', ttl)
        .exec();
      return this.view(complete);
    } finally {
      await this.redis.client.del(claimKey);
    }
  }

  private async create(
    targetKind: TargetKind,
    targetId: string,
    requestedById: string,
    mode: LocationCaptureMode,
  ) {
    const token = randomBytes(32).toString('base64url');
    const hash = this.hash(token);
    const captureId = randomBytes(12).toString('base64url');
    const now = new Date();
    const capture: StoredCapture = {
      captureId,
      targetKind,
      targetId,
      requestedById,
      mode,
      status: 'WAITING',
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + CAPTURE_TTL_SECONDS * 1000).toISOString(),
    };

    const targetKey = this.targetKey(targetKind, targetId);
    const previousHash = await this.redis.client.get(targetKey);
    if (previousHash) {
      const previous = await this.read(this.recordKey(previousHash));
      await this.redis.client.del(this.recordKey(previousHash));
      if (previous) await this.redis.client.del(this.idKey(previous.captureId));
    }

    await this.redis.client
      .multi()
      .set(this.recordKey(hash), JSON.stringify(capture), 'EX', CAPTURE_TTL_SECONDS)
      .set(this.idKey(captureId), hash, 'EX', CAPTURE_TTL_SECONDS)
      .set(targetKey, hash, 'EX', CAPTURE_TTL_SECONDS)
      .exec();

    return { ...this.view(capture), token };
  }

  private async status(
    userId: string,
    targetKind: TargetKind,
    targetId: string,
    captureId: string,
  ) {
    const hash = await this.redis.client.get(this.idKey(captureId));
    if (!hash) return { status: 'EXPIRED' as const };
    const capture = await this.read(this.recordKey(hash));
    if (
      !capture ||
      capture.requestedById !== userId ||
      capture.targetKind !== targetKind ||
      capture.targetId !== targetId
    ) {
      throw new NotFoundException('Location capture not found');
    }
    return this.view(capture);
  }

  private async byToken(token: string): Promise<StoredCapture> {
    const capture = await this.read(this.recordKey(this.hash(token)));
    if (!capture) throw this.invalidLink();
    return capture;
  }

  private async read(key: string): Promise<StoredCapture | null> {
    const raw = await this.redis.client.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredCapture;
    } catch {
      await this.redis.client.del(key);
      return null;
    }
  }

  private view(capture: StoredCapture) {
    return {
      captureId: capture.captureId,
      status: capture.status,
      mode: capture.mode,
      expiresAt: capture.expiresAt,
      lat: capture.lat ?? null,
      lng: capture.lng ?? null,
      accuracyM: capture.accuracyM ?? null,
      capturedAt: capture.capturedAt ?? null,
    };
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private recordKey(hash: string): string {
    return `location-capture:token:${hash}`;
  }

  private idKey(id: string): string {
    return `location-capture:id:${id}`;
  }

  private targetKey(kind: TargetKind, id: string): string {
    return `location-capture:target:${kind}:${id}`;
  }

  private invalidLink(): NotFoundException {
    return new NotFoundException('This location link has expired, was replaced, or is invalid.');
  }
}

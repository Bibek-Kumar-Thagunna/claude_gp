import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigEnvironment } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreatePlatformConfigDto, SetFeatureFlagDto } from './dto/admin.dto';

@Injectable()
export class PlatformConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async configuration(environment: ConfigEnvironment) {
    const history = await this.prisma.platformConfigVersion.findMany({
      where: { environment },
      orderBy: { version: 'desc' },
      take: 25,
      include: { changedBy: { select: { id: true, name: true, phone: true } } },
    });
    return { current: history[0] ?? null, history };
  }

  async createConfiguration(actorId: string, dto: CreatePlatformConfigDto) {
    await this.assertMayChange(actorId, dto.environment);
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.platformConfigVersion.findFirst({
        where: { environment: dto.environment },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      return tx.platformConfigVersion.create({
        data: {
          environment: dto.environment,
          version: (latest?.version ?? 0) + 1,
          commissionRateBps: dto.commissionRateBps,
          baseDeliveryFee: dto.baseDeliveryFee,
          perKmDeliveryFee: dto.perKmDeliveryFee,
          codLimit: dto.codLimit,
          refundWindowHours: dto.refundWindowHours,
          changeNote: dto.changeNote.trim(),
          changedById: actorId,
        },
        include: { changedBy: { select: { id: true, name: true, phone: true } } },
      });
    }, { isolationLevel: 'Serializable' });
  }

  async featureFlags(environment: ConfigEnvironment, shopId?: string) {
    const targetKey = shopId || 'global';
    if (shopId) await this.assertShop(shopId);
    const versions = await this.prisma.featureFlagVersion.findMany({
      where: { environment, targetKey },
      orderBy: [{ key: 'asc' }, { version: 'desc' }],
      take: 1000,
      include: {
        shop: { select: { id: true, name: true } },
        changedBy: { select: { id: true, name: true, phone: true } },
      },
    });
    const current = [...new Map(versions.map((flag) => [flag.key, flag])).values()];
    return { target: shopId ? { type: 'shop', shopId } : { type: 'global' }, current, history: versions };
  }

  async setFeatureFlag(actorId: string, dto: SetFeatureFlagDto) {
    await this.assertMayChange(actorId, dto.environment);
    const shopId = dto.shopId?.trim() || null;
    if (shopId) await this.assertShop(shopId);
    const targetKey = shopId ?? 'global';
    const key = dto.key.trim().toLowerCase();
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.featureFlagVersion.findFirst({
        where: { environment: dto.environment, targetKey, key },
        orderBy: { version: 'desc' },
        select: { version: true, description: true },
      });
      return tx.featureFlagVersion.create({
        data: {
          key,
          environment: dto.environment,
          targetKey,
          shopId,
          enabled: dto.enabled,
          version: (latest?.version ?? 0) + 1,
          description: dto.description?.trim() || latest?.description || null,
          changeNote: dto.changeNote.trim(),
          changedById: actorId,
        },
        include: {
          shop: { select: { id: true, name: true } },
          changedBy: { select: { id: true, name: true, phone: true } },
        },
      });
    }, { isolationLevel: 'Serializable' });
  }

  /** Tenant override wins; otherwise the latest global value is used. */
  async isEnabled(key: string, environment: ConfigEnvironment, shopId?: string): Promise<boolean> {
    const targets = shopId ? [shopId, 'global'] : ['global'];
    const rows = await this.prisma.featureFlagVersion.findMany({
      where: { key, environment, targetKey: { in: targets } },
      orderBy: { version: 'desc' },
    });
    const tenant = shopId ? rows.find((row) => row.targetKey === shopId) : undefined;
    return (tenant ?? rows.find((row) => row.targetKey === 'global'))?.enabled ?? false;
  }

  private async assertShop(shopId: string) {
    if (!await this.prisma.shop.findUnique({ where: { id: shopId }, select: { id: true } })) {
      throw new NotFoundException('Feature flag shop not found');
    }
  }

  private async assertMayChange(actorId: string, environment: ConfigEnvironment) {
    const membership = await this.prisma.platformMembership.findUnique({
      where: { userId: actorId },
      include: { role: { select: { isPrivileged: true, name: true } } },
    });
    if (!membership) throw new ForbiddenException('Platform staff membership required');
    if (environment === ConfigEnvironment.PRODUCTION && !membership.role.isPrivileged) {
      throw new ForbiddenException('Only a Super Admin may change production configuration');
    }
    if (environment === ConfigEnvironment.PRODUCTION && membership.role.name !== 'Super Admin') {
      throw new BadRequestException('Production changes require the Super Admin role');
    }
  }
}

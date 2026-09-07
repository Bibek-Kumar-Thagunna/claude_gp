import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  surface?: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

export interface AuditFilter {
  actorId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  take?: number;
  cursor?: string;
}

/**
 * Append-only compliance log. `record` never throws into the caller — an audit
 * write must not break the business action it is recording (failures are logged
 * and swallowed). Reads are admin-only and paginated by cursor.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          surface: entry.surface ?? 'api',
          before: (entry.before as Prisma.InputJsonValue) ?? undefined,
          after: (entry.after as Prisma.InputJsonValue) ?? undefined,
          ip: entry.ip ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Audit write failed (${entry.action}): ${(err as Error).message}`);
    }
  }

  async list(filter: AuditFilter = {}) {
    const take = Math.min(filter.take ?? 50, 200);
    const where: Prisma.AuditLogWhereInput = {
      actorId: filter.actorId,
      entityType: filter.entityType,
      entityId: filter.entityId,
      action: filter.action ? { contains: filter.action } : undefined,
    };
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
      include: { actor: { select: { id: true, name: true, phone: true } } },
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1]?.id : null };
  }
}

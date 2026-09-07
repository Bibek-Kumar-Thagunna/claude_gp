import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

const POLICY_KEYS = ['terms', 'privacy', 'refund', 'delivery', 'cookies'] as const;
export type PolicyKey = (typeof POLICY_KEYS)[number];

/**
 * Versioned policy documents. Published versions are immutable; a correction
 * means publishing a new version. The customer "current" view always resolves
 * to the most recently published version for a key. Acceptances are recorded
 * per user per document so we can prove which version someone agreed to.
 */
@Injectable()
export class PolicyService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Public ────────────────────────────────────────────────────────────────
  async current(key: string) {
    const doc = await this.prisma.policyDocument.findFirst({
      where: { key, isPublished: true },
      orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (!doc) throw new NotFoundException(`No published "${key}" policy yet`);
    return doc;
  }

  async listCurrent() {
    const results = await Promise.all(
      POLICY_KEYS.map((key) =>
        this.prisma.policyDocument.findFirst({
          where: { key, isPublished: true },
          orderBy: [{ effectiveAt: 'desc' }, { createdAt: 'desc' }],
          select: { id: true, key: true, version: true, title: true, effectiveAt: true },
        }),
      ),
    );
    return results.filter(Boolean);
  }

  // ── Customer acceptance ────────────────────────────────────────────────────
  async accept(userId: string, policyId: string) {
    const doc = await this.prisma.policyDocument.findUnique({ where: { id: policyId } });
    if (!doc || !doc.isPublished) throw new NotFoundException('Policy not found');
    return this.prisma.policyAcceptance.upsert({
      where: { userId_policyId: { userId, policyId } },
      create: { userId, policyId, version: doc.version },
      update: { version: doc.version, acceptedAt: new Date() },
    });
  }

  myAcceptances(userId: string) {
    return this.prisma.policyAcceptance.findMany({
      where: { userId },
      include: { policy: { select: { key: true, title: true, version: true } } },
    });
  }

  // ── Admin ───────────────────────────────────────────────────────────────
  listAll(key?: string) {
    return this.prisma.policyDocument.findMany({
      where: { key },
      orderBy: [{ key: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async getById(id: string) {
    const doc = await this.prisma.policyDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Policy not found');
    return doc;
  }

  async create(input: { key: string; version: string; title: string; content: string }) {
    if (!POLICY_KEYS.includes(input.key as PolicyKey)) {
      throw new BadRequestException(`key must be one of: ${POLICY_KEYS.join(', ')}`);
    }
    const clash = await this.prisma.policyDocument.findUnique({
      where: { key_version: { key: input.key, version: input.version } },
    });
    if (clash) throw new BadRequestException(`Version ${input.version} of ${input.key} already exists`);
    return this.prisma.policyDocument.create({ data: { ...input, isPublished: false } });
  }

  async update(id: string, input: { title?: string; content?: string; version?: string }) {
    const doc = await this.getById(id);
    if (doc.isPublished) throw new BadRequestException('Published versions are immutable — create a new version');
    return this.prisma.policyDocument.update({ where: { id }, data: input });
  }

  async publish(id: string) {
    const doc = await this.getById(id);
    return this.prisma.policyDocument.update({
      where: { id },
      data: { isPublished: true, effectiveAt: doc.effectiveAt ?? new Date() },
    });
  }
}

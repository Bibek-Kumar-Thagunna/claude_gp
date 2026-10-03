import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TicketPriority, TicketStatus } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import type { UploadedFile } from '../uploads/uploaded-file';

const ticketCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ0123456789', 6);

/**
 * Customer support tickets with a threaded message history. Customers open and
 * reply on their own tickets; platform staff (admin surface) can read every
 * ticket, reply as staff, and move status/priority.
 */
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);
  constructor(private readonly prisma: PrismaService, private readonly uploads: UploadsService) {}

  async createTicket(
    userId: string,
    input: { subject: string; category?: string; orderId?: string; message: string },
  ) {
    if (input.orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: input.orderId }, select: { customerId: true } });
      if (!order || order.customerId !== userId) throw new BadRequestException('That order is not yours');
    }
    return this.prisma.supportTicket.create({
      data: {
        code: `TKT-${ticketCode()}`,
        userId,
        orderId: input.orderId,
        subject: input.subject,
        category: input.category ?? 'general',
        messages: { create: { authorId: userId, body: input.message, isStaff: false } },
      },
      include: { messages: true },
    });
  }

  myTickets(userId: string) {
    return this.prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 1, select: { id: true, body: true, isStaff: true, createdAt: true } } },
    });
  }

  async getMine(userId: string, ticketId: string) {
    const ticket = await this.loadWithMessages(ticketId);
    if (ticket.userId !== userId) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async addMessage(userId: string, ticketId: string, body: string) {
    await this.reply(userId, ticketId, body, false);
    return this.loadWithMessages(ticketId);
  }

  async addMessageWithFile(userId: string, ticketId: string, body: string, file: UploadedFile | undefined) {
    if (!file) throw new BadRequestException('Attach a photo or PDF as the file field');
    await this.reply(userId, ticketId, body, false, file);
    return this.loadWithMessages(ticketId);
  }

  async staffReplyWithFile(staffId: string, ticketId: string, body: string, file: UploadedFile | undefined) {
    if (!file) throw new BadRequestException('Attach a photo or PDF as the file field');
    await this.reply(staffId, ticketId, body, true, file);
    return this.loadWithMessages(ticketId);
  }

  private async reply(authorId: string, ticketId: string, body: string, isStaff: boolean, file?: UploadedFile) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { userId: true, status: true } });
    if (!ticket || (!isStaff && ticket.userId !== authorId)) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'CLOSED') throw new BadRequestException('This ticket is closed — open a new one');
    const stored = file ? await this.uploads.storeSupportAttachment(ticketId, file) : null;
    try {
      await this.prisma.$transaction(async (tx) => {
        // Share the account-deletion/retention lock: a late staff reply must
        // not add evidence after the customer's purge manifest is prepared.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(83538, hashtext(${ticket.userId}))::text AS acquired`;
        const owner = await tx.user.findUnique({ where: { id: ticket.userId }, select: { status: true } });
        if (!owner || owner.status === 'DELETED') throw new BadRequestException('This account is closed; its tickets are read-only');
        // This conditional write locks the ticket row, so a concurrent close
        // cannot leave a message on a closed ticket.
        const changed = await tx.supportTicket.updateMany({
          where: { id: ticketId, ...(!isStaff ? { userId: authorId } : {}), status: { not: 'CLOSED' } },
          data: { status: isStaff ? 'PENDING' : 'OPEN' },
        });
        if (!changed.count) throw new BadRequestException('This ticket is closed — open a new one');
        if (stored) {
          const count = await tx.ticketAttachment.count({ where: { message: { ticketId } } });
          if (count >= 20) throw new BadRequestException('This ticket has reached its 20-file limit');
        }
        await tx.ticketMessage.create({
          data: {
            ticketId, authorId, body, isStaff,
            ...(stored ? { files: { create: { storageKey: stored.key, fileName: stored.displayName, mimeType: stored.mime, sizeBytes: stored.size } } } : {}),
          },
        });
      });
    } catch (error) {
      if (stored) {
        // A lost commit acknowledgement is ambiguous. Never delete bytes that
        // might now have a committed owner; inventory flags any true orphan.
        try {
          const committed = await this.prisma.ticketAttachment.findUnique({ where: { storageKey: stored.key }, select: { id: true } });
          if (!committed) await this.uploads.remove(stored.key);
        } catch (cleanupError) { this.logger.error(`support attachment rollback check failed for ${stored.key}: ${String(cleanupError)}`); }
      }
      throw error;
    }
  }

  async customerAttachment(userId: string, ticketId: string, attachmentId: string) {
    return this.readAttachment(ticketId, attachmentId, userId);
  }

  async staffAttachment(ticketId: string, attachmentId: string) {
    return this.readAttachment(ticketId, attachmentId);
  }

  private async readAttachment(ticketId: string, attachmentId: string, userId?: string) {
    const file = await this.prisma.ticketAttachment.findFirst({
      where: { id: attachmentId, message: { ticketId, ...(userId ? { ticket: { userId } } : {}) } },
      select: { storageKey: true, fileName: true, mimeType: true, sizeBytes: true },
    });
    if (!file) throw new NotFoundException('Attachment not found');
    return this.uploads.readSupportAttachment(ticketId, file.storageKey, file.mimeType, file.fileName, file.sizeBytes);
  }

  async closeMine(userId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.userId !== userId) throw new NotFoundException('Ticket not found');
    return this.prisma.supportTicket.update({ where: { id: ticketId }, data: { status: 'CLOSED' } });
  }

  // ── Staff (admin surface) ────────────────────────────────────────────────
  listAll(filter: { status?: TicketStatus; priority?: TicketPriority } = {}) {
    return this.prisma.supportTicket.findMany({
      where: { status: filter.status, priority: filter.priority },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      include: { user: { select: { name: true, phone: true } }, messages: { orderBy: { createdAt: 'asc' }, take: 1, select: { id: true, body: true, isStaff: true, createdAt: true } } },
      take: 200,
    });
  }

  getAny(ticketId: string) {
    return this.loadWithMessages(ticketId);
  }

  async staffReply(staffId: string, ticketId: string, body: string) {
    await this.reply(staffId, ticketId, body, true);
    return this.loadWithMessages(ticketId);
  }

  async setStatus(ticketId: string, status: TicketStatus) {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.supportTicket.findUnique({ where: { id: ticketId }, select: { userId: true } });
      if (!ticket) throw new NotFoundException('Ticket not found');
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(83538, hashtext(${ticket.userId}))::text AS acquired`;
      if (status !== 'CLOSED') {
        const owner = await tx.user.findUnique({ where: { id: ticket.userId }, select: { status: true } });
        if (!owner || owner.status === 'DELETED') throw new BadRequestException('A deleted account’s ticket cannot be reopened');
      }
      return tx.supportTicket.update({ where: { id: ticketId }, data: { status } });
    });
  }

  async setPriority(ticketId: string, priority: TicketPriority) {
    await this.ensureExists(ticketId);
    return this.prisma.supportTicket.update({ where: { id: ticketId }, data: { priority } });
  }

  private async loadWithMessages(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, select: {
          id: true, body: true, isStaff: true, createdAt: true, authorId: true,
          author: { select: { name: true } },
          files: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true } },
        } },
        user: { select: { name: true, phone: true } },
      },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  private async ensureExists(ticketId: string) {
    const exists = await this.prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Ticket not found');
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TicketPriority, TicketStatus } from '@prisma/client';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '../../common/prisma/prisma.service';

const ticketCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ0123456789', 6);

/**
 * Customer support tickets with a threaded message history. Customers open and
 * reply on their own tickets; platform staff (admin surface) can read every
 * ticket, reply as staff, and move status/priority.
 */
@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

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
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 1 } },
    });
  }

  async getMine(userId: string, ticketId: string) {
    const ticket = await this.loadWithMessages(ticketId);
    if (ticket.userId !== userId) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async addMessage(userId: string, ticketId: string, body: string, attachments: string[] = []) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.userId !== userId) throw new NotFoundException('Ticket not found');
    if (ticket.status === 'CLOSED') throw new BadRequestException('This ticket is closed — open a new one');
    await this.prisma.ticketMessage.create({ data: { ticketId, authorId: userId, body, attachments, isStaff: false } });
    await this.prisma.supportTicket.update({ where: { id: ticketId }, data: { status: 'OPEN' } });
    return this.loadWithMessages(ticketId);
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
      include: { user: { select: { name: true, phone: true } }, messages: { orderBy: { createdAt: 'asc' }, take: 1 } },
      take: 200,
    });
  }

  getAny(ticketId: string) {
    return this.loadWithMessages(ticketId);
  }

  async staffReply(staffId: string, ticketId: string, body: string, attachments: string[] = []) {
    await this.ensureExists(ticketId);
    await this.prisma.ticketMessage.create({ data: { ticketId, authorId: staffId, body, attachments, isStaff: true } });
    await this.prisma.supportTicket.update({ where: { id: ticketId }, data: { status: 'PENDING' } });
    return this.loadWithMessages(ticketId);
  }

  async setStatus(ticketId: string, status: TicketStatus) {
    await this.ensureExists(ticketId);
    return this.prisma.supportTicket.update({ where: { id: ticketId }, data: { status } });
  }

  async setPriority(ticketId: string, priority: TicketPriority) {
    await this.ensureExists(ticketId);
    return this.prisma.supportTicket.update({ where: { id: ticketId }, data: { priority } });
  }

  private async loadWithMessages(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: { name: true } } } },
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

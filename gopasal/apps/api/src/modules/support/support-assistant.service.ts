import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  SUPPORT_ASSISTANT_PROVIDER,
  type SupportAssistantAnswer,
  type SupportAssistantProvider,
} from '../../providers/support-assistant.provider';
import { SUPPORT_KNOWLEDGE, SUPPORT_KNOWLEDGE_VERSION, retrieveSupportKnowledge } from './support-knowledge';

const ticketCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ0123456789', 6);

const sessionInclude = {
  messages: { orderBy: { createdAt: 'asc' as const }, take: 200 },
  ticket: { select: { id: true, code: true, status: true } },
};

@Injectable()
export class SupportAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SUPPORT_ASSISTANT_PROVIDER) private readonly provider: SupportAssistantProvider,
  ) {}

  async current(userId: string) {
    const session = await this.prisma.supportAssistantSession.findFirst({
      where: { userId },
      orderBy: { lastMessageAt: 'desc' },
      include: sessionInclude,
    });
    return session ? this.view(session) : null;
  }

  async get(userId: string, sessionId: string) {
    const session = await this.prisma.supportAssistantSession.findFirst({
      where: { id: sessionId, userId },
      include: sessionInclude,
    });
    if (!session) throw new NotFoundException('Support conversation not found');
    return this.view(session);
  }

  async ask(
    userId: string,
    input: { sessionId?: string; message: string; clientMessageId: string },
  ) {
    const session = await this.resolveSession(userId, input.sessionId);
    const replyClientId = `reply:${input.clientMessageId}`;
    const existingReply = await this.prisma.supportAssistantMessage.findUnique({
      where: { sessionId_clientMessageId: { sessionId: session.id, clientMessageId: replyClientId } },
    });
    if (existingReply) return this.get(userId, session.id);

    await this.prisma.supportAssistantMessage.upsert({
      where: { sessionId_clientMessageId: { sessionId: session.id, clientMessageId: input.clientMessageId } },
      create: {
        sessionId: session.id,
        role: 'CUSTOMER',
        body: input.message.trim(),
        clientMessageId: input.clientMessageId,
      },
      update: {},
    });

    const recent = await this.prisma.supportAssistantMessage.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { role: true, body: true },
    });
    const matches = retrieveSupportKnowledge(input.message);
    let answer: SupportAssistantAnswer;
    try {
      answer = await this.provider.answer({
        question: input.message.trim(),
        history: recent.reverse().slice(0, -1),
        articles: matches.map((match) => match.article),
      });
    } catch {
      answer = {
        answer: 'The support assistant is temporarily unavailable. Your message is safe, and you can send it to a GoPasal support person now.',
        confidence: 0,
        shouldEscalate: true,
        escalationReason: 'The configured assistant provider was unavailable.',
        sourceIds: [],
        provider: this.provider.name,
      };
    }

    await this.prisma.$transaction([
      this.prisma.supportAssistantMessage.upsert({
        where: { sessionId_clientMessageId: { sessionId: session.id, clientMessageId: replyClientId } },
        create: {
          sessionId: session.id,
          role: 'ASSISTANT',
          body: answer.answer,
          clientMessageId: replyClientId,
          sourceIds: answer.sourceIds,
          confidence: answer.confidence,
          provider: answer.provider,
          shouldEscalate: answer.shouldEscalate,
          escalationReason: answer.escalationReason,
        },
        update: {},
      }),
      this.prisma.supportAssistantSession.update({
        where: { id: session.id },
        data: { lastMessageAt: new Date() },
      }),
    ]);
    return this.get(userId, session.id);
  }

  async escalate(userId: string, sessionId: string, subject?: string, reason?: string) {
    const session = await this.prisma.supportAssistantSession.findFirst({
      where: { id: sessionId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 30 }, ticket: true },
    });
    if (!session) throw new NotFoundException('Support conversation not found');
    if (session.ticket) return session.ticket;

    const lastCustomer = [...session.messages].reverse().find((message) => message.role === 'CUSTOMER');
    const transcript = session.messages
      .map((message) => `${message.role === 'CUSTOMER' ? 'Customer' : 'GoPasal Assistant'}: ${message.body}`)
      .join('\n\n')
      .slice(-3500);
    const opening = [reason?.trim(), transcript].filter(Boolean).join('\n\n').slice(0, 4000);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.supportTicket.create({
          data: {
            code: `TKT-${ticketCode()}`,
            userId,
            subject: subject?.trim() || lastCustomer?.body.slice(0, 120) || 'Support assistant handoff',
            category: 'assistant_handoff',
            messages: {
              create: {
                authorId: userId,
                body: opening || 'Please continue this conversation with a support person.',
                isStaff: false,
              },
            },
          },
        });
        const claimed = await tx.supportAssistantSession.updateMany({
          where: { id: sessionId, userId, ticketId: null },
          data: { ticketId: created.id, status: 'ESCALATED' },
        });
        // Concurrent retries may both enter this transaction. Only the request
        // that claims the still-unlinked session keeps its ticket; throwing
        // rolls the losing ticket back instead of leaving an orphan behind.
        if (claimed.count !== 1) throw new Error('Support conversation was already escalated');
        return created;
      });
    } catch (error) {
      // Return the winner of a concurrent retry so escalation is idempotent from
      // the customer's perspective.
      const claimed = await this.prisma.supportAssistantSession.findFirst({
        where: { id: sessionId, userId },
        select: { ticket: true },
      });
      if (claimed?.ticket) return claimed.ticket;
      throw error;
    }
  }

  knowledge() {
    return {
      version: SUPPORT_KNOWLEDGE_VERSION,
      articles: SUPPORT_KNOWLEDGE.map(({ keywords: _keywords, ...article }) => article),
    };
  }

  private async resolveSession(userId: string, sessionId?: string) {
    if (sessionId) {
      const session = await this.prisma.supportAssistantSession.findFirst({
        where: { id: sessionId, userId, status: 'ACTIVE' },
      });
      if (!session) throw new NotFoundException('Active support conversation not found');
      return session;
    }
    const active = await this.prisma.supportAssistantSession.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { lastMessageAt: 'desc' },
    });
    return active ?? this.prisma.supportAssistantSession.create({ data: { userId } });
  }

  private view<T extends { messages: Array<{ sourceIds: string[] }>; ticket: unknown }>(session: T) {
    const titles = new Map(SUPPORT_KNOWLEDGE.map((article) => [article.id, article.title]));
    return {
      ...session,
      knowledgeVersion: SUPPORT_KNOWLEDGE_VERSION,
      messages: session.messages.map((message) => ({
        ...message,
        sources: message.sourceIds.map((id) => ({ id, title: titles.get(id) ?? 'Approved GoPasal guidance' })),
      })),
    };
  }
}

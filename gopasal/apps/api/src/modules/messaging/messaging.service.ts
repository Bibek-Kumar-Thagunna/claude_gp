import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConversationSender, ConversationStatus, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EVENTS, type ConversationMessageCreatedEvent } from '../../common/events';
import { paginate } from '../../common/dto/pagination.dto';
import type { ListConversationsQueryDto } from './dto/messaging.dto';

const conversationSummaryInclude = {
  shop: { select: { id: true, slug: true, name: true, nameNp: true, logoImage: true, emoji: true, status: true } },
  customer: { select: { id: true, name: true, avatarUrl: true } },
  order: { select: { id: true, code: true, status: true, placedAt: true } },
  messages: { orderBy: { createdAt: 'desc' as const }, take: 1 },
} satisfies Prisma.ShopConversationInclude;

const conversationDetailInclude = {
  shop: { select: { id: true, slug: true, name: true, nameNp: true, logoImage: true, emoji: true, status: true } },
  customer: { select: { id: true, name: true, avatarUrl: true } },
  order: { select: { id: true, code: true, status: true, placedAt: true } },
  messages: {
    // Fetch the newest bounded window so an established conversation does not
    // get stuck showing its first messages forever. `detail` restores chat order.
    orderBy: { createdAt: 'desc' as const },
    take: 200,
    select: { id: true, authorId: true, sender: true, body: true, clientMessageId: true, createdAt: true },
  },
} satisfies Prisma.ShopConversationInclude;

type Audience = 'CUSTOMER' | 'SHOP';

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async startForCustomer(
    customerId: string,
    input: { shopId: string; orderId?: string; body: string; clientMessageId: string },
  ) {
    const context = await this.customerContext(customerId, input.shopId, input.orderId);
    const conversation = await this.prisma.shopConversation.upsert({
      where: {
        shopId_customerId_contextKey: {
          shopId: input.shopId,
          customerId,
          contextKey: context.contextKey,
        },
      },
      create: {
        shopId: input.shopId,
        customerId,
        orderId: input.orderId,
        contextKey: context.contextKey,
        kind: context.kind,
        customerLastReadAt: new Date(),
      },
      update: {},
    });
    return this.createMessage(conversation.id, customerId, 'CUSTOMER', input.body, input.clientMessageId);
  }

  async startForShopOrder(
    shopId: string,
    actorId: string,
    input: { orderId: string; body: string; clientMessageId: string },
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: input.orderId, shopId },
      select: { id: true, customerId: true },
    });
    if (!order) throw new NotFoundException('Order not found for this shop');

    const conversation = await this.prisma.shopConversation.upsert({
      where: {
        shopId_customerId_contextKey: {
          shopId,
          customerId: order.customerId,
          contextKey: `ORDER:${order.id}`,
        },
      },
      create: {
        shopId,
        customerId: order.customerId,
        orderId: order.id,
        contextKey: `ORDER:${order.id}`,
        kind: 'ORDER',
        shopLastReadAt: new Date(),
      },
      update: {},
    });
    return this.createMessage(conversation.id, actorId, 'SHOP', input.body, input.clientMessageId);
  }

  async listForCustomer(customerId: string, query: ListConversationsQueryDto) {
    const where: Prisma.ShopConversationWhereInput = { customerId };
    const [rows, total] = await Promise.all([
      this.prisma.shopConversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: query.skip,
        take: query.limit,
        include: conversationSummaryInclude,
      }),
      this.prisma.shopConversation.count({ where }),
    ]);
    return paginate(rows.map((row) => this.summary(row, 'CUSTOMER')), total, query.page, query.limit);
  }

  async listForShop(shopId: string, query: ListConversationsQueryDto) {
    const where: Prisma.ShopConversationWhereInput = { shopId };
    const [rows, total] = await Promise.all([
      this.prisma.shopConversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: query.skip,
        take: query.limit,
        include: conversationSummaryInclude,
      }),
      this.prisma.shopConversation.count({ where }),
    ]);
    return paginate(rows.map((row) => this.summary(row, 'SHOP')), total, query.page, query.limit);
  }

  async detailForCustomer(customerId: string, conversationId: string) {
    const conversation = await this.prisma.shopConversation.findFirst({
      where: { id: conversationId, customerId },
      include: conversationDetailInclude,
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return this.detail(conversation, 'CUSTOMER');
  }

  async detailForShop(shopId: string, conversationId: string) {
    const conversation = await this.prisma.shopConversation.findFirst({
      where: { id: conversationId, shopId },
      include: conversationDetailInclude,
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return this.detail(conversation, 'SHOP');
  }

  async sendForCustomer(
    customerId: string,
    conversationId: string,
    input: { body: string; clientMessageId: string },
  ) {
    const conversation = await this.prisma.shopConversation.findFirst({
      where: { id: conversationId, customerId },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return this.createMessage(conversation.id, customerId, 'CUSTOMER', input.body, input.clientMessageId);
  }

  async sendForShop(
    shopId: string,
    actorId: string,
    conversationId: string,
    input: { body: string; clientMessageId: string },
  ) {
    const conversation = await this.prisma.shopConversation.findFirst({
      where: { id: conversationId, shopId },
      select: { id: true },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return this.createMessage(conversation.id, actorId, 'SHOP', input.body, input.clientMessageId);
  }

  async markReadForCustomer(customerId: string, conversationId: string) {
    const changed = await this.prisma.shopConversation.updateMany({
      where: { id: conversationId, customerId },
      data: { customerLastReadAt: new Date() },
    });
    if (!changed.count) throw new NotFoundException('Conversation not found');
    return { ok: true };
  }

  async markReadForShop(shopId: string, conversationId: string) {
    const changed = await this.prisma.shopConversation.updateMany({
      where: { id: conversationId, shopId },
      data: { shopLastReadAt: new Date() },
    });
    if (!changed.count) throw new NotFoundException('Conversation not found');
    return { ok: true };
  }

  async closeForCustomer(customerId: string, conversationId: string) {
    return this.close({ id: conversationId, customerId });
  }

  async closeForShop(shopId: string, conversationId: string) {
    return this.close({ id: conversationId, shopId });
  }

  private async close(where: Prisma.ShopConversationWhereInput) {
    const changed = await this.prisma.shopConversation.updateMany({
      where,
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    if (!changed.count) throw new NotFoundException('Conversation not found');
    return { ok: true, status: ConversationStatus.CLOSED };
  }

  private async customerContext(customerId: string, shopId: string, orderId?: string) {
    if (!orderId) {
      const shop = await this.prisma.shop.findFirst({ where: { id: shopId, status: 'ACTIVE' }, select: { id: true } });
      if (!shop) throw new NotFoundException('Shop not found or unavailable');
      return { contextKey: 'PRE_ORDER', kind: 'PRE_ORDER' as const };
    }

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId },
      select: { id: true, shopId: true },
    });
    if (!order || order.shopId !== shopId) throw new ForbiddenException('This order does not belong to you and this shop');
    return { contextKey: `ORDER:${order.id}`, kind: 'ORDER' as const };
  }

  private async createMessage(
    conversationId: string,
    actorId: string,
    sender: ConversationSender,
    rawBody: string,
    clientMessageId: string,
  ) {
    const body = rawBody.trim();
    if (!body) throw new BadRequestException('Message cannot be empty');
    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.shopMessage.findUnique({
        where: { conversationId_clientMessageId: { conversationId, clientMessageId } },
      });
      if (existing) return { message: existing, created: false };

      const message = await tx.shopMessage.create({
        data: { conversationId, authorId: actorId, sender, body, clientMessageId },
      });
      await tx.shopConversation.update({
        where: { id: conversationId },
        data: {
          status: 'OPEN',
          closedAt: null,
          lastMessageAt: message.createdAt,
          ...(sender === 'CUSTOMER'
            ? { customerLastReadAt: message.createdAt }
            : { shopLastReadAt: message.createdAt }),
        },
      });
      return { message, created: true };
    });

    if (result.created) {
      const conversation = await this.prisma.shopConversation.findUniqueOrThrow({
        where: { id: conversationId },
        select: { shopId: true, customerId: true },
      });
      this.events.emit(EVENTS.CONVERSATION_MESSAGE_CREATED, {
        conversationId,
        shopId: conversation.shopId,
        customerId: conversation.customerId,
        messageId: result.message.id,
        authorId: actorId,
        sender,
        body: result.message.body,
        createdAt: result.message.createdAt.toISOString(),
      } satisfies ConversationMessageCreatedEvent);
    }
    return result.message;
  }

  private summary<T extends { messages: { sender: ConversationSender; createdAt: Date }[]; customerLastReadAt: Date | null; shopLastReadAt: Date | null }>(
    row: T,
    audience: Audience,
  ) {
    const lastMessage = row.messages[0] ?? null;
    const lastReadAt = audience === 'CUSTOMER' ? row.customerLastReadAt : row.shopLastReadAt;
    const incoming = audience === 'CUSTOMER' ? ConversationSender.SHOP : ConversationSender.CUSTOMER;
    return {
      ...row,
      lastMessage,
      messages: undefined,
      hasUnread: Boolean(lastMessage && lastMessage.sender === incoming && (!lastReadAt || lastMessage.createdAt > lastReadAt)),
    };
  }

  private detail<T extends { messages: { sender: ConversationSender; createdAt: Date }[]; customerLastReadAt: Date | null; shopLastReadAt: Date | null }>(
    row: T,
    audience: Audience,
  ) {
    const messages = [...row.messages].reverse();
    const lastMessage = messages[messages.length - 1] ?? null;
    const lastReadAt = audience === 'CUSTOMER' ? row.customerLastReadAt : row.shopLastReadAt;
    const incoming = audience === 'CUSTOMER' ? ConversationSender.SHOP : ConversationSender.CUSTOMER;
    return {
      ...row,
      messages,
      hasUnread: Boolean(lastMessage && lastMessage.sender === incoming && (!lastReadAt || lastMessage.createdAt > lastReadAt)),
    };
  }
}

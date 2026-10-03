/* eslint-disable @typescript-eslint/require-await -- Prisma-shaped memory fakes keep async contracts. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { MessagingService } from './messaging.service';

type Conversation = {
  id: string;
  shopId: string;
  customerId: string;
  orderId?: string;
  contextKey: string;
  kind: 'PRE_ORDER' | 'ORDER';
  status: 'OPEN' | 'CLOSED';
  lastMessageAt: Date;
  customerLastReadAt: Date | null;
  shopLastReadAt: Date | null;
  closedAt: Date | null;
};

type Message = {
  id: string;
  conversationId: string;
  authorId: string;
  sender: 'CUSTOMER' | 'SHOP' | 'SYSTEM';
  body: string;
  clientMessageId: string;
  createdAt: Date;
};

class MessagingDatabase {
  activeShop = true;
  readonly order = { id: 'order-1', shopId: 'shop-1', customerId: 'customer-1' };
  readonly conversations: Conversation[] = [];
  readonly messages: Message[] = [];

  readonly shop = {
    findFirst: async (args: { where: { id: string; status: string } }) =>
      this.activeShop && args.where.id === 'shop-1' && args.where.status === 'ACTIVE' ? { id: 'shop-1' } : null,
  };

  readonly orderModel = {
    findFirst: async (args: { where: { id: string; shopId?: string; customerId?: string } }) => {
      const where = args.where;
      return where.id === this.order.id &&
        (!where.shopId || where.shopId === this.order.shopId) &&
        (!where.customerId || where.customerId === this.order.customerId)
        ? this.order
        : null;
    },
  };

  readonly shopConversation = {
    upsert: async (args: {
      where: { shopId_customerId_contextKey: { shopId: string; customerId: string; contextKey: string } };
      create: Omit<Conversation, 'id' | 'status' | 'lastMessageAt' | 'closedAt' | 'shopLastReadAt' | 'customerLastReadAt'> & Partial<Conversation>;
    }) => {
      const key = args.where.shopId_customerId_contextKey;
      const existing = this.conversations.find((row) =>
        row.shopId === key.shopId && row.customerId === key.customerId && row.contextKey === key.contextKey,
      );
      if (existing) return existing;
      const row: Conversation = {
        id: `conversation-${this.conversations.length + 1}`,
        shopId: args.create.shopId,
        customerId: args.create.customerId,
        orderId: args.create.orderId,
        contextKey: args.create.contextKey,
        kind: args.create.kind,
        status: 'OPEN',
        lastMessageAt: new Date(),
        customerLastReadAt: args.create.customerLastReadAt ?? null,
        shopLastReadAt: args.create.shopLastReadAt ?? null,
        closedAt: null,
      };
      this.conversations.push(row);
      return row;
    },
    update: async (args: { where: { id: string }; data: Partial<Conversation> }) => {
      const row = this.conversations.find((item) => item.id === args.where.id);
      if (!row) throw new Error('conversation missing');
      Object.assign(row, args.data);
      return row;
    },
    findUniqueOrThrow: async (args: { where: { id: string } }) => {
      const row = this.conversations.find((item) => item.id === args.where.id);
      if (!row) throw new Error('conversation missing');
      return { shopId: row.shopId, customerId: row.customerId };
    },
  };

  readonly shopMessage = {
    findUnique: async (args: { where: { conversationId_clientMessageId: { conversationId: string; clientMessageId: string } } }) => {
      const key = args.where.conversationId_clientMessageId;
      return this.messages.find((row) => row.conversationId === key.conversationId && row.clientMessageId === key.clientMessageId) ?? null;
    },
    create: async (args: { data: Omit<Message, 'id' | 'createdAt'> }) => {
      const row: Message = { id: `message-${this.messages.length + 1}`, createdAt: new Date(), ...args.data };
      this.messages.push(row);
      return row;
    },
  };

  readonly prisma = {
    shop: this.shop,
    order: this.orderModel,
    shopConversation: this.shopConversation,
    shopMessage: this.shopMessage,
    $transaction: async <T>(work: (tx: { shopConversation: MessagingDatabase['shopConversation']; shopMessage: MessagingDatabase['shopMessage'] }) => Promise<T>) =>
      work({ shopConversation: this.shopConversation, shopMessage: this.shopMessage }),
  };
}

function harness() {
  const db = new MessagingDatabase();
  const emitted: Array<{ name: string; payload: Record<string, unknown> }> = [];
  const events = {
    emit: (name: string, payload: Record<string, unknown>) => {
      emitted.push({ name, payload });
      return true;
    },
  };
  return {
    db,
    emitted,
    service: new MessagingService(
      db.prisma as unknown as PrismaService,
      events as unknown as EventEmitter2,
    ),
  };
}

describe('customer↔shop messaging policy', () => {
  it('lets a customer initiate a pre-order conversation and trims the persisted message', async () => {
    const state = harness();
    const message = await state.service.startForCustomer('customer-1', {
      shopId: 'shop-1',
      body: '  Is this in stock?  ',
      clientMessageId: 'client-1',
    });

    assert.equal(message.body, 'Is this in stock?');
    assert.equal(message.sender, 'CUSTOMER');
    assert.equal(state.db.conversations[0]?.kind, 'PRE_ORDER');
    assert.equal(state.db.conversations[0]?.orderId, undefined);
    assert.equal(state.emitted.length, 1);
    assert.equal(state.emitted[0]?.payload.authorId, 'customer-1');
  });

  it('deduplicates a client retry and emits only once', async () => {
    const state = harness();
    const input = { shopId: 'shop-1', body: 'Hello', clientMessageId: 'same-retry-id' };
    const first = await state.service.startForCustomer('customer-1', input);
    const retry = await state.service.startForCustomer('customer-1', input);

    assert.equal(retry.id, first.id);
    assert.equal(state.db.messages.length, 1);
    assert.equal(state.emitted.length, 1);
  });

  it('does not open a new pre-order chat for an unavailable shop', async () => {
    const state = harness();
    state.db.activeShop = false;
    await assert.rejects(
      () => state.service.startForCustomer('customer-1', {
        shopId: 'shop-1', body: 'Hello', clientMessageId: 'client-2',
      }),
      /unavailable/i,
    );
    assert.equal(state.db.conversations.length, 0);
  });

  it('lets shop staff initiate only when the order belongs to that shop', async () => {
    const state = harness();
    await assert.rejects(
      () => state.service.startForShopOrder('shop-2', 'staff-1', {
        orderId: 'order-1', body: 'Substitution needed', clientMessageId: 'client-3',
      }),
      /not found/i,
    );

    const message = await state.service.startForShopOrder('shop-1', 'staff-1', {
      orderId: 'order-1', body: 'Substitution needed', clientMessageId: 'client-4',
    });
    assert.equal(message.sender, 'SHOP');
    assert.equal(state.db.conversations[0]?.kind, 'ORDER');
    assert.equal(state.db.conversations[0]?.customerId, 'customer-1');
  });

  it('does not let a customer attach someone else’s order to a conversation', async () => {
    const state = harness();
    await assert.rejects(
      () => state.service.startForCustomer('customer-2', {
        shopId: 'shop-1', orderId: 'order-1', body: 'Hello', clientMessageId: 'client-5',
      }),
      /does not belong/i,
    );
    assert.equal(state.db.conversations.length, 0);
  });
});

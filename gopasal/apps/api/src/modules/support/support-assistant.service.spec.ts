/* eslint-disable @typescript-eslint/require-await -- Prisma-shaped memory fakes keep async contracts. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { SupportAssistantProvider } from '../../providers/support-assistant.provider';
import { SupportAssistantService } from './support-assistant.service';

const provider: SupportAssistantProvider = {
  name: 'knowledge',
  answer: async () => {
    throw new Error('not used by escalation tests');
  },
};

const messages = [
  { role: 'CUSTOMER', body: 'My order has not moved.' },
  { role: 'ASSISTANT', body: 'A support person can review it.' },
] as const;

function service(prisma: object) {
  return new SupportAssistantService(prisma as PrismaService, provider);
}

describe('support assistant handoff policy', () => {
  it('does not expose or escalate another customer’s conversation', async () => {
    const prisma = {
      supportAssistantSession: {
        findFirst: async ({ where }: { where: { userId: string } }) =>
          where.userId === 'owner' ? { id: 'session-1', messages, ticket: null } : null,
      },
    };

    await assert.rejects(
      () => service(prisma).escalate('not-owner', 'session-1'),
      /Support conversation not found/,
    );
  });

  it('creates one transcript ticket and atomically claims the session', async () => {
    let ticketCreate: { data: Record<string, unknown> } | undefined;
    let sessionClaim: { where: Record<string, unknown>; data: Record<string, unknown> } | undefined;
    const ticket = { id: 'ticket-1', code: 'TKT-ABC123', status: 'OPEN' };
    const tx = {
      supportTicket: {
        create: async (args: { data: Record<string, unknown> }) => {
          ticketCreate = args;
          return ticket;
        },
      },
      supportAssistantSession: {
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          sessionClaim = args;
          return { count: 1 };
        },
      },
    };
    const prisma = {
      supportAssistantSession: {
        findFirst: async () => ({ id: 'session-1', messages, ticket: null }),
      },
      $transaction: async <T>(work: (client: typeof tx) => Promise<T>) => work(tx),
    };

    const result = await service(prisma).escalate('owner', 'session-1');
    assert.equal(result.id, 'ticket-1');
    assert.equal(ticketCreate?.data.category, 'assistant_handoff');
    assert.deepEqual(sessionClaim?.where, { id: 'session-1', userId: 'owner', ticketId: null });
    assert.deepEqual(sessionClaim?.data, { ticketId: 'ticket-1', status: 'ESCALATED' });
    assert.match(JSON.stringify(ticketCreate?.data), /Customer: My order has not moved/);
    assert.match(JSON.stringify(ticketCreate?.data), /GoPasal Assistant: A support person can review it/);
  });

  it('returns the winning ticket when simultaneous retries race', async () => {
    const winner = { id: 'ticket-winner', code: 'TKT-WINNER', status: 'OPEN' };
    let lookup = 0;
    const tx = {
      supportTicket: { create: async () => ({ id: 'ticket-loser' }) },
      supportAssistantSession: { updateMany: async () => ({ count: 0 }) },
    };
    const prisma = {
      supportAssistantSession: {
        findFirst: async () => {
          lookup += 1;
          return lookup === 1
            ? { id: 'session-1', messages, ticket: null }
            : { ticket: winner };
        },
      },
      $transaction: async <T>(work: (client: typeof tx) => Promise<T>) => work(tx),
    };

    const result = await service(prisma).escalate('owner', 'session-1');
    assert.deepEqual(result, winner);
  });
});

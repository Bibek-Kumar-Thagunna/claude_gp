import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PaymentMethod, PaymentStatus, RefundMethod, RefundStatus } from '@prisma/client';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { PaymentProvider } from '../../providers/payment.provider';
import { FinanceService } from './finance.service';

describe('cancellation refund reservation', () => {
  it('reserves only the remaining paid amount and creates an original-source operation', async () => {
    let financeWrite: unknown;
    let refundWrite: { data?: Record<string, unknown> } | undefined;
    const tx = {
      order: { findUnique: () => Promise.resolve({
        id: 'order_1', total: 500, paymentMethod: PaymentMethod.ESEWA,
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
        finance: { id: 'finance_1', refundAmount: 100, refundReservedAmount: 50 },
      }) },
      orderFinance: { updateMany: (input: unknown) => { financeWrite = input; return Promise.resolve({ count: 1 }); } },
      refund: { create: (input: { data?: Record<string, unknown> }) => { refundWrite = input; return Promise.resolve(input.data); } },
    };
    const service = new FinanceService(
      {} as PrismaService,
      {} as ConfigService<AppConfig, true>,
    );

    await service.reserveCancellationRefund(
      tx as never,
      'order_1',
      'customer_1',
      'Plans changed',
    );

    assert.match(JSON.stringify(financeWrite), /"increment":350/);
    assert.equal(refundWrite?.data?.amount, 350);
    assert.equal(refundWrite?.data?.method, RefundMethod.ORIGINAL_SOURCE);
    assert.equal(refundWrite?.data?.status, RefundStatus.PENDING);
  });

  it('does nothing when the whole amount is already completed or reserved', async () => {
    let created = 0;
    const tx = {
      order: { findUnique: () => Promise.resolve({
        id: 'order_1', total: 500, paymentMethod: PaymentMethod.KHALTI,
        paymentStatus: PaymentStatus.PARTIALLY_REFUNDED,
        finance: { id: 'finance_1', refundAmount: 300, refundReservedAmount: 200 },
      }) },
      refund: { create: () => { created += 1; return Promise.resolve({}); } },
    };
    const service = new FinanceService(
      {} as PrismaService,
      {} as ConfigService<AppConfig, true>,
    );

    assert.equal(await service.reserveCancellationRefund(tx as never, 'order_1', 'customer_1', 'Cancelled'), null);
    assert.equal(created, 0);
  });
});

describe('original-source refund processing', () => {
  const pendingRefund = {
    id: 'refund_1',
    status: RefundStatus.PENDING,
    method: RefundMethod.ORIGINAL_SOURCE,
    amount: 500,
    attemptCount: 0,
    nextAttemptAt: null,
    order: {
      total: 500,
      paymentMethod: PaymentMethod.KHALTI,
      paymentIntent: { reference: 'PIDX-1' },
      finance: { refundAmount: 0 },
    },
  };

  it('claims once and records the real provider transaction reference', async () => {
    const writes: Array<Record<string, unknown>> = [];
    const prisma = {
      refund: {
        findUnique: () => Promise.resolve(pendingRefund),
        updateMany: (input: Record<string, unknown>) => {
          writes.push(input);
          return Promise.resolve({ count: 1 });
        },
        findUniqueOrThrow: () => Promise.resolve(pendingRefund),
      },
    } as unknown as PrismaService;
    let providerInput: { providerRef: string; amount: number } | undefined;
    const provider: PaymentProvider = {
      method: 'KHALTI',
      enabled: true,
      init: () => Promise.reject(new Error('not used')),
      verify: () => Promise.reject(new Error('not used')),
      refundFull: (input) => {
        providerInput = input;
        return Promise.resolve({ status: 'COMPLETED', providerRef: 'KHALTI-TX-1' });
      },
    };
    const service = new FinanceService(
      prisma,
      {} as ConfigService<AppConfig, true>,
      [provider],
    );
    let completion: { actorId?: string; refundId: string; providerReference?: string } | undefined;
    service.completeRefund = (actorId, refundId, input) => {
      completion = { actorId, refundId, providerReference: input.providerReference };
      return Promise.resolve({ id: refundId }) as never;
    };

    await service.processRefund('refund_1', 'admin_1');

    assert.deepEqual(providerInput, { providerRef: 'PIDX-1', amount: 500 });
    assert.deepEqual(completion, {
      actorId: 'admin_1',
      refundId: 'refund_1',
      providerReference: 'KHALTI-TX-1',
    });
    assert.equal(writes.length, 1);
    assert.match(JSON.stringify(writes[0]), /"status":"PROCESSING"/);
    assert.match(JSON.stringify(writes[0]), /"increment":1/);
  });

  it('returns a failed provider attempt to the retry queue with backoff', async () => {
    const writes: Array<Record<string, unknown>> = [];
    const prisma = {
      refund: {
        findUnique: () => Promise.resolve(pendingRefund),
        updateMany: (input: Record<string, unknown>) => {
          writes.push(input);
          return Promise.resolve({ count: 1 });
        },
        findUniqueOrThrow: () => Promise.resolve(pendingRefund),
      },
    } as unknown as PrismaService;
    const provider: PaymentProvider = {
      method: 'KHALTI',
      enabled: true,
      init: () => Promise.reject(new Error('not used')),
      verify: () => Promise.reject(new Error('not used')),
      refundFull: () => Promise.reject(new Error('gateway temporarily unavailable')),
    };
    const service = new FinanceService(
      prisma,
      {} as ConfigService<AppConfig, true>,
      [provider],
    );

    await assert.rejects(service.processRefund('refund_1'), /gateway temporarily unavailable/);

    assert.equal(writes.length, 2);
    const retryWrite = writes[1] as {
      data: { status: RefundStatus; failureReason: string; nextAttemptAt: Date };
    };
    assert.equal(retryWrite.data.status, RefundStatus.PENDING);
    assert.equal(retryWrite.data.failureReason, 'gateway temporarily unavailable');
    assert.ok(retryWrite.data.nextAttemptAt instanceof Date);
    assert.ok(retryWrite.data.nextAttemptAt.getTime() > Date.now());
  });

  it('refuses to manufacture an automatic refund for a provider without an approved API', async () => {
    const prisma = {
      refund: {
        findUnique: () => Promise.resolve({
          ...pendingRefund,
          order: { ...pendingRefund.order, paymentMethod: PaymentMethod.ESEWA },
        }),
      },
    } as unknown as PrismaService;
    const esewa: PaymentProvider = {
      method: 'ESEWA',
      enabled: true,
      init: () => Promise.reject(new Error('not used')),
      verify: () => Promise.reject(new Error('not used')),
    };
    const service = new FinanceService(
      prisma,
      {} as ConfigService<AppConfig, true>,
      [esewa],
    );

    await assert.rejects(
      service.processRefund('refund_1'),
      /refund API is not configured/,
    );
  });
});

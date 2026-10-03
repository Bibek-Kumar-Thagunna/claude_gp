import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { OrdersService } from '../orders/orders.service';
import type { UploadsService } from '../uploads/uploads.service';
import { DeliveryService } from './delivery.service';
import type { RiderLocationService } from './rider-location.service';

const proof = {
  buffer: Buffer.from([0xff, 0xd8, 0xff]),
  mimeType: 'image/jpeg' as const,
  fileName: 'delivery-proof-delivery_1.jpg',
};

function subject(options: {
  customerId?: string;
  shopId?: string;
  orderStatus?: 'OUT_FOR_DELIVERY' | 'DELIVERED';
  assignedRiderId?: string;
  signedInRiderId?: string;
}) {
  let reads = 0;
  const audits: Array<{ surface?: string; entityId?: string | null }> = [];
  const row = {
    id: 'delivery_1',
    orderId: 'order_1',
    riderId: options.assignedRiderId ?? 'rider_1',
    podImageUrl: `private/delivery-proofs/delivery_1/${'a'.repeat(32)}.jpg`,
    order: {
      customerId: options.customerId ?? 'customer_1',
      shopId: options.shopId ?? 'shop_1',
      status: options.orderStatus ?? 'DELIVERED',
    },
  };
  const prisma = {
    delivery: { findUnique: () => Promise.resolve(row) },
    rider: { findUnique: () => Promise.resolve({ id: options.signedInRiderId ?? 'rider_1' }) },
  } as unknown as PrismaService;
  const uploads = {
    readDeliveryProof: () => { reads += 1; return Promise.resolve(proof); },
  } as unknown as UploadsService;
  const audit = {
    record: (entry: { surface?: string; entityId?: string | null }) => {
      audits.push(entry);
      return Promise.resolve();
    },
  } as unknown as AuditService;
  const service = new DeliveryService(
    prisma,
    {} as OrdersService,
    {} as RiderLocationService,
    new EventEmitter2(),
    uploads,
    audit,
  );
  return { service, reads: () => reads, audits };
}

describe('delivery proof read authorization', () => {
  it('does not read bytes for another customer', async () => {
    const { service, reads } = subject({ customerId: 'customer_owner' });
    await assert.rejects(
      () => service.downloadProofForCustomer('customer_other', 'order_1'),
      NotFoundException,
    );
    assert.equal(reads(), 0);
  });

  it('does not read bytes through another shop scope', async () => {
    const { service, reads } = subject({ shopId: 'shop_owner' });
    await assert.rejects(
      () => service.downloadProofForSeller('seller_1', 'shop_other', 'order_1'),
      NotFoundException,
    );
    assert.equal(reads(), 0);
  });

  it('does not read bytes for a different rider', async () => {
    const { service, reads } = subject({ assignedRiderId: 'rider_owner', signedInRiderId: 'rider_other' });
    await assert.rejects(
      () => service.downloadProofForRider('user_other', 'order_1'),
      NotFoundException,
    );
    assert.equal(reads(), 0);
  });

  it('waits until delivery before exposing evidence to the customer', async () => {
    const { service, reads } = subject({ orderStatus: 'OUT_FOR_DELIVERY' });
    await assert.rejects(
      () => service.downloadProofForCustomer('customer_1', 'order_1'),
      BadRequestException,
    );
    assert.equal(reads(), 0);
  });

  it('returns the private bytes to the owner and audit logs the read', async () => {
    const { service, reads, audits } = subject({});
    assert.deepEqual(await service.downloadProofForCustomer('customer_1', 'order_1'), proof);
    assert.equal(reads(), 1);
    assert.deepEqual(audits.map((entry) => [entry.surface, entry.entityId]), [
      ['customer', 'delivery_1'],
    ]);
  });
});

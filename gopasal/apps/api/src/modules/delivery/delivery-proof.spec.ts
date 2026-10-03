import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeliveryStatus } from '@prisma/client';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { OrdersService } from '../orders/orders.service';
import type { UploadedFile } from '../uploads/uploaded-file';
import type { UploadsService } from '../uploads/uploads.service';
import type { AuditService } from '../audit/audit.service';
import { DeliveryService } from './delivery.service';
import type { RiderLocationService } from './rider-location.service';

const delivery = (riderId: string) => ({
  id: 'delivery_1',
  orderId: 'order_1',
  riderId,
  status: 'EN_ROUTE',
  podImageUrl: null,
  order: {
    shopId: 'shop_1',
    customerId: 'customer_1',
    code: 'GP-100001',
    status: 'OUT_FOR_DELIVERY',
    paymentMethod: 'COD',
    total: 420,
  },
});

const file: UploadedFile = {
  fieldname: 'file',
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  originalname: 'doorstep.jpg',
  encoding: '7bit',
  mimetype: 'image/jpeg',
  size: 4,
};

function subject(options: {
  assignedRider: string;
  onUpload?: () => void;
  onUpdate?: (key: string) => void;
}) {
  const prisma = {
    rider: { findUnique: () => Promise.resolve({ id: 'rider_me' }) },
    delivery: {
      findUnique: () => Promise.resolve(delivery(options.assignedRider)),
      update: ({ data }: { data: { podImageUrl: string } }) => {
        options.onUpdate?.(data.podImageUrl);
        return Promise.resolve(delivery(options.assignedRider));
      },
    },
  } as unknown as PrismaService;
  const uploads = {
    storeDeliveryProof: () => {
      options.onUpload?.();
      return Promise.resolve({
        key: 'private/delivery-proofs/delivery_1/secret.jpg',
        url: null,
        mime: 'image/jpeg',
        extension: 'jpg',
        size: 4,
        displayName: 'doorstep.jpg',
      });
    },
    remove: () => Promise.resolve(),
  } as unknown as UploadsService;
  return new DeliveryService(
    prisma,
    {} as OrdersService,
    {} as RiderLocationService,
    new EventEmitter2(),
    uploads,
    { record: () => Promise.resolve() } as unknown as AuditService,
  );
}

describe('rider proof-of-delivery ownership', () => {
  it('rejects a proof upload for another rider before storing bytes', async () => {
    let uploadReached = false;
    const service = subject({ assignedRider: 'rider_other', onUpload: () => { uploadReached = true; } });
    await assert.rejects(() => service.uploadMyProof('user_me', 'order_1', file), ForbiddenException);
    assert.equal(uploadReached, false);
  });

  it('stores the private key but never returns it to the rider client', async () => {
    let storedKey = '';
    const service = subject({ assignedRider: 'rider_me', onUpdate: (key) => { storedKey = key; } });
    const result = await service.uploadMyProof('user_me', 'order_1', file);
    assert.equal(storedKey, 'private/delivery-proofs/delivery_1/secret.jpg');
    assert.deepEqual(result, { uploaded: true, mimeType: 'image/jpeg', size: 4 });
    assert.ok(!JSON.stringify(result).includes('private/'));
  });

  it('requires a factual note before a rider can record handover', async () => {
    const service = subject({ assignedRider: 'rider_me' });
    await assert.rejects(
      () => service.riderUpdateStatus('user_me', 'order_1', { status: DeliveryStatus.DELIVERED }),
      BadRequestException,
    );
  });

  it('requires a specific reason before a rider can close an attempt as failed', async () => {
    const service = subject({ assignedRider: 'rider_me' });
    await assert.rejects(
      () =>
        service.riderUpdateStatus('user_me', 'order_1', {
          status: DeliveryStatus.FAILED,
          failReason: '   ',
        }),
      BadRequestException,
    );
  });
});

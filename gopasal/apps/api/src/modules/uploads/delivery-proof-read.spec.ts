import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import type { StorageProvider } from '../../providers/storage.provider';
import { UploadsService } from './uploads.service';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const key = `private/delivery-proofs/delivery_1/${'a'.repeat(32)}.jpg`;

function subject(bytes = jpeg) {
  let reads = 0;
  const storage = {
    name: 'test',
    read: () => { reads += 1; return Promise.resolve(bytes); },
  } as unknown as StorageProvider;
  const config = { get: () => ({ maxImageBytes: 1_000, maxDocumentBytes: 1_000 }) } as unknown as ConfigService<AppConfig, true>;
  return { service: new UploadsService(storage, config, { name: 'disabled', scan: () => Promise.resolve(), ready: () => Promise.resolve(true) }), reads: () => reads };
}

describe('private delivery proof reads', () => {
  it('requires the exact delivery namespace and matching delivery id before storage', async () => {
    for (const hostile of [
      `private/shop-applications/delivery_1/${'a'.repeat(32)}.jpg`,
      `private/delivery-proofs/delivery_other/${'a'.repeat(32)}.jpg`,
      'public/products/photo.jpg',
      '../delivery-proof.jpg',
    ]) {
      const { service, reads } = subject();
      await assert.rejects(() => service.readDeliveryProof('delivery_1', hostile), BadRequestException);
      assert.equal(reads(), 0);
    }
  });

  it('re-sniffs stored bytes and returns no storage key', async () => {
    const { service } = subject();
    const result = await service.readDeliveryProof('delivery_1', key);
    assert.equal(result.mimeType, 'image/jpeg');
    assert.equal(result.fileName, 'delivery-proof-delivery_1.jpg');
    assert.deepEqual(result.buffer, jpeg);
    assert.ok(!JSON.stringify({ ...result, buffer: undefined }).includes('private/'));
  });

  it('refuses bytes that no longer match the canonical key type', async () => {
    const { service } = subject(Buffer.from('not a jpeg'));
    await assert.rejects(() => service.readDeliveryProof('delivery_1', key), BadRequestException);
  });
});

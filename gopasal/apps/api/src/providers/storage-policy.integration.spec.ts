import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { S3StorageProvider } from './storage.provider';

/** Run only against the loopback MinIO profile; never against a live customer bucket. */
describe('local S3 anonymous-access policy', () => {
  it('serves public product assets while denying unauthenticated private evidence and bucket listing', {
    skip: process.env.MINIO_INTEGRATION !== '1',
  }, async () => {
    const endpoint = 'http://127.0.0.1:19000';
    const bucket = 'gopasal-dev';
    const provider = new S3StorageProvider({
      endpoint,
      region: 'us-east-1',
      bucket,
      accessKey: 'gopasal_dev',
      secretKey: 'gopasal_dev_secret',
      forcePathStyle: true,
    });
    const id = randomUUID();
    const publicKey = `public/verification/${id}.txt`;
    const privateKey = `private/verification/${id}.txt`;
    const publicBytes = Buffer.from(`public-${id}`);
    const privateBytes = Buffer.from(`private-${id}`);
    try {
      const publicSaved = await provider.save(publicKey, publicBytes, 'text/plain');
      const privateSaved = await provider.save(privateKey, privateBytes, 'text/plain');
      assert.equal(privateSaved.url, null);
      assert.equal(publicSaved.url, `${endpoint}/${bucket}/${publicKey}`);
      assert.ok(publicSaved.url);

      const publicGet = await fetch(publicSaved.url);
      assert.equal(publicGet.status, 200);
      assert.deepEqual(Buffer.from(await publicGet.arrayBuffer()), publicBytes);

      const privateGet = await fetch(`${endpoint}/${bucket}/${privateKey}`);
      assert.equal(privateGet.status, 403, 'anonymous private GET must be denied');
      const list = await fetch(`${endpoint}/${bucket}?list-type=2`);
      assert.equal(list.status, 403, 'anonymous bucket listing must be denied');

      assert.deepEqual(await provider.read(privateKey), privateBytes, 'authorized signed read must still work');
    } finally {
      await Promise.allSettled([provider.remove(publicKey), provider.remove(privateKey)]);
    }
  });
});

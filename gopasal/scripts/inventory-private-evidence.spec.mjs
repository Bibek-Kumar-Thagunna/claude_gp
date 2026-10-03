import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applicationIdFromKey, parseS3List } from './inventory-private-evidence.mjs';

describe('private evidence inventory parsing', () => {
  it('reads URL-encoded S3 keys and continuation safely', () => {
    const page = parseS3List(`<?xml version="1.0"?><ListBucketResult>
      <Contents><Key>private%2Fshop-applications%2Fapp_1%2Fa%26b.pdf</Key><LastModified>2026-09-01T00:00:00.000Z</LastModified></Contents>
      <IsTruncated>true</IsTruncated><NextContinuationToken>token&amp;next</NextContinuationToken>
    </ListBucketResult>`);
    assert.deepEqual(page.objects, [{ key: 'private/shop-applications/app_1/a&b.pdf', lastModified: new Date('2026-09-01T00:00:00.000Z') }]);
    assert.equal(page.nextCursor, 'token&next');
  });

  it('fails closed on an incomplete S3 page', () => {
    assert.throws(() => parseS3List('<Error>AccessDenied</Error>'), /unexpected response/);
    assert.throws(() => parseS3List('<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>'), /continuation token/);
  });

  it('only associates an object with a two-segment application path', () => {
    assert.equal(applicationIdFromKey('private/shop-applications/app_1/a.pdf'), 'app_1');
    assert.equal(applicationIdFromKey('private/shop-applications/app_1/nested/a.pdf'), null);
    assert.equal(applicationIdFromKey('private/shop-applications/../a.pdf'), null);
  });
});

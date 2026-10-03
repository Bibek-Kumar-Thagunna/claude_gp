import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Response } from 'express';
import { sendDeliveryProof } from './send-delivery-proof';

function responseRecorder() {
  const headers: Record<string, string | number> = {};
  let body: Buffer | undefined;
  const res = {
    setHeader: (name: string, value: string | number) => { headers[name] = value; },
    end: (value: Buffer) => { body = value; },
  } as unknown as Response;
  return { res, headers, body: () => body };
}

describe('sendDeliveryProof', () => {
  it('serves only the trusted image type with private no-store headers', () => {
    const proof = {
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
      mimeType: 'image/jpeg' as const,
      fileName: 'delivery-proof-delivery_1.jpg',
    };
    const { res, headers, body } = responseRecorder();
    sendDeliveryProof(res, proof);
    assert.equal(headers['Content-Type'], 'image/jpeg');
    assert.equal(headers['Content-Length'], 3);
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['Content-Security-Policy'], "default-src 'none'; sandbox");
    assert.equal(headers['Cache-Control'], 'no-store, private');
    assert.match(String(headers['Content-Disposition']), /^inline; filename="delivery-proof-/);
    assert.deepEqual(body(), proof.buffer);
  });
});

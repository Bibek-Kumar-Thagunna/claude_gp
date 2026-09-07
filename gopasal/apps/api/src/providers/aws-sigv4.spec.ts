import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import { encodeS3Path, signatureParts, signRequest } from './aws-sigv4';

/**
 * SigV4 is hand-rolled here (no AWS SDK), so it earns its place only if it is
 * pinned to something external. The anchor is the worked "PutObject" example in
 * AWS's own documentation — its canonical request is reproduced verbatim below,
 * and the expected signature is derived from that text by an independent
 * implementation written straight from the published algorithm (`expectedFor`),
 * not by calling the code under test. A bug in signatureParts therefore shows up
 * as a mismatch in the canonical request, the signature, or both.
 */
const VECTOR = {
  accessKey: 'AKIAIOSFODNN7EXAMPLE',
  secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
  service: 's3',
  // AWS's example object key is `test$file.text` on examplebucket.
  url: 'https://examplebucket.s3.amazonaws.com/test%24file.text',
  body: 'Welcome to Amazon S3.',
  now: new Date('2013-05-24T00:00:00Z'),
  /** AWS documents this as the sha256 of the body — a free check on our hashing. */
  bodyHash: '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072',
  canonicalRequest: [
    'PUT',
    '/test%24file.text',
    '',
    'date:Fri, 24 May 2013 00:00:00 GMT',
    'host:examplebucket.s3.amazonaws.com',
    'x-amz-content-sha256:44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072',
    'x-amz-date:20130524T000000Z',
    'x-amz-storage-class:REDUCED_REDUNDANCY',
    '',
    'date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class',
    '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072',
  ].join('\n'),
};

/** Independent derivation: canonical request text -> signature. */
function expectedFor(canonicalRequest: string, dateStamp: string, amzDate: string): string {
  const sha = (d: string): string => createHash('sha256').update(d).digest('hex');
  const mac = (k: Buffer | string, d: string): Buffer => createHmac('sha256', k).update(d).digest();
  const scope = `${dateStamp}/${VECTOR.region}/${VECTOR.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha(canonicalRequest)].join('\n');
  const key = mac(
    mac(mac(mac(`AWS4${VECTOR.secretKey}`, dateStamp), VECTOR.region), VECTOR.service),
    'aws4_request',
  );
  return createHmac('sha256', key).update(stringToSign).digest('hex');
}

const sign = (): ReturnType<typeof signatureParts> =>
  signatureParts({
    method: 'PUT',
    url: VECTOR.url,
    region: VECTOR.region,
    service: VECTOR.service,
    accessKey: VECTOR.accessKey,
    secretKey: VECTOR.secretKey,
    payload: VECTOR.body,
    headers: { Date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
    now: VECTOR.now,
  });

describe('aws-sigv4', () => {
  it('builds the canonical request AWS documents for its PutObject example', () => {
    assert.equal(sign().canonicalRequest, VECTOR.canonicalRequest);
  });

  it('hashes the payload the way AWS says it should be hashed', () => {
    assert.equal(sign().headers['x-amz-content-sha256'], VECTOR.bodyHash);
  });

  it('produces the signature that canonical request implies', () => {
    const parts = sign();
    assert.equal(parts.signature, expectedFor(VECTOR.canonicalRequest, '20130524', '20130524T000000Z'));
  });

  it('signs host, the payload hash and the date, in sorted order', () => {
    assert.equal(sign().signedHeaders, 'date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class');
  });

  it('formats the Authorization header with credential scope and signed headers', () => {
    const auth = sign().headers.Authorization;
    assert.match(
      auth,
      /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/20130524\/us-east-1\/s3\/aws4_request, SignedHeaders=[a-z0-9;-]+, Signature=[0-9a-f]{64}$/,
    );
  });

  it('includes the port in the signed host, as MinIO on localhost requires', () => {
    const parts = signatureParts({
      method: 'PUT',
      url: 'http://localhost:19000/gopasal-dev/a.png',
      region: 'us-east-1',
      service: 's3',
      accessKey: 'k',
      secretKey: 's',
      payload: '',
      now: VECTOR.now,
    });
    assert.match(parts.canonicalRequest, /^host:localhost:19000$/m);
    assert.equal(parts.headers.Host, 'localhost:19000');
  });

  it('sorts and encodes the query string', () => {
    const parts = signatureParts({
      method: 'GET',
      url: 'https://example.com/x?b=2&a=1&a=0&c=hello%20world',
      region: 'us-east-1',
      service: 's3',
      accessKey: 'k',
      secretKey: 's',
      payload: '',
      now: VECTOR.now,
    });
    assert.equal(parts.canonicalRequest.split('\n')[2], 'a=0&a=1&b=2&c=hello%20world');
  });

  it('hashes an empty payload to the well-known empty-string digest', () => {
    const parts = signatureParts({
      method: 'DELETE',
      url: 'https://example.com/x',
      region: 'us-east-1',
      service: 's3',
      accessKey: 'k',
      secretKey: 's',
      payload: '',
      now: VECTOR.now,
    });
    assert.equal(
      parts.headers['x-amz-content-sha256'],
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('signRequest returns exactly the headers signatureParts computed', () => {
    assert.deepEqual(signRequest({
      method: 'PUT',
      url: VECTOR.url,
      region: VECTOR.region,
      service: VECTOR.service,
      accessKey: VECTOR.accessKey,
      secretKey: VECTOR.secretKey,
      payload: VECTOR.body,
      headers: { Date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
      now: VECTOR.now,
    }), sign().headers);
  });
});

describe('encodeS3Path', () => {
  it('keeps separators and unreserved characters', () => {
    assert.equal(encodeS3Path('shops/abc-1/product_2.PNG'), 'shops/abc-1/product_2.PNG');
  });

  it('percent-encodes spaces and the characters encodeURIComponent leaves alone', () => {
    assert.equal(encodeS3Path("a b/c'd(e)*f!.txt"), 'a%20b/c%27d%28e%29%2Af%21.txt');
  });

  it('encodes non-ASCII (Nepali filenames are normal here)', () => {
    assert.equal(encodeS3Path('कागज.pdf'), '%E0%A4%95%E0%A4%BE%E0%A4%97%E0%A4%9C.pdf');
  });

  it('encodes a literal + rather than letting it read as a space', () => {
    assert.equal(encodeS3Path('a+b.txt'), 'a%2Bb.txt');
  });
});

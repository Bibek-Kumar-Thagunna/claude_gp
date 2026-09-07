import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import {
  LocalStorageProvider,
  PRIVATE_PREFIX,
  PUBLIC_PREFIX,
  S3StorageProvider,
  STORAGE_PROVIDER,
  type StorageProvider,
  assertSafeKey,
  isPrivateKey,
  storageProviderFactory,
} from './storage.provider';

/**
 * Storage is the one provider where the local implementation writes real bytes,
 * so the local half of these tests performs actual writes into a temp directory
 * and reads them back — a provider that returned a URL without writing anything
 * would pass a mock-based test and fail a user.
 *
 * The S3 half stubs `fetch` and inspects the request: the signature itself is
 * pinned in aws-sigv4.spec.ts, so what is checked here is addressing, the
 * headers that get attached, and that a rejection is never read as a save.
 */
interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  bodyLength: number;
}

let restoreFetch: (() => void) | undefined;
let restoreLogger: (() => void) | undefined;
afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
  restoreLogger?.();
  restoreLogger = undefined;
});

/**
 * Capture what `Logger.error` was asked to write.
 *
 * The storage provider answers a bucket failure with a fixed sentence and keeps the
 * diagnosis in the log. Both halves need asserting: a test that only checked the
 * generic message would pass just as happily if the detail were dropped on the
 * floor, and "S3 said SignatureDoesNotMatch" is the one line an operator needs.
 */
function captureLogs(): string[] {
  const lines: string[] = [];
  // Saved to be re-installed on the prototype, never called through this reference,
  // so there is no `this` to lose — which is the only thing `unbound-method` guards.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const original = Logger.prototype.error;
  restoreLogger = () => {
    Logger.prototype.error = original;
  };
  Logger.prototype.error = function (message: unknown): void {
    lines.push(String(message));
  } as typeof original;
  return lines;
}

/**
 * A storage failure as the caller receives it: 503, one sentence, and nothing about
 * the bucket, the key or S3's own reply.
 *
 * `assert.rejects` with a RegExp tests the error's *string representation*, which is
 * why this is a validator function instead — the message has to be exact, not merely
 * matching, for "no detail leaked" to mean anything.
 */
function expectOpaqueStorageFailure(): (err: unknown) => true {
  return (err: unknown) => {
    assert.ok(err instanceof ServiceUnavailableException, `expected a 503, got ${String(err)}`);
    assert.equal(err.getStatus(), 503);
    assert.equal(err.message, 'File storage is not responding right now. Please try again in a moment.');
    return true;
  };
}

function stubFetch(reply: { status: number; body?: string } | Error): Call[] {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  restoreFetch = () => {
    globalThis.fetch = original;
  };
  globalThis.fetch = ((input: string | URL, init?: RequestInit): Promise<Response> => {
    const body = init?.body;
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      bodyLength: body instanceof Buffer ? body.byteLength : 0,
    });
    if (reply instanceof Error) return Promise.reject(reply);
    const bytes = Buffer.from(reply.body ?? '');
    return Promise.resolve({
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      text: () => Promise.resolve(reply.body ?? ''),
      // `read()` consumes the body as bytes, so the stub has to offer both.
      arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
    } as unknown as Response);
  }) as typeof fetch;
  return calls;
}
describe('assertSafeKey', () => {
  it('accepts the shapes the application actually generates', () => {
    assert.equal(assertSafeKey('shops/abc/products/1.png'), 'shops/abc/products/1.png');
    assert.equal(assertSafeKey('kyc/2026/08/citizenship-front.jpg'), 'kyc/2026/08/citizenship-front.jpg');
    assert.equal(assertSafeKey('कागज.pdf'), 'कागज.pdf');
  });

  it('strips leading slashes rather than treating the key as absolute', () => {
    assert.equal(assertSafeKey('//shops/a.png'), 'shops/a.png');
  });

  it('rejects traversal, which is how an image upload becomes a write to /etc', () => {
    for (const key of ['../secrets.env', 'shops/../../etc/passwd', 'a/./b', 'a//b', '..']) {
      assert.throws(() => assertSafeKey(key), /Invalid storage key/, key);
    }
  });

  it('rejects backslashes, control characters and URL-significant characters', () => {
    // The NUL in the list below is written as an escape, not as the raw byte it used
    // to be. The two are identical to the runtime, but one NUL anywhere in a file
    // makes `grep` treat the whole file as binary and print "binary file matches"
    // instead of the matching lines — so this file quietly dropped out of every text
    // search over the repository, audits included.
    for (const key of ['shops\\a.png', 'a\u0000b', 'a\nb', 'a b.png', 'a?b', 'a#b']) {
      assert.throws(() => assertSafeKey(key), /Invalid storage key/, JSON.stringify(key));
    }
  });

  it('rejects an empty key and one long enough to be an attack on the filesystem', () => {
    assert.throws(() => assertSafeKey(''), /Invalid storage key/);
    assert.throws(() => assertSafeKey('/'), /Invalid storage key/);
    assert.throws(() => assertSafeKey(`${'a'.repeat(513)}`), /Invalid storage key/);
  });
});

describe('LocalStorageProvider', () => {
  const local = async (base = 'http://localhost:4000'): Promise<LocalStorageProvider> =>
    new LocalStorageProvider(await mkdtemp(join(tmpdir(), 'gopasal-storage-')), base);

  it('writes the bytes it was given, creating parent directories', async () => {
    const provider = await local();
    const data = Buffer.from('a real png would go here');
    const saved = await provider.save('shops/abc/products/1.png', data);
    assert.equal(saved.key, 'shops/abc/products/1.png');
    const onDisk = await readFile(join(provider.directory, 'shops/abc/products/1.png'));
    assert.equal(onDisk.toString(), data.toString());
    assert.equal(onDisk.byteLength, data.byteLength);
  });

  it('returns the absolute URL the static handler in main.ts actually serves', async () => {
    const provider = await local();
    const saved = await provider.save('public/shops/abc/1.png', Buffer.from('x'));
    assert.equal(saved.url, 'http://localhost:4000/uploads/public/shops/abc/1.png');
    assert.equal(provider.publicUrl('public/shops/abc/1.png'), saved.url);
  });

  it('does not double a slash when the base URL has a trailing one', async () => {
    const provider = await local('http://localhost:4000/');
    assert.equal(provider.publicUrl('public/a.png'), 'http://localhost:4000/uploads/public/a.png');
  });

  it('removes a file, and treats an absent one as already removed', async () => {
    const provider = await local();
    await provider.save('a/b.png', Buffer.from('x'));
    await provider.remove('a/b.png');
    await assert.rejects(() => stat(join(provider.directory, 'a/b.png')), /ENOENT/);
    await assert.doesNotReject(() => provider.remove('a/b.png'));
  });

  it('refuses to write outside its root', async () => {
    const provider = await local();
    await assert.rejects(() => provider.save('../escaped.png', Buffer.from('x')), /Invalid storage key/);
    await assert.rejects(() => provider.remove('../escaped.png'), /Invalid storage key/);
  });
});
/** The MinIO setup documented in .env.example, so this is the local path too. */
const minio = (over: Partial<ConstructorParameters<typeof S3StorageProvider>[0]> = {}): S3StorageProvider =>
  new S3StorageProvider({
    endpoint: 'http://localhost:19000',
    region: 'us-east-1',
    bucket: 'gopasal-dev',
    accessKey: 'gopasal_dev',
    secretKey: 'gopasal_dev_secret',
    forcePathStyle: true,
    ...over,
  });

describe('S3StorageProvider', () => {
  it('PUTs to a path-style URL, signed, with the payload attached', async () => {
    const calls = stubFetch({ status: 200 });
    const data = Buffer.from('png bytes');
    const saved = await minio().save('public/shops/abc/1.png', data, 'image/png');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'PUT');
    assert.equal(calls[0].url, 'http://localhost:19000/gopasal-dev/public/shops/abc/1.png');
    assert.equal(calls[0].bodyLength, data.byteLength);
    assert.equal(calls[0].headers['Content-Type'], 'image/png');
    assert.match(calls[0].headers.Authorization, /^AWS4-HMAC-SHA256 Credential=gopasal_dev\//);
    // The payload hash is part of the signature, so it must be the body's digest.
    assert.match(calls[0].headers['x-amz-content-sha256'], /^[0-9a-f]{64}$/);
    assert.equal(saved.key, 'public/shops/abc/1.png');
    assert.equal(saved.url, 'http://localhost:19000/gopasal-dev/public/shops/abc/1.png');
  });

  it('signs Content-Type when one is given, and omits it when none is', async () => {
    const withType = stubFetch({ status: 200 });
    await minio().save('a.png', Buffer.from('x'), 'image/png');
    assert.match(withType[0].headers.Authorization, /SignedHeaders=[^,]*content-type/);
    restoreFetch?.();

    const without = stubFetch({ status: 200 });
    await minio().save('a.png', Buffer.from('x'));
    assert.equal(without[0].headers['Content-Type'], undefined);
    assert.doesNotMatch(without[0].headers.Authorization, /SignedHeaders=[^,]*content-type/);
  });

  it('uses virtual-hosted addressing when path style is switched off (AWS proper)', async () => {
    const calls = stubFetch({ status: 200 });
    await minio({ endpoint: 'https://s3.ap-south-1.amazonaws.com', forcePathStyle: false }).save(
      'shops/abc/1.png',
      Buffer.from('x'),
    );
    assert.equal(calls[0].url, 'https://gopasal-dev.s3.ap-south-1.amazonaws.com/shops/abc/1.png');
  });

  it('percent-encodes the key in the request URL', async () => {
    const calls = stubFetch({ status: 200 });
    await minio().save('shops/abc/कागज.pdf', Buffer.from('x'));
    assert.equal(
      calls[0].url,
      'http://localhost:19000/gopasal-dev/shops/abc/%E0%A4%95%E0%A4%BE%E0%A4%97%E0%A4%9C.pdf',
    );
  });

  it('hands out the CDN URL when one is configured, not the bucket endpoint', () => {
    const provider = minio({ publicBaseUrl: 'https://cdn.gopasal.com/' });
    assert.equal(provider.publicUrl('public/shops/abc/1.png'), 'https://cdn.gopasal.com/public/shops/abc/1.png');
  });

  /**
   * A rejected write is never reported as a save — and what the caller is told about
   * it names neither the bucket, the key, nor S3's verdict.
   *
   * The message used to be `S3 rejected PUT a.png (HTTP 403): <200 chars of the
   * bucket's reply>`, and `AllExceptionsFilter` keeps an `HttpException`'s own
   * message at any status, so every word of that reached the shopkeeper's screen.
   * `SignatureDoesNotMatch` in particular tells an attacker they are talking to a
   * misconfigured bucket rather than to a shop that has none.
   */
  it('does not report a save the bucket rejected, and does not quote it either', async () => {
    const logs = captureLogs();
    stubFetch({ status: 403, body: '<Error><Code>SignatureDoesNotMatch</Code></Error>' });
    await assert.rejects(() => minio().save('a.png', Buffer.from('x')), expectOpaqueStorageFailure());
    // The diagnosis is not lost, it is just not the caller's.
    assert.equal(logs.length, 1);
    assert.match(logs[0] ?? '', /PUT a\.png failed: HTTP 403.*SignatureDoesNotMatch/s);
  });

  it('does not report a save when the endpoint is unreachable', async () => {
    const logs = captureLogs();
    stubFetch(new Error('connect ECONNREFUSED 127.0.0.1:19000'));
    await assert.rejects(() => minio().save('a.png', Buffer.from('x')), expectOpaqueStorageFailure());
    // The endpoint's host and port are infrastructure, so they stay in the log too.
    assert.match(logs[0] ?? '', /PUT a\.png failed: connect ECONNREFUSED 127\.0\.0\.1:19000/);
  });

  it('DELETEs with an empty-payload signature, and accepts 404 as already gone', async () => {
    const calls = stubFetch({ status: 204 });
    await minio().remove('shops/abc/1.png');
    assert.equal(calls[0].method, 'DELETE');
    assert.equal(
      calls[0].headers['x-amz-content-sha256'],
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    restoreFetch?.();

    stubFetch({ status: 404 });
    await assert.doesNotReject(() => minio().remove('shops/abc/1.png'));
    restoreFetch?.();

    const logs = captureLogs();
    stubFetch({ status: 500 });
    await assert.rejects(() => minio().remove('shops/abc/1.png'), expectOpaqueStorageFailure());
    assert.match(logs[0] ?? '', /DELETE shops\/abc\/1\.png failed: HTTP 500/);
  });

  it('validates the key before it ever builds a request', async () => {
    const calls = stubFetch({ status: 200 });
    await assert.rejects(() => minio().save('../../etc/passwd', Buffer.from('x')), /Invalid storage key/);
    assert.equal(calls.length, 0);
  });
});
/**
 * The public/private split. These are the tests that stand between a KYC scan and
 * the open internet, so they check the behaviour at every layer that is supposed
 * to enforce it rather than trusting the key prefix as a convention.
 */
describe('public and private namespaces', () => {
  const local = async (): Promise<LocalStorageProvider> =>
    new LocalStorageProvider(await mkdtemp(join(tmpdir(), 'gopasal-storage-')), 'http://localhost:4000');

  it('knows which keys are private', () => {
    assert.equal(isPrivateKey('private/shop-applications/app_1/a.pdf'), true);
    assert.equal(isPrivateKey('public/products/1.jpg'), false);
    assert.equal(PUBLIC_PREFIX, 'public/');
    assert.equal(PRIVATE_PREFIX, 'private/');
  });

  it('reports no public URL for a private object, but still stores it', async () => {
    const provider = await local();
    const saved = await provider.save('private/shop-applications/app_1/scan.pdf', Buffer.from('%PDF-1.7'));
    // A write that succeeded must be reported as a success; what it must not do
    // is hand back a URL that anyone could fetch.
    assert.equal(saved.key, 'private/shop-applications/app_1/scan.pdf');
    assert.equal(saved.url, null);
    assert.equal((await provider.read(saved.key)).toString(), '%PDF-1.7');
  });

  it('refuses to build a public URL for a private key, in both providers', async () => {
    const provider = await local();
    assert.throws(() => provider.publicUrl('private/a.pdf'), /Refusing to build a public URL/);
    assert.throws(() => minio().publicUrl('private/a.pdf'), /Refusing to build a public URL/);
    assert.throws(
      () => minio({ publicBaseUrl: 'https://cdn.gopasal.com' }).publicUrl('private/a.pdf'),
      /Refusing to build a public URL/,
    );
  });

  it('refuses to build a public URL for a key in neither namespace', async () => {
    const provider = await local();
    // The static handler is rooted at <root>/public, so such a URL would 404.
    // Better to fail where the key is built than to store a dead link.
    assert.throws(() => provider.publicUrl('shops/abc/1.png'), /can only be built for a "public\/" object/);
    const saved = await provider.save('shops/abc/1.png', Buffer.from('x'));
    assert.equal(saved.url, null);
  });

  it('serves only the public subtree, so private/ is not inside the served directory', async () => {
    const provider = await local();
    assert.equal(provider.publicDirectory, join(provider.directory, 'public'));
    const saved = await provider.save('public/products/1.jpg', Buffer.from('jpeg'));
    assert.equal(saved.url, 'http://localhost:4000/uploads/public/products/1.jpg');
    // main.ts mounts publicDirectory at /uploads/public/, so the URL above
    // resolves to this file and nothing above it is reachable.
    assert.equal((await readFile(join(provider.publicDirectory, 'products/1.jpg'))).toString(), 'jpeg');
  });
});

describe('reading bytes back', () => {
  it('returns exactly what was written, byte for byte', async () => {
    const provider = new LocalStorageProvider(await mkdtemp(join(tmpdir(), 'gopasal-storage-')));
    // Binary, not text: a UTF-8 round trip would hide a corrupting read.
    const data = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    await provider.save('private/a.jpg', data);
    const back = await provider.read('private/a.jpg');
    assert.equal(Buffer.compare(back, data), 0);
  });

  it('refuses a traversing key on the way in rather than reading a neighbour', async () => {
    const provider = new LocalStorageProvider(await mkdtemp(join(tmpdir(), 'gopasal-storage-')));
    await assert.rejects(() => provider.read('../../etc/passwd'), /Invalid storage key/);
  });

  it('says the file is gone instead of handing back an empty one', async () => {
    const provider = new LocalStorageProvider(await mkdtemp(join(tmpdir(), 'gopasal-storage-')));
    // The database row can outlive the bytes. A zero-byte buffer here would be
    // served as a "document" that opens to nothing.
    await assert.rejects(() => provider.read('private/missing.pdf'), /no longer stored/);
  });

  it('GETs with a signed empty-payload request in S3', async () => {
    const calls = stubFetch({ status: 200 });
    await minio().read('private/shop-applications/app_1/scan.pdf');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].url, 'http://localhost:19000/gopasal-dev/private/shop-applications/app_1/scan.pdf');
    assert.equal(
      calls[0].headers['x-amz-content-sha256'],
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    assert.match(calls[0].headers.Authorization, /^AWS4-HMAC-SHA256 Credential=gopasal_dev\//);
  });

  it('distinguishes a missing object from a broken bucket', async () => {
    stubFetch({ status: 404 });
    // A 404 is a fact about this document, not about the platform's storage, so it
    // stays a 404 with its own words — the caller can act on it.
    await assert.rejects(() => minio().read('private/a.pdf'), /no longer stored/);
    restoreFetch?.();

    const broken = captureLogs();
    stubFetch({ status: 500 });
    await assert.rejects(() => minio().read('private/a.pdf'), expectOpaqueStorageFailure());
    // `private/a.pdf` is an internal storage key. It belongs in the log, not on a
    // screen: it is the path a leaked key would be tried against.
    assert.match(broken[0] ?? '', /GET private\/a\.pdf failed: HTTP 500/);
    restoreLogger?.();
    restoreFetch?.();

    const unreachable = captureLogs();
    stubFetch(new Error('connect ECONNREFUSED 127.0.0.1:19000'));
    await assert.rejects(() => minio().read('private/a.pdf'), expectOpaqueStorageFailure());
    assert.match(unreachable[0] ?? '', /GET private\/a\.pdf failed: connect ECONNREFUSED/);
  });
});
// MARKER-STORAGE-SPEC

/** ConfigService stand-in: the factory reads `storage` and `publicUrl`. */
const configWith = (storage: AppConfig['storage'], publicUrl = 'http://localhost:4000'): ConfigService<AppConfig, true> =>
  ({
    get: (key: string) => (key === 'publicUrl' ? publicUrl : storage),
  }) as unknown as ConfigService<AppConfig, true>;

const storageConfig = (over: Partial<AppConfig['storage']> = {}): AppConfig['storage'] => ({
  provider: 'local',
  local: { dir: 'uploads' },
  allowLocalInProduction: false,
  s3: { region: 'us-east-1', forcePathStyle: true },
  ...over,
});

const build = (over: Partial<AppConfig['storage']> = {}, publicUrl?: string): StorageProvider =>
  storageProviderFactory.useFactory(configWith(storageConfig(over), publicUrl));

describe('storageProviderFactory', () => {
  it('binds the token main.ts and the upload path resolve', () => {
    assert.equal(storageProviderFactory.provide, STORAGE_PROVIDER);
  });

  it('selects local storage by default and gives it the API\'s own public URL', () => {
    const provider = build();
    assert.ok(provider instanceof LocalStorageProvider);
    assert.equal(provider.publicUrl('public/a.png'), 'http://localhost:4000/uploads/public/a.png');
  });

  it('lets a CDN or proxy override the local public base', () => {
    const provider = build({ local: { dir: 'uploads', publicBaseUrl: 'https://files.gopasal.com' } });
    assert.equal(provider.publicUrl('public/a.png'), 'https://files.gopasal.com/uploads/public/a.png');
  });

  it('selects S3 when configured', () => {
    const provider = build({
      provider: 's3',
      s3: {
        endpoint: 'http://localhost:19000',
        region: 'us-east-1',
        bucket: 'gopasal-dev',
        accessKey: 'gopasal_dev',
        secretKey: 'gopasal_dev_secret',
        forcePathStyle: true,
      },
    });
    assert.ok(provider instanceof S3StorageProvider);
    assert.equal(provider.publicUrl('public/a.png'), 'http://localhost:19000/gopasal-dev/public/a.png');
  });

  it('derives the AWS endpoint when none is given, rather than guessing a host', () => {
    const provider = build({
      provider: 's3',
      s3: {
        region: 'ap-south-1',
        bucket: 'gopasal',
        accessKey: 'k',
        secretKey: 's',
        forcePathStyle: false,
      },
    });
    assert.equal(provider.publicUrl('public/a.png'), 'https://gopasal.s3.ap-south-1.amazonaws.com/public/a.png');
  });

  it('refuses to construct S3 storage with a missing credential', () => {
    const s3 = (over: Partial<AppConfig['storage']['s3']>): Partial<AppConfig['storage']> => ({
      provider: 's3',
      s3: { region: 'us-east-1', forcePathStyle: true, ...over },
    });
    assert.throws(() => build(s3({ accessKey: 'k', secretKey: 's' })), /S3_BUCKET is required/);
    assert.throws(() => build(s3({ bucket: 'b', secretKey: 's' })), /S3_ACCESS_KEY is required/);
    assert.throws(() => build(s3({ bucket: 'b', accessKey: 'k' })), /S3_SECRET_KEY is required/);
  });

  it('throws on an unimplemented name rather than silently writing to local disk', () => {
    const typo = 'gcs' as AppConfig['storage']['provider'];
    assert.throws(() => build({ provider: typo }), /STORAGE_PROVIDER="gcs" is not implemented/);
  });
});

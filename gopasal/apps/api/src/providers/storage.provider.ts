import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import type { AppConfig } from '../config/configuration';
import { encodeS3Path, signRequest } from './aws-sigv4';

export interface StoredObject {
  key: string;
  /**
   * Where a browser can fetch this object without credentials — `null` for a
   * private object, because there is no such place. A caller that wants to hand
   * a private object to a user must route it through an authenticated endpoint.
   */
  url: string | null;
}

/**
 * Every key lives in one of exactly two namespaces, and which one it is decides
 * how the bytes may be reached:
 *
 *   public/…  product images, shop photos, category art. Served straight off
 *             disk (or the bucket / CDN) with no credential — that is the point.
 *   private/… KYC scans, payout proof, anything else that identifies a person.
 *             Never statically served: `main.ts` mounts only the public subtree,
 *             `publicUrl()` refuses to build a URL for these, and the only way
 *             out is an authenticated handler that has checked who is asking.
 *
 * A convention would not be enough on its own, so it is enforced in three
 * independent places: the key builder in the uploads module can only produce
 * these two prefixes, `publicUrl()` throws on a private key, and the static
 * handler is rooted at the public directory so traversal out of it is a path
 * error rather than a leak.
 */
export const PUBLIC_PREFIX = 'public/';
export const PRIVATE_PREFIX = 'private/';

export function isPrivateKey(key: string): boolean {
  return key.startsWith(PRIVATE_PREFIX);
}

/**
 * True only for the one namespace that is served without a credential. Used to
 * decide whether a completed write has a public URL at all, rather than calling
 * `publicUrl()` and having it throw after the bytes are already stored.
 */
export function isPublicKey(key: string): boolean {
  return key.startsWith(PUBLIC_PREFIX);
}

/**
 * Blob storage for product images, KYC documents, proof-of-delivery photos and
 * CSV imports. Two implementations, both real:
 *
 *   local — writes to a directory on this machine, served back by the API. The
 *           development default; needs nothing installed and no account.
 *   s3    — any S3-compatible endpoint. In development that is the MinIO
 *           container in docker-compose.yml, which exercises the exact code path
 *           production uses against Cloudflare R2 / AWS S3 / DigitalOcean Spaces.
 *
 * Neither one reports a write it did not perform, and neither invents bytes it
 * cannot find: `read` throws rather than returning an empty buffer, so a
 * download endpoint cannot serve a zero-byte file as if it were a document.
 */
export interface StorageProvider {
  readonly name: string;
  save(key: string, data: Buffer, contentType?: string): Promise<StoredObject>;
  /** The bytes back. Throws NotFoundException if the object is gone. */
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  /** Throws for a `private/` key — there is no public URL for one by design. */
  publicUrl(key: string): string;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

/**
 * Guard on the one operation that turns a key into something anybody can fetch.
 * Called by both providers, so neither can grow a private-object leak on its own.
 *
 * A key outside `public/` is refused too, not only a `private/` one. The local
 * static handler is rooted at `<root>/public`, so a URL built for an unprefixed
 * key would be a 404 — and a URL that does not resolve is worse than an error,
 * because it is stored in a database column and discovered by a customer.
 */
function assertPublicKey(key: string): string {
  const safe = assertSafeKey(key);
  if (isPrivateKey(safe)) {
    throw new BadRequestException(
      `Refusing to build a public URL for a "${PRIVATE_PREFIX}" object — ` +
        'private files are served only through an authenticated endpoint.',
    );
  }
  if (!safe.startsWith(PUBLIC_PREFIX)) {
    throw new BadRequestException(
      `A public URL can only be built for a "${PUBLIC_PREFIX}" object; got "${safe}". ` +
        'Only that subtree is served without a credential.',
    );
  }
  return safe;
}

/**
 * Object keys come from callers that may be handling user input (a filename, a
 * shop slug), so they are validated rather than trusted. `..` or an absolute
 * path in a key is how a product-image upload becomes a write to /etc.
 */
export function assertSafeKey(key: string): string {
  const k = key.replace(/^\/+/, '');
  if (k.length === 0 || k.length > 512) {
    throw new BadRequestException('Invalid storage key');
  }
  if (isAbsolute(k) || k.includes('\\') || k.split('/').some((s) => s === '..' || s === '.' || s === '')) {
    throw new BadRequestException('Invalid storage key');
  }
  // Control characters, whitespace, and the two characters that would change the
  // meaning of any URL this key is interpolated into.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0020\u007f?#]/.test(k)) {
    throw new BadRequestException('Invalid storage key');
  }
  return k;
}

/**
 * Writes under STORAGE_LOCAL_DIR (default ./uploads) and is served back at
 * /uploads/<key> by the static handler registered in main.ts — but only for the
 * `public/` subtree, which is the directory that handler is rooted at. The
 * content type is carried by the key's extension, which is what the static
 * handler reads, so the upload path must keep extensions meaningful rather than
 * inventing extensionless keys.
 */
@Injectable()
export class LocalStorageProvider implements StorageProvider {
  readonly name = 'local';
  private readonly logger = new Logger('Storage:local');
  private readonly root: string;

  constructor(
    dir = 'uploads',
    private readonly publicBaseUrl = '',
  ) {
    this.root = isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
  }

  /**
   * Resolve a key to an absolute path, proving it stays inside the root. Belt
   * and braces on top of `assertSafeKey`: a path that escapes is refused here
   * even if some future edit loosens the key rules.
   */
  private pathFor(key: string): string {
    const full = join(this.root, assertSafeKey(key));
    if (!full.startsWith(this.root + sep)) throw new BadRequestException('Invalid storage key');
    return full;
  }

  async save(key: string, data: Buffer): Promise<StoredObject> {
    const safe = assertSafeKey(key);
    const full = this.pathFor(safe);
    await fs.mkdir(join(full, '..'), { recursive: true });
    await fs.writeFile(full, data);
    this.logger.debug(`wrote ${safe} (${data.byteLength} bytes)`);
    return { key: safe, url: isPublicKey(safe) ? this.publicUrl(safe) : null };
  }

  async read(key: string): Promise<Buffer> {
    const safe = assertSafeKey(key);
    try {
      return await fs.readFile(this.pathFor(safe));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // The row survived and the bytes did not — say so instead of handing
        // back an empty file that would look like a corrupt scan.
        throw new NotFoundException('That file is no longer stored on this server');
      }
      throw err;
    }
  }

  async remove(key: string): Promise<void> {
    await fs.rm(this.pathFor(key), { force: true });
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl.replace(/\/+$/, '')}/uploads/${assertPublicKey(key)}`;
  }

  /** Used by main.ts to register the static handler over the same directory. */
  get directory(): string {
    return this.root;
  }

  /**
   * The only subtree that may be served without a credential. main.ts mounts
   * this rather than `directory`, so `private/` is unreachable over HTTP even if
   * someone later guesses a storage key.
   */
  get publicDirectory(): string {
    return join(this.root, PUBLIC_PREFIX.replace(/\/$/, ''));
  }
}

/**
 * S3-compatible storage. Signed with the local SigV4 implementation, so there is
 * no SDK in the dependency tree and the same code serves MinIO and production.
 *
 * Addressing: path-style (`<endpoint>/<bucket>/<key>`) by default because MinIO
 * and most clones require it; set S3_FORCE_PATH_STYLE=false for virtual-hosted
 * style against AWS proper.
 */
@Injectable()
export class S3StorageProvider implements StorageProvider {
  readonly name = 's3';
  private readonly logger = new Logger('Storage:s3');

  constructor(
    private readonly cfg: {
      endpoint: string;
      region: string;
      bucket: string;
      accessKey: string;
      secretKey: string;
      forcePathStyle: boolean;
      publicBaseUrl?: string;
    },
  ) {}

  private objectUrl(key: string): string {
    const base = this.cfg.endpoint.replace(/\/+$/, '');
    const path = encodeS3Path(key);
    if (!this.cfg.forcePathStyle) {
      const u = new URL(base);
      return `${u.protocol}//${this.cfg.bucket}.${u.host}/${path}`;
    }
    return `${base}/${encodeURIComponent(this.cfg.bucket)}/${path}`;
  }

  /**
   * A storage failure the caller can read, with the diagnosis kept in the log.
   *
   * These used to be the exception message: `S3 rejected PUT
   * public/products/<shop>/<product>/<key> (HTTP 403): <200 characters of the
   * bucket's reply>`. `AllExceptionsFilter` preserves an `HttpException`'s own
   * message at any status — correctly, because a 5xx a service chose is usually
   * written for the caller — so all of that reached the shopkeeper's screen: an
   * internal storage key, the bucket's verdict, and whatever else S3 chose to
   * say. `AuthService` already answers a failed SMS gateway this way; this is the
   * same rule for the same reason.
   */
  private unavailable(operation: string, key: string, detail: string): ServiceUnavailableException {
    this.logger.error(`${operation} ${key} failed: ${detail}`);
    return new ServiceUnavailableException(
      'File storage is not responding right now. Please try again in a moment.',
    );
  }

  async save(key: string, data: Buffer, contentType?: string): Promise<StoredObject> {
    const safe = assertSafeKey(key);
    const url = this.objectUrl(safe);
    const headers = signRequest({
      method: 'PUT',
      url,
      region: this.cfg.region,
      service: 's3',
      accessKey: this.cfg.accessKey,
      secretKey: this.cfg.secretKey,
      payload: data,
      headers: contentType ? { 'Content-Type': contentType } : {},
    });

    const res = await fetch(url, { method: 'PUT', headers, body: data }).catch((err: Error) => {
      throw this.unavailable('PUT', safe, err.message);
    });
    if (!res.ok) {
      throw this.unavailable('PUT', safe, `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    this.logger.debug(`put ${safe} (${data.byteLength} bytes)`);
    return { key: safe, url: isPublicKey(safe) ? this.publicUrl(safe) : null };
  }

  /**
   * A signed GET. Private objects are fetched by the API and streamed to the
   * caller it has authorised, which is why the bucket itself must not be
   * public-read: see the bucket-policy note in .env.example.
   */
  async read(key: string): Promise<Buffer> {
    const safe = assertSafeKey(key);
    const url = this.objectUrl(safe);
    const headers = signRequest({
      method: 'GET',
      url,
      region: this.cfg.region,
      service: 's3',
      accessKey: this.cfg.accessKey,
      secretKey: this.cfg.secretKey,
      payload: '',
    });
    const res = await fetch(url, { method: 'GET', headers }).catch((err: Error) => {
      throw this.unavailable('GET', safe, err.message);
    });
    if (res.status === 404) throw new NotFoundException('That file is no longer stored');
    if (!res.ok) {
      throw this.unavailable('GET', safe, `HTTP ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  async remove(key: string): Promise<void> {
    const safe = assertSafeKey(key);
    const url = this.objectUrl(safe);
    const headers = signRequest({
      method: 'DELETE',
      url,
      region: this.cfg.region,
      service: 's3',
      accessKey: this.cfg.accessKey,
      secretKey: this.cfg.secretKey,
      payload: '',
    });
    const res = await fetch(url, { method: 'DELETE', headers }).catch((err: Error) => {
      throw this.unavailable('DELETE', safe, err.message);
    });
    // 204 on success, 404 means it is already gone — both are the desired state.
    if (!res.ok && res.status !== 404) {
      throw this.unavailable('DELETE', safe, `HTTP ${res.status}`);
    }
  }

  publicUrl(key: string): string {
    const safe = assertPublicKey(key);
    if (this.cfg.publicBaseUrl) {
      return `${this.cfg.publicBaseUrl.replace(/\/+$/, '')}/${encodeS3Path(safe)}`;
    }
    return this.objectUrl(safe);
  }
}

export const storageProviderFactory = {
  provide: STORAGE_PROVIDER,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfig, true>): StorageProvider => {
    const storage = config.get('storage', { infer: true });
    const publicUrl = config.get('publicUrl', { infer: true });

    if (storage.provider === 's3') {
      const s3 = storage.s3;
      return new S3StorageProvider({
        // Endpoint is optional only for AWS proper, where it is derivable.
        endpoint: s3.endpoint ?? `https://s3.${s3.region}.amazonaws.com`,
        region: s3.region,
        bucket: need(s3.bucket, 'S3_BUCKET'),
        accessKey: need(s3.accessKey, 'S3_ACCESS_KEY'),
        secretKey: need(s3.secretKey, 'S3_SECRET_KEY'),
        forcePathStyle: s3.forcePathStyle,
        publicBaseUrl: s3.publicBaseUrl,
      });
    }
    if (storage.provider === 'local') {
      // Absolute URLs, because these are handed to browsers and to native apps
      // that have no notion of "this API's origin".
      return new LocalStorageProvider(storage.local.dir, storage.local.publicBaseUrl ?? publicUrl);
    }
    const name: string = storage.provider;
    throw new Error(`STORAGE_PROVIDER="${name}" is not implemented`);
  },
};

function need(value: string | undefined, variable: string): string {
  if (!value) throw new Error(`${variable} is required for STORAGE_PROVIDER=s3`);
  return value;
}

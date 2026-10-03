import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { LocalStorageProvider } from '../../providers/storage.provider';
import { ClamAvMalwareScanner, DisabledMalwareScanner } from '../../providers/malware-scanner.provider';
import { UploadsService } from './uploads.service';
import type { UploadedFile } from './uploaded-file';

/**
 * These tests run the service against a REAL LocalStorageProvider writing into a
 * real temporary directory. Nothing about storage is stubbed, because the claim
 * being tested is precisely that the bytes are on disk afterwards — a mocked
 * provider would let "the file was persisted" pass while nothing was written.
 */

const MB = 1024 * 1024;

/** Only the fields the service reads; the rest of multer's shape is irrelevant. */
const partFor = (buffer: Buffer, originalname = 'scan.jpg', mimetype = 'image/jpeg'): UploadedFile => ({
  fieldname: 'file',
  originalname,
  encoding: '7bit',
  mimetype,
  size: buffer.byteLength,
  buffer,
});

const jpeg = (payload = 'photo bytes'): Buffer =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(payload)]);
const pdf = (): Buffer => Buffer.from('%PDF-1.7\n1 0 obj\n');

const configWith = (uploads: AppConfig['uploads']): ConfigService<AppConfig, true> =>
  ({
    get: (key: string) => {
      if (key !== 'uploads') throw new Error(`unexpected config read: ${key}`);
      return uploads;
    },
  }) as unknown as ConfigService<AppConfig, true>;

describe('UploadsService', () => {
  let directory: string;
  let service: UploadsService;
  let storage: LocalStorageProvider;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'gopasal-uploads-'));
    storage = new LocalStorageProvider(directory, 'http://localhost:4000');
    service = new UploadsService(storage, configWith({ maxImageBytes: MB, maxDocumentBytes: 2 * MB }), new DisabledMalwareScanner());
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('reports which provider is live, so the boot log cannot lie about it', () => {
    assert.equal(service.providerName, 'local');
  });

  it('rejects unsafe or unscanned bytes before any object is stored', async () => {
    const refusing = new UploadsService(storage, configWith({ maxImageBytes: MB, maxDocumentBytes: 2 * MB }), {
      name: 'clamav', ready: () => Promise.resolve(true),
      scan: () => Promise.reject(new Error('scanner refused')),
    });
    await assert.rejects(() => refusing.storePublicImage(['shops', 'shop1'], partFor(jpeg())));
    await assert.rejects(() => refusing.storeSupportAttachment('ticket_1', partFor(pdf(), 'note.pdf', 'application/pdf')));
    await assert.rejects(() => fs.readdir(join(directory, 'public')), /ENOENT/);
    await assert.rejects(() => fs.readdir(join(directory, 'private')), /ENOENT/);
  });

  it('does not persist a detected PDF when using the live scanner', { skip: process.env.CLAMAV_INTEGRATION !== '1' }, async () => {
    const scanner = new ClamAvMalwareScanner({
      host: process.env.CLAMAV_HOST ?? '127.0.0.1',
      port: Number(process.env.CLAMAV_PORT ?? 13310),
      connectTimeoutMs: 2000,
      scanTimeoutMs: 30000,
    });
    const uploads = new UploadsService(storage, configWith({ maxImageBytes: MB, maxDocumentBytes: 2 * MB }), scanner);
    const eicar = Buffer.from(String.raw`X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`);
    const unsafePdf = Buffer.concat([
      Buffer.from('%PDF-1.7\n1 0 obj <</Length 68>> stream\n'),
      eicar,
      Buffer.from('\nendstream\nendobj\n%%EOF'),
    ]);
    await assert.rejects(() => uploads.storeSupportAttachment('ticket_1', partFor(unsafePdf, 'evidence.pdf', 'application/pdf')));
    await assert.rejects(() => fs.readdir(join(directory, 'private')), /ENOENT/);
  });

  it('reads its ceilings from configuration rather than hard-coding them', () => {
    assert.equal(service.maxBytes('image'), MB);
    assert.equal(service.maxBytes('document'), 2 * MB);
  });

  it('keeps support evidence private and rechecks stored bytes before download', async () => {
    const stored = await service.storeSupportAttachment('ticket_1', partFor(pdf(), 'note.pdf', 'application/pdf'));
    assert.equal(stored.url, null);
    assert.match(stored.key, /^private\/support-tickets\/ticket_1\/[a-f0-9]{32}\.pdf$/);
    const read = await service.readSupportAttachment('ticket_1', stored.key, stored.mime, stored.displayName, stored.size);
    assert.deepEqual(read.buffer, pdf());
    await assert.rejects(() => service.readSupportAttachment('other', stored.key, stored.mime, stored.displayName, stored.size));
    await assert.rejects(() => service.readSupportAttachment('ticket_1', stored.key, stored.mime, stored.displayName, stored.size + 1));
    await fs.writeFile(join(directory, stored.key), jpeg());
    await assert.rejects(() => service.readSupportAttachment('ticket_1', stored.key, stored.mime, stored.displayName, stored.size));
  });

  describe('storeApplicationDocument', () => {
    it('actually writes the bytes, under a private key, and hands back a readable one', async () => {
      const bytes = pdf();
      const stored = await service.storeApplicationDocument('clx0app0000000000000000', partFor(bytes, 'registration.pdf', 'application/pdf'));

      assert.match(stored.key, /^private\/shop-applications\/clx0app0000000000000000\/[0-9a-f]{32}\.pdf$/);
      assert.equal(stored.mime, 'application/pdf');
      assert.equal(stored.size, bytes.byteLength);
      assert.equal(stored.displayName, 'registration.pdf');

      // On disk, byte for byte — not merely "the call returned".
      const onDisk = await fs.readFile(join(directory, stored.key));
      assert.deepEqual(onDisk, bytes);
      assert.deepEqual(await service.read(stored.key), bytes);
    });

    it('gives a KYC document no URL at all', async () => {
      const stored = await service.storeApplicationDocument('app1', partFor(jpeg(), 'citizenship.jpg'));
      assert.equal(stored.url, null);
    });

    it('keeps the document outside the directory that main.ts serves', async () => {
      const stored = await service.storeApplicationDocument('app1', partFor(jpeg(), 'citizenship.jpg'));
      const full = join(directory, stored.key);
      assert.ok(!full.startsWith(storage.publicDirectory), `${full} must not be under ${storage.publicDirectory}`);
    });

    it('does not let the client-supplied filename influence the path', async () => {
      const stored = await service.storeApplicationDocument(
        'app1',
        partFor(jpeg(), '../../../../etc/cron.d/evil', 'image/jpeg'),
      );
      assert.match(stored.key, /^private\/shop-applications\/app1\/[0-9a-f]{32}\.jpg$/);
      // The name survives only as a label, and only as its basename.
      assert.equal(stored.displayName, 'evil');
      const escaped = join(directory, '..', 'etc');
      assert.equal(
        await fs
          .stat(escaped)
          .then(() => 'exists')
          .catch(() => 'absent'),
        'absent',
      );
    });

    it('never collides, so re-uploading the same file replaces nothing', async () => {
      const first = await service.storeApplicationDocument('app1', partFor(jpeg('one'), 'a.jpg'));
      const second = await service.storeApplicationDocument('app1', partFor(jpeg('two'), 'a.jpg'));
      assert.notEqual(first.key, second.key);
      assert.deepEqual(await service.read(first.key), jpeg('one'));
      assert.deepEqual(await service.read(second.key), jpeg('two'));
    });

    it('refuses an oversized document with 413 and writes nothing', async () => {
      const big = Buffer.concat([pdf(), Buffer.alloc(3 * MB)]);
      await assert.rejects(
        () => service.storeApplicationDocument('app1', partFor(big, 'big.pdf', 'application/pdf')),
        (err: Error & { status?: number }) => {
          assert.equal(err.status, 413);
          assert.match(err.message, /limit is 2\.0 MB/);
          return true;
        },
      );
      await assert.rejects(() => fs.readdir(join(directory, 'private')), /ENOENT/);
    });

    it('refuses an unsupported type with 400 and writes nothing', async () => {
      await assert.rejects(
        () =>
          service.storeApplicationDocument(
            'app1',
            partFor(Buffer.from('<?php system($_GET["c"]); ?>'), 'shell.jpg', 'image/jpeg'),
          ),
        (err: Error & { status?: number }) => {
          assert.equal(err.status, 400);
          assert.match(err.message, /JPEG, PNG or WebP image, or a PDF/);
          return true;
        },
      );
      await assert.rejects(() => fs.readdir(join(directory, 'private')), /ENOENT/);
    });

    it('refuses a request that carried no file, naming the field to use', async () => {
      await assert.rejects(
        () => service.storeApplicationDocument('app1', undefined),
        (err: Error & { status?: number }) => {
          assert.equal(err.status, 400);
          assert.match(err.message, /"file" field/);
          return true;
        },
      );
    });

    it('refuses to build a key from an application id that is not one', async () => {
      // A traversal attempt reaching this far is a programming error, not a
      // request the caller can fix, so it is not a 4xx — it must not be silently
      // sanitised either.
      await assert.rejects(
        () => service.storeApplicationDocument('../../public', partFor(jpeg(), 'a.jpg')),
        /unsafe application id/,
      );
    });
  });

  describe('storePublicImage', () => {
    it('writes into the served tree and returns a fetchable URL', async () => {
      const bytes = jpeg('product');
      const stored = await service.storePublicImage(['shops', 'shop1', 'products'], partFor(bytes, 'dal.jpg'));

      assert.match(stored.key, /^public\/shops\/shop1\/products\/[0-9a-f]{32}\.jpg$/);
      assert.equal(stored.url, `http://localhost:4000/uploads/${stored.key}`);
      const full = join(directory, stored.key);
      assert.ok(full.startsWith(storage.publicDirectory));
      assert.deepEqual(await fs.readFile(full), bytes);
    });

    it('refuses a PDF as a public image even though documents accept one', async () => {
      await assert.rejects(
        () => service.storePublicImage(['shops', 'shop1'], partFor(pdf(), 'catalogue.pdf', 'application/pdf')),
        (err: Error & { status?: number }) => {
          assert.equal(err.status, 400);
          assert.match(err.message, /JPEG, PNG or WebP image\./);
          return true;
        },
      );
    });

    it('applies the image ceiling, which is separate from the document one', async () => {
      const between = Buffer.concat([jpeg(), Buffer.alloc(Math.round(1.5 * MB))]);
      // Accepted as a document (2 MB ceiling), refused as an image (1 MB).
      assert.ok(await service.storeApplicationDocument('app1', partFor(between, 'a.jpg')));
      await assert.rejects(
        () => service.storePublicImage(['shops', 'shop1'], partFor(between, 'a.jpg')),
        (err: Error & { status?: number }) => {
          assert.equal(err.status, 413);
          return true;
        },
      );
    });

    it('refuses a path segment that is not an identifier', async () => {
      await assert.rejects(
        () => service.storePublicImage(['shops', '../private'], partFor(jpeg(), 'a.jpg')),
        /unsafe key segment/,
      );
    });
  });

  describe('read and remove', () => {
    it('says the bytes are gone rather than returning an empty file', async () => {
      await assert.rejects(
        () => service.read('private/shop-applications/app1/deadbeefdeadbeefdeadbeefdeadbeef.pdf'),
        (err: Error & { status?: number }) => {
          assert.equal(err.status, 404);
          assert.match(err.message, /no longer stored/);
          return true;
        },
      );
    });

    it('refuses to read a key that tries to leave the storage root', async () => {
      await assert.rejects(() => service.read('../../etc/passwd'), /Invalid storage key/);
    });

    it('deletes the object, and is content for it to be already deleted', async () => {
      const stored = await service.storeApplicationDocument('app1', partFor(jpeg(), 'a.jpg'));
      await service.remove(stored.key);
      await assert.rejects(() => service.read(stored.key), /no longer stored/);
      // Replacing a document deletes the old key; that path must not throw when
      // the object has already vanished, or a retry would be stuck forever.
      await service.remove(stored.key);
    });
  });
});

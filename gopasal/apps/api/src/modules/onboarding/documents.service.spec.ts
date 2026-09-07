import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { ConfigService } from '@nestjs/config';
import type {
  ApplicationStatus,
  DocumentReviewState,
  Prisma,
  ShopDocumentKind,
} from '@prisma/client';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AppConfig } from '../../config/configuration';
import { LocalStorageProvider } from '../../providers/storage.provider';
import type { AuditEntry, AuditService } from '../audit/audit.service';
import type { UploadedFile } from '../uploads/uploaded-file';
import { UploadsService } from '../uploads/uploads.service';
import { MAX_DOCUMENTS_PER_APPLICATION } from './application-state';
import { DocumentsService } from './documents.service';

/**
 * The KYC path end to end: validation, real bytes on a real disk, the row that
 * names them, the authorisation that gates them, and replacement or removal.
 *
 * Storage is deliberately NOT mocked — a real `LocalStorageProvider` writes into a
 * real temporary directory, because almost everything asserted below ("the file is
 * retrievable", "the replaced object is gone", "a failed upload leaves nothing
 * behind") is a statement about the filesystem, and a stubbed provider would let
 * every one of those pass while nothing at all had happened.
 *
 * Prisma is in-memory and deliberately narrow: only the delegates the service uses
 * exist, so reaching for another table fails the test loudly instead of passing
 * against a permissive mock. Its `$transaction` imitates rollback by restoring a
 * snapshot; real atomicity belongs to PostgreSQL and is not claimed here.
 */

const MB = 1024 * 1024;

// ── the slice of each table this path touches ────────────────────────────────

interface AppRow {
  id: string;
  applicantId: string;
  status: ApplicationStatus;
}

interface DocRow {
  id: string;
  applicationId: string;
  kind: ShopDocumentKind;
  storageKey: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  review: DocumentReviewState;
  reviewNote: string | null;
  createdAt: Date;
}

interface EventRow {
  applicationId: string;
  type: string;
  message: string | null;
  meta: Prisma.JsonValue | null;
  actorId: string | null;
}

interface State {
  applications: AppRow[];
  documents: DocRow[];
  events: EventRow[];
}

// ── argument shapes, written to match exactly what the service passes ─────────

interface FindAppArgs {
  where: { id: string; applicantId: string };
  select: Record<string, boolean>;
}
interface FindDocsArgs {
  where: { applicationId: string };
  select: Record<string, boolean>;
}
interface FindDocArgs {
  where: { id: string; applicationId: string; application?: { applicantId: string } };
}
interface CreateDocArgs {
  data: {
    applicationId: string;
    kind: ShopDocumentKind;
    storageKey: string;
    fileName: string | null;
    mimeType: string;
    sizeBytes: number;
  };
}
interface UpdateDocArgs {
  where: { id: string };
  data: { review: DocumentReviewState; reviewNote: string | null };
}
interface EventArgs {
  data: {
    applicationId: string;
    type: string;
    message?: string;
    meta?: Prisma.InputJsonValue;
    actorId?: string;
  };
}

let seq = 0;

/**
 * An in-memory Prisma stand-in for the document path only. Every delegate here is
 * one the service actually calls; nothing else exists, on purpose.
 */
class FakeDb {
  /** Set once to make the next `shopDocument.create` fail, exercising rollback. */
  failNextCreate = false;

  constructor(readonly state: State) {}

  private project(doc: DocRow, select: Record<string, boolean>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(select)) out[key] = doc[key as keyof DocRow];
    return out;
  }

  readonly shopApplication = {
    findFirst: (args: FindAppArgs) => {
      const row = this.state.applications.find(
        (a) => a.id === args.where.id && a.applicantId === args.where.applicantId,
      );
      return Promise.resolve(row ? { id: row.id, status: row.status } : null);
    },
  };

  readonly shopDocument = {
    findMany: (args: FindDocsArgs) =>
      Promise.resolve(
        this.state.documents
          .filter((d) => d.applicationId === args.where.applicationId)
          .map((d) => this.project(d, args.select)),
      ),

    /**
     * The relation predicate is honoured rather than ignored: without it this fake
     * would happily hand one applicant another's row and the ownership tests would
     * pass for the wrong reason.
     */
    findFirst: (args: FindDocArgs) => {
      const owner = args.where.application?.applicantId;
      const row = this.state.documents.find(
        (d) =>
          d.id === args.where.id &&
          d.applicationId === args.where.applicationId &&
          (owner === undefined ||
            this.state.applications.some((a) => a.id === d.applicationId && a.applicantId === owner)),
      );
      return Promise.resolve(row ? { ...row } : null);
    },

    create: (args: CreateDocArgs) => {
      if (this.failNextCreate) {
        this.failNextCreate = false;
        return Promise.reject(new Error('insert failed'));
      }
      const row: DocRow = {
        id: `doc_${++seq}`,
        review: 'PENDING',
        reviewNote: null,
        createdAt: new Date(),
        ...args.data,
      };
      this.state.documents.push(row);
      return Promise.resolve({ ...row });
    },

    deleteMany: (args: { where: { id: { in: string[] } } }) => {
      const ids = new Set(args.where.id.in);
      const before = this.state.documents.length;
      this.state.documents = this.state.documents.filter((d) => !ids.has(d.id));
      return Promise.resolve({ count: before - this.state.documents.length });
    },

    delete: (args: { where: { id: string } }) => {
      const row = this.state.documents.find((d) => d.id === args.where.id);
      if (!row) return Promise.reject(new Error('record not found'));
      this.state.documents = this.state.documents.filter((d) => d.id !== args.where.id);
      return Promise.resolve({ ...row });
    },

    update: (args: UpdateDocArgs) => {
      const row = this.state.documents.find((d) => d.id === args.where.id);
      if (!row) return Promise.reject(new Error('record not found'));
      Object.assign(row, args.data);
      return Promise.resolve({ ...row });
    },
  };

  readonly shopApplicationEvent = {
    create: (args: EventArgs) => {
      this.state.events.push({
        applicationId: args.data.applicationId,
        type: args.data.type,
        message: args.data.message ?? null,
        meta: (args.data.meta ?? null) as Prisma.JsonValue,
        actorId: args.data.actorId ?? null,
      });
      return Promise.resolve({});
    },
  };

  /** Rolls the whole state back when the callback throws, and nothing else. */
  $transaction = async <T>(callback: (tx: FakeDb) => Promise<T>): Promise<T> => {
    const snapshot: State = {
      applications: this.state.applications.map((a) => ({ ...a })),
      documents: this.state.documents.map((d) => ({ ...d })),
      events: [...this.state.events],
    };
    try {
      return await callback(this);
    } catch (err) {
      this.state.applications = snapshot.applications;
      this.state.documents = snapshot.documents;
      this.state.events = snapshot.events;
      throw err;
    }
  };

  get asPrisma(): PrismaService {
    return this as unknown as PrismaService;
  }
}

/** An audit log that keeps what it was told, so ordering can be asserted. */
function recorder(): { audit: AuditService; entries: AuditEntry[] } {
  const entries: AuditEntry[] = [];
  const audit = {
    record: (entry: AuditEntry) => {
      entries.push(entry);
      return Promise.resolve();
    },
  } as unknown as AuditService;
  return { audit, entries };
}

const configWith = (uploads: AppConfig['uploads']): ConfigService<AppConfig, true> =>
  ({
    get: (key: string) => {
      if (key !== 'uploads') throw new Error(`unexpected config read: ${key}`);
      return uploads;
    },
  }) as unknown as ConfigService<AppConfig, true>;

/** Only the fields the upload path reads; the rest of multer's shape is irrelevant. */
const partFor = (
  buffer: Buffer,
  originalname = 'citizenship.jpg',
  mimetype = 'image/jpeg',
): UploadedFile => ({
  fieldname: 'file',
  originalname,
  encoding: '7bit',
  mimetype,
  size: buffer.byteLength,
  buffer,
});

/** Real magic bytes, because the validator sniffs rather than trusts. */
const jpeg = (payload = 'photo bytes'): Buffer =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(payload)]);
const pdf = (payload = '1 0 obj'): Buffer => Buffer.from(`%PDF-1.7\n${payload}`);

const SELLER = 'user_seller';
const RIVAL = 'user_rival';
const REVIEWER = 'user_reviewer';
const APP = 'app_1';
const RIVAL_APP = 'app_2';

describe('DocumentsService', () => {
  let directory: string;
  let db: FakeDb;
  let entries: AuditEntry[];
  let uploads: UploadsService;
  let service: DocumentsService;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'gopasal-kyc-'));
    const storage = new LocalStorageProvider(directory, 'http://localhost:4000');
    uploads = new UploadsService(storage, configWith({ maxImageBytes: MB, maxDocumentBytes: 2 * MB }));
    db = new FakeDb({
      applications: [
        { id: APP, applicantId: SELLER, status: 'DRAFT' },
        { id: RIVAL_APP, applicantId: RIVAL, status: 'DRAFT' },
      ],
      documents: [],
      events: [],
    });
    const recorded = recorder();
    entries = recorded.entries;
    service = new DocumentsService(db.asPrisma, uploads, recorded.audit);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const upload = (kind: ShopDocumentKind, file = partFor(jpeg())) =>
    service.upload(SELLER, APP, { kind }, file);

  const setStatus = (status: ApplicationStatus): void => {
    const app = db.state.applications.find((a) => a.id === APP);
    if (app) app.status = status;
  };

  /** Every private object actually on disk, absolute and sorted. */
  const objectsOnDisk = async (): Promise<string[]> => {
    const found: string[] = [];
    async function walk(dir: string): Promise<void> {
      const items = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const item of items) {
        const full = join(dir, item.name);
        if (item.isDirectory()) await walk(full);
        else found.push(full);
      }
    }
    await walk(join(directory, 'private'));
    return found.sort();
  };

  describe('upload — the whole local path', () => {
    it('validates, writes real bytes, records metadata, and returns no storage key', async () => {
      const bytes = pdf('citizenship scan');
      const view = await upload('CITIZENSHIP_FRONT', partFor(bytes, 'citizenship front.pdf', 'application/pdf'));

      assert.equal(view.kind, 'CITIZENSHIP_FRONT');
      assert.equal(view.fileName, 'citizenship front.pdf');
      assert.equal(view.mimeType, 'application/pdf');
      assert.equal(view.sizeBytes, bytes.byteLength);
      assert.equal(view.review, 'PENDING');
      assert.equal(view.reviewNote, null);
      assert.ok(view.uploadedAt instanceof Date);
      assert.equal('storageKey' in view, false, 'a storage key must never be serialised');

      // The database holds a key; the disk holds the bytes, byte for byte.
      const row = db.state.documents[0];
      assert.ok(row);
      assert.match(row.storageKey, /^private\/shop-applications\/app_1\/[0-9a-f]{32}\.pdf$/);
      assert.deepEqual(await fs.readFile(join(directory, row.storageKey)), bytes);
    });

    it('hands the bytes back to the applicant who sent them', async () => {
      const bytes = jpeg('front of the card');
      const view = await upload('CITIZENSHIP_FRONT', partFor(bytes, 'front.jpg'));

      const download = await service.downloadMine(SELLER, APP, view.id);
      assert.deepEqual(download.buffer, bytes);
      assert.equal(download.mimeType, 'image/jpeg');
      assert.equal(download.fileName, 'front.jpg');
    });

    it('writes a timeline entry and an audit entry that name the kind, never the bytes', async () => {
      const view = await upload('SHOP_PHOTO');

      assert.deepEqual(db.state.events, [
        {
          applicationId: APP,
          type: 'document_uploaded',
          message: 'Uploaded the shop photo.',
          meta: { kind: 'SHOP_PHOTO', mime: 'image/jpeg', sizeBytes: jpeg().byteLength },
          actorId: SELLER,
        },
      ]);

      const entry = entries[0];
      assert.ok(entry);
      assert.equal(entry.action, 'onboarding.document.upload');
      assert.equal(entry.entityType, 'ShopDocument');
      assert.equal(entry.entityId, view.id);
      assert.equal(entry.surface, 'seller');
      assert.equal(entry.actorId, SELLER);
      assert.deepEqual(entry.after, {
        applicationId: APP,
        kind: 'SHOP_PHOTO',
        mime: 'image/jpeg',
        sizeBytes: jpeg().byteLength,
      });
      // Neither the storage layout nor the filename belongs in a compliance log.
      assert.ok(!JSON.stringify(entry).includes('private/shop-applications'));
    });

    it('refuses an oversized file with 413, storing neither bytes nor a row', async () => {
      const big = Buffer.concat([pdf(), Buffer.alloc(3 * MB)]);
      await assert.rejects(
        () => upload('BANK_PROOF', partFor(big, 'statement.pdf', 'application/pdf')),
        (err: Error & { status?: number }) => {
          assert.equal(err.status, 413);
          assert.match(err.message, /the limit is 2\.0 MB/);
          return true;
        },
      );
      assert.deepEqual(db.state.documents, []);
      assert.deepEqual(await objectsOnDisk(), []);
    });

    it('refuses a file whose bytes are not what its name and type claim', async () => {
      await assert.rejects(
        () =>
          upload('CITIZENSHIP_FRONT', partFor(Buffer.from('<?php system($_GET["c"]); ?>'), 'front.jpg')),
        (err: Error & { status?: number }) => {
          assert.equal(err.status, 400);
          assert.match(err.message, /JPEG, PNG or WebP image, or a PDF/);
          return true;
        },
      );
      assert.deepEqual(db.state.documents, []);
      assert.deepEqual(await objectsOnDisk(), []);
    });

    it('refuses a request with no file at all, naming the field to use', async () => {
      await assert.rejects(
        () => service.upload(SELLER, APP, { kind: 'SHOP_PHOTO' }, undefined),
        (err: Error & { status?: number }) => {
          assert.equal(err.status, 400);
          assert.match(err.message, /"file" field/);
          return true;
        },
      );
      assert.deepEqual(db.state.documents, []);
    });

    /**
     * The filename is a label and nothing else. It reaches the `fileName` column
     * and the Content-Disposition header; it must never reach the path.
     */
    it('never lets the client filename become part of the path', async () => {
      const view = await upload('OTHER', partFor(jpeg(), '../../../../etc/cron.d/evil.jpg'));

      const row = db.state.documents[0];
      assert.ok(row);
      assert.match(row.storageKey, /^private\/shop-applications\/app_1\/[0-9a-f]{32}\.jpg$/);
      assert.equal(view.fileName, 'evil.jpg');
      assert.equal(
        await fs
          .stat(join(directory, '..', 'etc'))
          .then(() => 'exists')
          .catch(() => 'absent'),
        'absent',
      );
    });
  });

  describe('upload — authorisation', () => {
    it('answers identically for another seller\'s application and for one that does not exist', async () => {
      for (const applicationId of [RIVAL_APP, 'app_does_not_exist']) {
        await assert.rejects(
          () => service.upload(SELLER, applicationId, { kind: 'SHOP_PHOTO' }, partFor(jpeg())),
          (err: Error & { status?: number }) => {
            assert.equal(err.status, 404);
            // Same status and same words: the difference would turn this route
            // into a way of testing whether a reference is real.
            assert.equal(err.message, 'Application not found');
            return true;
          },
        );
      }
      // The check happens before storage, so an unauthorised caller writes nothing.
      assert.deepEqual(await objectsOnDisk(), []);
      assert.deepEqual(db.state.documents, []);
    });

    it('refuses to change documents once the application has left the applicant\'s hands', async () => {
      for (const status of ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN'] as const) {
        setStatus(status);
        await assert.rejects(
          () => upload('SHOP_PHOTO'),
          (err: Error & { status?: number }) => {
            assert.equal(err.status, 409, status);
            assert.match(err.message, /documents cannot be changed right now/);
            return true;
          },
        );
      }
      assert.deepEqual(await objectsOnDisk(), []);
    });

    it('lets an applicant answer a change request by uploading again', async () => {
      setStatus('CHANGES_REQUESTED');
      const view = await upload('CITIZENSHIP_BACK');
      assert.equal(view.kind, 'CITIZENSHIP_BACK');
      assert.equal((await objectsOnDisk()).length, 1);
    });
  });

  describe('upload — replacement, accumulation and the cap', () => {
    it('replaces a re-taken photo: one row, one object, and the old bytes gone', async () => {
      const first = await upload('SHOP_PHOTO', partFor(jpeg('blurry'), 'shop.jpg'));
      const firstKey = db.state.documents[0]?.storageKey ?? '';
      const second = await upload('SHOP_PHOTO', partFor(jpeg('sharp'), 'shop-again.jpg'));

      assert.equal(db.state.documents.length, 1);
      assert.notEqual(second.id, first.id);
      const row = db.state.documents[0];
      assert.ok(row);
      assert.equal(row.fileName, 'shop-again.jpg');
      assert.deepEqual(await objectsOnDisk(), [join(directory, row.storageKey)]);
      await assert.rejects(() => uploads.read(firstKey), /no longer stored/);
      assert.deepEqual((await service.downloadMine(SELLER, APP, second.id)).buffer, jpeg('sharp'));
    });

    it('says "replaced" rather than "uploaded" on the timeline and in the audit trail', async () => {
      await upload('CITIZENSHIP_FRONT');
      await upload('CITIZENSHIP_FRONT');

      assert.deepEqual(
        db.state.events.map((e) => e.type),
        ['document_uploaded', 'document_replaced'],
      );
      assert.equal(db.state.events[1]?.message, 'Replaced the citizenship (front).');
      assert.deepEqual(
        entries.map((e) => e.action),
        ['onboarding.document.upload', 'onboarding.document.replace'],
      );
    });

    it('accumulates OTHER, because it is the slot for whatever a reviewer asked for', async () => {
      await upload('OTHER', partFor(jpeg('one'), 'a.jpg'));
      await upload('OTHER', partFor(jpeg('two'), 'b.jpg'));

      assert.equal(db.state.documents.length, 2);
      assert.equal((await objectsOnDisk()).length, 2);
      assert.deepEqual(
        db.state.events.map((e) => e.type),
        ['document_uploaded', 'document_uploaded'],
      );
    });

    it('caps attachments, while never counting the one being replaced', async () => {
      await upload('SHOP_PHOTO', partFor(jpeg('blurry'), 'shop.jpg'));
      for (let i = 0; i < MAX_DOCUMENTS_PER_APPLICATION - 1; i += 1) {
        await upload('OTHER', partFor(jpeg(`extra ${i}`), `extra-${i}.jpg`));
      }
      assert.equal(db.state.documents.length, MAX_DOCUMENTS_PER_APPLICATION);

      await assert.rejects(
        () => upload('OTHER', partFor(jpeg('over'), 'over.jpg')),
        (err: Error & { status?: number }) => {
          assert.equal(err.status, 409);
          assert.match(err.message, /Remove one you no longer need/);
          return true;
        },
      );
      assert.equal((await objectsOnDisk()).length, MAX_DOCUMENTS_PER_APPLICATION);

      // Re-taking the shop photo is not "another" document, so the cap must not
      // stand between the applicant and the one thing a reviewer complained about.
      const replaced = await upload('SHOP_PHOTO', partFor(jpeg('sharp'), 'shop-again.jpg'));
      assert.equal(replaced.fileName, 'shop-again.jpg');
      assert.equal(db.state.documents.length, MAX_DOCUMENTS_PER_APPLICATION);
      assert.equal((await objectsOnDisk()).length, MAX_DOCUMENTS_PER_APPLICATION);
    });

    /**
     * The object is written before the row that names it, so a failing transaction
     * would otherwise leave a KYC scan on disk that nothing points at.
     */
    it('takes the object back out when the row cannot be written', async () => {
      db.failNextCreate = true;
      await assert.rejects(() => upload('BANK_PROOF'), /insert failed/);

      assert.deepEqual(db.state.documents, []);
      assert.deepEqual(db.state.events, []);
      assert.deepEqual(entries, []);
      assert.deepEqual(await objectsOnDisk(), []);
    });

    it('keeps the original when a replacement fails, rather than losing both', async () => {
      const first = await upload('CITIZENSHIP_FRONT', partFor(jpeg('original'), 'a.jpg'));
      db.failNextCreate = true;
      await assert.rejects(
        () => upload('CITIZENSHIP_FRONT', partFor(jpeg('replacement'), 'b.jpg')),
        /insert failed/,
      );

      assert.equal(db.state.documents.length, 1);
      assert.equal(db.state.documents[0]?.id, first.id);
      assert.deepEqual((await service.downloadMine(SELLER, APP, first.id)).buffer, jpeg('original'));
      assert.equal((await objectsOnDisk()).length, 1);
    });
  });

  describe('downloadMine and remove', () => {
    it('will not hand one seller another seller\'s scan, nor admit that it exists', async () => {
      const view = await upload('CITIZENSHIP_FRONT', partFor(jpeg('private'), 'front.jpg'));

      // Borrowed document id through the owner's application id …
      await assert.rejects(
        () => service.downloadMine(RIVAL, APP, view.id),
        (err: Error & { status?: number }) => {
          assert.equal(err.status, 404);
          assert.equal(err.message, 'Document not found');
          return true;
        },
      );
      // … and through the rival's own application id.
      await assert.rejects(() => service.downloadMine(RIVAL, RIVAL_APP, view.id), /Document not found/);
      // The owner is still served, so the refusals above are about the caller.
      assert.deepEqual((await service.downloadMine(SELLER, APP, view.id)).buffer, jpeg('private'));
    });

    it('detaches a document, deletes its bytes, and records both', async () => {
      const view = await upload('SHOP_PHOTO');
      const key = db.state.documents[0]?.storageKey ?? '';

      const removed = await service.remove(SELLER, APP, view.id);
      assert.equal(removed.id, view.id);
      assert.deepEqual(db.state.documents, []);
      await assert.rejects(() => uploads.read(key), /no longer stored/);
      assert.deepEqual(await objectsOnDisk(), []);

      assert.deepEqual(
        db.state.events.map((e) => e.type),
        ['document_uploaded', 'document_removed'],
      );
      assert.equal(db.state.events[1]?.message, 'Removed the shop photo.');
      const entry = entries[1];
      assert.equal(entry?.action, 'onboarding.document.remove');
      assert.equal(entry?.surface, 'seller');
      assert.deepEqual(entry?.before, { applicationId: APP, kind: 'SHOP_PHOTO' });
    });

    it('refuses to let one seller delete another\'s document, and keeps the bytes', async () => {
      const view = await upload('CITIZENSHIP_BACK');

      await assert.rejects(() => service.remove(RIVAL, APP, view.id), /Application not found/);
      await assert.rejects(() => service.remove(RIVAL, RIVAL_APP, view.id), /Document not found/);

      assert.equal(db.state.documents.length, 1);
      assert.equal((await objectsOnDisk()).length, 1);
    });

    /**
     * Withdrawing evidence from underneath a reviewer who has the application open
     * would make the queue unreviewable, and a document on an approved application
     * is part of the record of why it was approved.
     */
    it('will not remove a document once the application is out for review', async () => {
      const view = await upload('CITIZENSHIP_BACK');
      setStatus('UNDER_REVIEW');

      await assert.rejects(
        () => service.remove(SELLER, APP, view.id),
        (err: Error & { status?: number }) => {
          assert.equal(err.status, 409);
          assert.match(err.message, /being reviewed/);
          return true;
        },
      );
      assert.equal(db.state.documents.length, 1);
      assert.equal((await objectsOnDisk()).length, 1);
    });
  });

  describe('reviewer access', () => {
    it('serves the document and records who looked at it, with the address', async () => {
      const view = await upload('CITIZENSHIP_FRONT', partFor(jpeg('card'), 'card.jpg'));

      const download = await service.downloadForReview(REVIEWER, APP, view.id, '10.0.0.5');
      assert.deepEqual(download.buffer, jpeg('card'));
      assert.equal(download.fileName, 'card.jpg');

      const entry = entries.find((e) => e.action === 'onboarding.document.view');
      assert.ok(entry);
      assert.equal(entry.actorId, REVIEWER);
      assert.equal(entry.surface, 'admin');
      assert.equal(entry.ip, '10.0.0.5');
      assert.equal(entry.entityId, view.id);
      assert.deepEqual(entry.after, { applicationId: APP, kind: 'CITIZENSHIP_FRONT' });
    });

    /**
     * The entry is written *before* the bytes are read, which is the only ordering
     * that survives the case that matters most: a read that failed halfway. If the
     * audit came afterwards, exactly those reads would be missing from the log.
     */
    it('records the view even when the bytes turn out to be gone', async () => {
      const view = await upload('CITIZENSHIP_FRONT');
      await uploads.remove(db.state.documents[0]?.storageKey ?? '');

      await assert.rejects(() => service.downloadForReview(REVIEWER, APP, view.id), /no longer stored/);
      assert.equal(entries.filter((e) => e.action === 'onboarding.document.view').length, 1);
    });

    it('cannot read a document through another application\'s id', async () => {
      const view = await upload('CITIZENSHIP_FRONT');
      await assert.rejects(
        () => service.downloadForReview(REVIEWER, RIVAL_APP, view.id),
        (err: Error & { status?: number }) => {
          assert.equal(err.status, 404);
          assert.equal(err.message, 'Document not found');
          return true;
        },
      );
      // Nothing was logged, because nothing was found to log about.
      assert.deepEqual(
        entries.filter((e) => e.action === 'onboarding.document.view'),
        [],
      );
    });

    it('accepts a document, notes it on the timeline, and audits the change', async () => {
      const view = await upload('BANK_PROOF');

      const decided = await service.review(REVIEWER, APP, view.id, { decision: 'ACCEPTED' });
      assert.equal(decided.review, 'ACCEPTED');
      assert.equal(decided.reviewNote, null);
      assert.equal(db.state.events[1]?.type, 'document_accepted');
      assert.equal(db.state.events[1]?.message, 'The bank proof was accepted.');

      const entry = entries.find((e) => e.action === 'onboarding.document.accept');
      assert.ok(entry);
      assert.deepEqual(entry.before, { review: 'PENDING' });
      assert.deepEqual(entry.after, { applicationId: APP, kind: 'BANK_PROOF', review: 'ACCEPTED' });
    });

    it('rejects with the reason the applicant will be shown, trimmed', async () => {
      const view = await upload('CITIZENSHIP_BACK');

      const decided = await service.review(REVIEWER, APP, view.id, {
        decision: 'REJECTED',
        note: '  The photo is too dark to read.  ',
      });
      assert.equal(decided.review, 'REJECTED');
      assert.equal(decided.reviewNote, 'The photo is too dark to read.');
      assert.equal(
        db.state.events[1]?.message,
        'The citizenship (back) was not accepted: The photo is too dark to read.',
      );
    });

    it('refuses a rejection with no reason, because "fix it" is not actionable', async () => {
      const view = await upload('CITIZENSHIP_BACK');

      for (const note of [undefined, '', '   ']) {
        await assert.rejects(
          () => service.review(REVIEWER, APP, view.id, { decision: 'REJECTED', note }),
          (err: Error & { status?: number }) => {
            assert.equal(err.status, 400);
            assert.match(err.message, /Say why the document was rejected/);
            return true;
          },
        );
      }
      assert.equal(db.state.documents[0]?.review, 'PENDING');
      assert.equal(db.state.events.length, 1, 'no verdict, so no verdict event');
    });
  });

  it('never puts a storage key in anything it returns', async () => {
    const uploaded = await upload('CITIZENSHIP_FRONT');
    const reviewed = await service.review(REVIEWER, APP, uploaded.id, { decision: 'ACCEPTED' });
    const removed = await service.remove(SELLER, APP, uploaded.id);

    for (const payload of [uploaded, reviewed, removed]) {
      assert.equal('storageKey' in payload, false);
      assert.ok(!JSON.stringify(payload).includes('private/shop-applications'));
    }
  });
});


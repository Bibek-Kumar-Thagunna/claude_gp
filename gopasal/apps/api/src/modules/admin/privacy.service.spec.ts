import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException } from '@nestjs/common';
import { PrivacyService } from './privacy.service';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { StorageProvider } from '../../providers/storage.provider';

const storage = { remove: () => Promise.resolve() } as unknown as StorageProvider;
const service = (db: object) => new PrivacyService(db as PrismaService, storage);

describe('privacy retention safeguards', () => {
  it('shows due requests before recent history without filling the page with old purged rows', async () => {
    const selections: Array<{ take: number; where: Record<string, unknown> }> = [];
    const urgent = { id: 'due', userId: 'user_due', status: 'ANONYMIZED' };
    const recent = { id: 'recent', userId: 'user_recent', status: 'PURGED' };
    const db = {
      retentionPolicy: { findUnique: () => Promise.resolve(null) },
      dataErasureRequest: {
        count: () => Promise.resolve(1),
        findMany: (args: { take: number; where: Record<string, unknown> }) => {
          selections.push(args);
          return Promise.resolve(selections.length === 1 ? [urgent] : [recent]);
        },
      },
      legalHold: { count: () => Promise.resolve(0), findMany: () => Promise.resolve([]) },
      retentionRun: { findMany: () => Promise.resolve([]) },
      privateObjectDeletion: { count: () => Promise.resolve(0), findMany: () => Promise.resolve([]) },
    };
    const overview = await service(db).overview();
    assert.deepEqual(overview.requests.map((row) => row.id), ['due', 'recent']);
    assert.equal(selections[0]?.take, 50);
    assert.equal(selections[1]?.take, 99);
    assert.deepEqual(selections[1]?.where, { id: { notIn: ['due'] } });
  });

  it('places a legal hold under the same user lock used by account deletion', async () => {
    const actions: string[] = [];
    const tx = {
      $queryRaw: () => { actions.push('lock'); return Promise.resolve([{ acquired: '' }]); },
      user: { findUnique: () => { actions.push('user'); return Promise.resolve({ id: 'user_12345678' }); } },
      dataErasureRequest: { findUnique: () => Promise.resolve({ status: 'ANONYMIZED' }) },
      legalHold: {
        findFirst: () => Promise.resolve(null),
        create: (args: { data: { subjectId: string } }) => {
          actions.push('create');
          return Promise.resolve(args.data);
        },
      },
    };
    const db = { $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) };
    const hold = await service(db).placeHold('admin', 'user_12345678', 'Court case reference 12345');
    assert.equal(hold.subjectId, 'user_12345678');
    assert.deepEqual(actions, ['lock', 'user', 'create']);
  });

  it('refuses a new hold after personal snapshots were already purged', async () => {
    const tx = {
      $queryRaw: () => Promise.resolve([{ acquired: '' }]),
      user: { findUnique: () => Promise.resolve({ id: 'user_12345678' }) },
      dataErasureRequest: { findUnique: () => Promise.resolve({ status: 'PURGED' }) },
      legalHold: { findFirst: () => { throw new Error('must not look for holds after purge'); } },
    };
    const db = { $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) };
    await assert.rejects(() => service(db).placeHold('admin', 'user_12345678', 'Court case reference 12345'), ConflictException);
  });

  it('does not redact an expired request while a legal hold is active', async () => {
    const tx = {
      $queryRaw: () => Promise.resolve([{ acquired: '' }]),
      dataErasureRequest: { findUnique: () => Promise.resolve({ id: 'request', userId: 'user_12345678', status: 'ANONYMIZED', purgeEligibleAt: new Date(0) }) },
      legalHold: { findFirst: () => Promise.resolve({ id: 'hold' }) },
      order: { updateMany: () => { throw new Error('must not redact held order'); } },
    };
    const db = { $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) };
    const result = await (service(db) as unknown as { purgeOne(id: string, now: Date): Promise<string> }).purgeOne('request', new Date());
    assert.equal(result, 'held');
  });
});

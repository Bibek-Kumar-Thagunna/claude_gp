import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { UploadsService } from '../uploads/uploads.service';
import type { UploadedFile } from '../uploads/uploaded-file';
import { SupportService } from './support.service';

const key = `private/support-tickets/ticket_1/${'a'.repeat(32)}.pdf`;
const file: UploadedFile = {
  fieldname: 'file', originalname: 'evidence.pdf', mimetype: 'application/pdf',
  encoding: '7bit', buffer: Buffer.from('%PDF-1.7\n'), size: 9,
};

function subject(options: { owner?: string; status?: 'OPEN' | 'CLOSED'; accountStatus?: 'ACTIVE' | 'DELETED'; changed?: number; committed?: boolean; fileCount?: number } = {}) {
  let uploads = 0; let removes = 0; let writes = 0; let reads = 0;
  const owner = options.owner ?? 'owner';
  const prisma = {
    $queryRaw: () => Promise.resolve([{ acquired: '' }]),
    user: { findUnique: () => Promise.resolve({ status: options.accountStatus ?? 'ACTIVE' }) },
    supportTicket: {
      findUnique: () => Promise.resolve({ userId: owner, status: options.status ?? 'OPEN' }),
      updateMany: () => Promise.resolve({ count: options.changed ?? 1 }),
    },
    ticketAttachment: {
      findUnique: () => Promise.resolve(options.committed ? { id: 'file_1' } : null),
      findFirst: ({ where }: { where: { message: { ticketId: string; ticket?: { userId: string } } } }) => {
        if (where.message.ticketId !== 'ticket_1' || (where.message.ticket && where.message.ticket.userId !== owner)) return Promise.resolve(null);
        return Promise.resolve({ storageKey: key, fileName: 'evidence.pdf', mimeType: 'application/pdf', sizeBytes: 9 });
      },
      count: () => Promise.resolve(options.fileCount ?? 0),
    },
    ticketMessage: { create: () => { writes++; return Promise.resolve({ id: 'message_1' }); } },
    $transaction: (work: (tx: unknown) => Promise<unknown>) => work(prisma),
  } as unknown as PrismaService;
  const uploadService = {
    storeSupportAttachment: () => { uploads++; return Promise.resolve({ key, displayName: 'evidence.pdf', mime: 'application/pdf', size: 9 }); },
    readSupportAttachment: () => { reads++; return Promise.resolve({ buffer: file.buffer, mimeType: 'application/pdf', fileName: 'evidence.pdf' }); },
    remove: () => { removes++; return Promise.resolve(); },
  } as unknown as UploadsService;
  return { service: new SupportService(prisma, uploadService), uploads: () => uploads, removes: () => removes, writes: () => writes, reads: () => reads };
}

describe('private support evidence', () => {
  it('does not upload or read another customer’s evidence', async () => {
    const test = subject();
    await assert.rejects(() => test.service.addMessageWithFile('intruder', 'ticket_1', 'hello', file), NotFoundException);
    await assert.rejects(() => test.service.customerAttachment('intruder', 'ticket_1', 'file_1'), NotFoundException);
    assert.equal(test.uploads(), 0);
    assert.equal(test.reads(), 0);
  });

  it('rejects a concurrent close and removes the uncommitted upload', async () => {
    const test = subject({ changed: 0 });
    await assert.rejects(() => test.service.addMessageWithFile('owner', 'ticket_1', 'hello', file), BadRequestException);
    assert.equal(test.uploads(), 1);
    assert.equal(test.writes(), 0);
    assert.equal(test.removes(), 1);
  });

  it('does not delete bytes when the transaction may have committed', async () => {
    const test = subject({ changed: 0, committed: true });
    await assert.rejects(() => test.service.addMessageWithFile('owner', 'ticket_1', 'hello', file), BadRequestException);
    assert.equal(test.removes(), 0);
  });

  it('requires an actual multipart file on the file route', async () => {
    const test = subject();
    await assert.rejects(() => test.service.addMessageWithFile('owner', 'ticket_1', 'hello', undefined), BadRequestException);
    assert.equal(test.uploads(), 0);
  });

  it('enforces the per-ticket file ceiling before creating the message', async () => {
    const test = subject({ fileCount: 20 });
    await assert.rejects(() => test.service.addMessageWithFile('owner', 'ticket_1', 'hello', file), BadRequestException);
    assert.equal(test.writes(), 0);
    assert.equal(test.removes(), 1);
  });

  it('does not create new evidence on a deleted account', async () => {
    const test = subject({ accountStatus: 'DELETED' });
    await assert.rejects(() => test.service.staffReplyWithFile('staff', 'ticket_1', 'reply', file), BadRequestException);
    assert.equal(test.writes(), 0);
    assert.equal(test.removes(), 1);
  });

  it('does not reopen a deleted customer’s ticket', async () => {
    const test = subject({ accountStatus: 'DELETED' });
    await assert.rejects(() => test.service.setStatus('ticket_1', 'OPEN'), BadRequestException);
  });

  it('reads a linked file only for the owning customer', async () => {
    const test = subject();
    const result = await test.service.customerAttachment('owner', 'ticket_1', 'file_1');
    assert.equal(result.mimeType, 'application/pdf');
    assert.equal(test.reads(), 1);
  });
});

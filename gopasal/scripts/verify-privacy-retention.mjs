/**
 * Isolated integration check for the resumable proof-file cleanup.
 * Run only against a disposable database whose name contains `_e2e_` after
 * building the API and deploying its migrations.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.includes('_e2e_')) {
  throw new Error('Refusing to run privacy integration test outside a disposable _e2e_ database');
}

const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { PrismaClient } = apiRequire('@prisma/client');
const { PrivacyService } = apiRequire('./dist/modules/admin/privacy.service.js');
const { UsersService } = apiRequire('./dist/modules/users/users.service.js');
const prisma = new PrismaClient();
const suffix = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
const users = [];
const requests = [];
const holds = [];
const objectTasks = [];
const tickets = [];

try {
  const user = await prisma.user.create({ data: { phone: `999${suffix.slice(-7)}`, status: 'DELETED' } });
  users.push(user.id);
  const request = await prisma.dataErasureRequest.create({
    data: {
      userId: user.id,
      status: 'PURGING',
      purgeEligibleAt: new Date(0),
      proofKeys: [`private/delivery-proofs/privacy-test-${suffix}`],
    },
  });
  requests.push(request.id);

  let attempts = 0;
  const storage = {
    remove: async (key) => {
      assert.equal(key, `private/delivery-proofs/privacy-test-${suffix}`);
      attempts++;
      if (attempts === 1) throw new Error('injected storage outage');
    },
  };
  const service = new PrivacyService(prisma, storage);
  const first = await service.run('MANUAL');
  assert.equal(first.failed, 1);
  assert.equal(first.purged, 0);
  const pending = await prisma.dataErasureRequest.findUniqueOrThrow({ where: { id: request.id } });
  assert.equal(pending.status, 'PURGING');
  assert.equal(pending.proofKeys.length, 1);
  assert.match(pending.lastError ?? '', /injected storage outage/);

  const second = await service.run('MANUAL');
  assert.equal(second.failed, 0);
  assert.equal(second.purged, 1);
  const finished = await prisma.dataErasureRequest.findUniqueOrThrow({ where: { id: request.id } });
  assert.equal(finished.status, 'PURGED');
  assert.deepEqual(finished.proofKeys, []);
  assert.ok(finished.purgedAt);
  assert.equal(attempts, 2);
  console.log('PASS privacy retention resumes and finishes after storage failure');

  const heldUser = await prisma.user.create({ data: { phone: `998${suffix.slice(-7)}`, status: 'DELETED' } });
  users.push(heldUser.id);
  const heldRequest = await prisma.dataErasureRequest.create({
    data: { userId: heldUser.id, status: 'ANONYMIZED', purgeEligibleAt: new Date(0) },
  });
  requests.push(heldRequest.id);
  const hold = await prisma.legalHold.create({
    data: { subjectType: 'USER', subjectId: heldUser.id, reason: 'Integration test preservation', placedById: heldUser.id },
  });
  holds.push(hold.id);

  const readyUser = await prisma.user.create({ data: { phone: `997${suffix.slice(-7)}`, status: 'DELETED' } });
  users.push(readyUser.id);
  const readyRequest = await prisma.dataErasureRequest.create({
    data: { userId: readyUser.id, status: 'PURGING', purgeEligibleAt: new Date(0) },
  });
  requests.push(readyRequest.id);
  const third = await service.run('MANUAL');
  assert.equal(third.purged, 1);
  assert.equal(third.scanned, 1);
  assert.equal((await prisma.dataErasureRequest.findUniqueOrThrow({ where: { id: heldRequest.id } })).status, 'ANONYMIZED');
  assert.equal((await prisma.dataErasureRequest.findUniqueOrThrow({ where: { id: readyRequest.id } })).status, 'PURGED');
  console.log('PASS legal hold does not starve other due erasure requests');

  const applicant = await prisma.user.create({ data: { phone: `996${suffix.slice(-7)}`, status: 'ACTIVE' } });
  users.push(applicant.id);
  const application = await prisma.shopApplication.create({
    data: { reference: `TEST-${suffix}`, applicantId: applicant.id, status: 'DRAFT' },
  });
  const kycKey = `private/shop-applications/${application.id}/owned.pdf`;
  await prisma.shopDocument.create({
    data: { applicationId: application.id, kind: 'CITIZENSHIP_FRONT', storageKey: kycKey },
  });
  const usersService = new UsersService(prisma, { verifyOtpChallenge: () => Promise.resolve(applicant.phone) });
  await usersService.deleteAccount(applicant.id, '123456');
  requests.push((await prisma.dataErasureRequest.findUniqueOrThrow({ where: { userId: applicant.id } })).id);
  assert.equal(await prisma.shopApplication.count({ where: { id: application.id } }), 0);
  const queued = await prisma.privateObjectDeletion.findUniqueOrThrow({ where: { storageKey: kycKey } });
  objectTasks.push(queued.id);
  assert.equal(queued.status, 'PENDING');

  let kycAttempts = 0;
  const kycService = new PrivacyService(prisma, {
    remove: (key) => {
      assert.equal(key, kycKey);
      kycAttempts++;
      return kycAttempts === 1 ? Promise.reject(new Error('injected KYC storage outage')) : Promise.resolve();
    },
  });
  const failedCleanup = await kycService.run('MANUAL');
  assert.equal(failedCleanup.objectFailed, 1);
  assert.equal((await prisma.privateObjectDeletion.findUniqueOrThrow({ where: { id: queued.id } })).status, 'PENDING');
  const failedOverview = await kycService.overview();
  assert.equal(failedOverview.counts.objectsPending, 1);
  assert.equal(failedOverview.counts.objectsFailed, 1);
  assert.equal(failedOverview.objectDeletions[0]?.id, queued.id);
  const kycHold = await kycService.placeHold(applicant.id, applicant.id, 'Integration test hold during KYC cleanup');
  holds.push(kycHold.id);
  const heldCleanup = await kycService.run('MANUAL');
  assert.equal(heldCleanup.objectScanned, 0);
  assert.equal(kycAttempts, 1);
  await kycService.releaseHold(applicant.id, kycHold.id, 'Integration test hold released');
  const completedCleanup = await kycService.run('MANUAL');
  assert.equal(completedCleanup.objectsRemoved, 1);
  assert.equal(kycAttempts, 2);
  assert.equal((await prisma.privateObjectDeletion.findUniqueOrThrow({ where: { id: queued.id } })).status, 'DELETED');
  assert.equal((await kycService.overview()).counts.objectsPending, 0);
  console.log('PASS account deletion queues owned KYC bytes and cleanup retries after storage failure and legal hold');

  const malformedOwner = await prisma.user.create({ data: { phone: `995${suffix.slice(-7)}`, status: 'ACTIVE' } });
  users.push(malformedOwner.id);
  const malformedApplication = await prisma.shopApplication.create({
    data: { reference: `BAD-${suffix}`, applicantId: malformedOwner.id, status: 'DRAFT' },
  });
  await prisma.shopDocument.create({
    data: { applicationId: malformedApplication.id, kind: 'CITIZENSHIP_FRONT', storageKey: 'private/shop-applications/another-owner/foreign.pdf' },
  });
  await assert.rejects(() => usersService.deleteAccount(malformedOwner.id, '123456'), /manual review/);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: malformedOwner.id } })).status, 'ACTIVE');
  assert.equal(await prisma.shopApplication.count({ where: { id: malformedApplication.id } }), 1);
  assert.equal(await prisma.privateObjectDeletion.count({ where: { userId: malformedOwner.id } }), 0);
  await prisma.shopApplication.delete({ where: { id: malformedApplication.id } });
  console.log('PASS malformed KYC ownership aborts deletion atomically');

  const ticketOwner = await prisma.user.create({ data: { phone: `994${suffix.slice(-7)}`, status: 'DELETED' } });
  users.push(ticketOwner.id);
  const ticketRequest = await prisma.dataErasureRequest.create({ data: { userId: ticketOwner.id, status: 'ANONYMIZED', purgeEligibleAt: new Date(0) } });
  requests.push(ticketRequest.id);
  const ticket = await prisma.supportTicket.create({ data: { code: `PRIV-${suffix}`, userId: ticketOwner.id, subject: 'Sensitive case' } });
  tickets.push(ticket.id);
  const message = await prisma.ticketMessage.create({ data: { ticketId: ticket.id, authorId: ticketOwner.id, body: 'Private details' } });
  const supportKey = `private/support-tickets/${ticket.id}/${'a'.repeat(32)}.pdf`;
  await prisma.ticketAttachment.create({ data: { messageId: message.id, storageKey: supportKey, fileName: 'evidence.pdf', mimeType: 'application/pdf', sizeBytes: 12 } });
  const removed = [];
  const supportPurge = new PrivacyService(prisma, { remove: (key) => { removed.push(key); return Promise.resolve(); } });
  const supportRun = await supportPurge.run('MANUAL');
  assert.equal(supportRun.purged, 1);
  assert.deepEqual(removed, [supportKey]);
  assert.equal(await prisma.ticketAttachment.count({ where: { messageId: message.id } }), 0);
  assert.equal((await prisma.ticketMessage.findUniqueOrThrow({ where: { id: message.id } })).body, '[Personal details removed after retention]');
  console.log('PASS support evidence is removed after retention redaction');
} finally {
  await prisma.legalHold.deleteMany({ where: { id: { in: holds } } });
  await prisma.privateObjectDeletion.deleteMany({ where: { id: { in: objectTasks } } });
  await prisma.dataErasureRequest.deleteMany({ where: { id: { in: requests } } });
  await prisma.supportTicket.deleteMany({ where: { id: { in: tickets } } });
  await prisma.auditLog.deleteMany({ where: { entityType: 'User', entityId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
}

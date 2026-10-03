/** Runs only against a disposable _e2e_ database; creates and removes local test files. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';

if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.includes('_e2e_')) {
  throw new Error('Refusing to test inventory outside a disposable _e2e_ database');
}
const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { PrismaClient } = apiRequire('@prisma/client');
const prisma = new PrismaClient();
const root = await mkdtemp(join(tmpdir(), 'gopasal-evidence-inventory-'));
const report = join(root, 'report.jsonl');
const old = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
let userId;
let applicationId;
let ticketId;

async function file(key, recent = false) {
  const path = join(root, key);
  await mkdir(join(path, '..'), { recursive: true });
  await writeFile(path, 'test evidence');
  if (!recent) await utimes(path, old, old);
}

try {
  const user = await prisma.user.create({ data: { phone: `99${String(Date.now()).slice(-8)}` } });
  userId = user.id;
  const app = await prisma.shopApplication.create({ data: { reference: `INV-${Date.now()}`, applicantId: user.id, status: 'DRAFT' } });
  applicationId = app.id;
  const linked = `private/shop-applications/${app.id}/linked.pdf`;
  const known = `private/shop-applications/${app.id}/untracked.pdf`;
  const recent = `private/shop-applications/${app.id}/recent.pdf`;
  const unknown = 'private/shop-applications/gone_app/untracked.pdf';
  const queued = `private/shop-applications/${app.id}/queued.pdf`;
  for (const key of [linked, known, unknown, queued]) await file(key);
  await file(recent, true);
  await prisma.shopDocument.create({ data: { applicationId: app.id, kind: 'CITIZENSHIP_FRONT', storageKey: linked } });
  await prisma.privateObjectDeletion.create({ data: { storageKey: queued, userId: user.id, source: 'ACCOUNT_DELETION_APPLICATION' } });
  const ticket = await prisma.supportTicket.create({ data: { code: `INV-${Date.now()}`, userId: user.id, subject: 'Test' } });
  ticketId = ticket.id;
  const message = await prisma.ticketMessage.create({ data: { ticketId: ticket.id, authorId: user.id, body: 'Old', attachments: ['private/legacy/untrusted.jpg'] } });
  const supportStem = 'a'.repeat(32);
  const supportLinked = `private/support-tickets/${ticket.id}/${supportStem}.pdf`;
  const supportOrphan = `private/support-tickets/${ticket.id}/${'b'.repeat(32)}.pdf`;
  await file(supportLinked); await file(supportOrphan);
  await prisma.ticketAttachment.create({ data: { messageId: message.id, storageKey: supportLinked, fileName: 'proof.pdf', mimeType: 'application/pdf', sizeBytes: 12 } });

  const command = spawnSync('node', ['scripts/inventory-private-evidence.mjs', '--output', report], {
    cwd: new URL('../', import.meta.url).pathname,
    env: { ...process.env, STORAGE_PROVIDER: 'local', STORAGE_LOCAL_DIR: root },
    encoding: 'utf8',
  });
  assert.equal(command.status, 0, command.stderr);
  assert.equal((await stat(report)).mode & 0o777, 0o600);
  const summary = JSON.parse(command.stdout.trim());
  assert.equal(summary.counts.linked, 2);
  assert.equal(summary.counts.queued, 1);
  assert.equal(summary.counts.knownOwnerUntracked, 2);
  assert.equal(summary.counts.unknownOwnerUntracked, 1);
  assert.equal(summary.counts.recentUntracked, 1);
  assert.ok(summary.counts.legacyTicketReferences >= 1);
  const rows = (await readFile(report, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(rows.some((row) => row.kind === 'knownOwnerUntracked' && row.storageKey === known));
  assert.ok(rows.some((row) => row.kind === 'knownOwnerUntracked' && row.storageKey === supportOrphan && row.ticketId === ticket.id));
  assert.ok(rows.some((row) => row.kind === 'unknownOwnerUntracked' && row.storageKey === unknown));
  assert.ok(rows.some((row) => row.kind === 'legacyTicketReferences' && row.ticketId === ticket.id));
  const overwrite = spawnSync('node', ['scripts/inventory-private-evidence.mjs', '--output', report], {
    cwd: new URL('../', import.meta.url).pathname,
    env: { ...process.env, STORAGE_PROVIDER: 'local', STORAGE_LOCAL_DIR: root },
    encoding: 'utf8',
  });
  assert.notEqual(overwrite.status, 0, 'an existing report must never be overwritten');

  const requests = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    requests.push({ path: url.pathname, prefix: url.searchParams.get('prefix'), auth: request.headers.authorization });
    const isSupport = url.searchParams.get('prefix') === 'private/support-tickets/';
    const second = url.searchParams.get('continuation-token') === 'page2';
    const key = second ? unknown : linked;
    response.writeHead(200, { 'Content-Type': 'application/xml' });
    response.end(isSupport ? '<ListBucketResult><IsTruncated>false</IsTruncated></ListBucketResult>' : `<ListBucketResult><Contents><Key>${encodeURIComponent(key)}</Key><LastModified>${old.toISOString()}</LastModified></Contents><IsTruncated>${second ? 'false' : 'true'}</IsTruncated>${second ? '' : '<NextContinuationToken>page2</NextContinuationToken>'}</ListBucketResult>`);
  });
  try {
    await new Promise((accept) => server.listen(0, '127.0.0.1', accept));
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    const s3Report = join(root, 's3-report.jsonl');
    const s3 = await new Promise((accept) => {
      const child = spawn('node', ['scripts/inventory-private-evidence.mjs', '--output', s3Report], {
        cwd: new URL('../', import.meta.url).pathname,
        env: { ...process.env, STORAGE_PROVIDER: 's3', S3_ENDPOINT: endpoint, S3_BUCKET: 'test-bucket',
          S3_ACCESS_KEY: 'test-access', S3_SECRET_KEY: 'test-secret', S3_REGION: 'us-east-1', S3_FORCE_PATH_STYLE: 'true' },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (part) => { stdout += part; });
      child.stderr.on('data', (part) => { stderr += part; });
      child.on('close', (code) => accept({ code, stdout, stderr }));
    });
    assert.equal(s3.code, 0, s3.stderr);
    const s3Counts = JSON.parse(s3.stdout.trim()).counts;
    assert.equal(s3Counts.linked, 1);
    assert.equal(s3Counts.unknownOwnerUntracked, 1);
    assert.equal(requests.length, 3);
    assert.ok(requests.every((request) => request.path === '/test-bucket/' && ['private/shop-applications/', 'private/support-tickets/'].includes(request.prefix) && request.auth?.startsWith('AWS4-HMAC-SHA256 ')));
  } finally {
    await new Promise((accept) => server.close(accept));
  }
  console.log('PASS private evidence inventory classifies local/S3 objects and legacy support references');
} finally {
  if (ticketId) await prisma.supportTicket.delete({ where: { id: ticketId } });
  if (applicationId) {
    await prisma.shopDocument.deleteMany({ where: { applicationId } });
    await prisma.shopApplication.delete({ where: { id: applicationId } });
  }
  if (userId) {
    await prisma.privateObjectDeletion.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  }
  await prisma.$disconnect();
  await rm(root, { recursive: true, force: true });
}

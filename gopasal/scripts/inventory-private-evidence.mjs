/**
 * Read-only reconciliation of private application/support evidence and legacy ticket
 * attachment references. Requires API build, DATABASE_URL, and the same storage
 * environment as the deployment. Full findings go to an explicitly named new
 * mode-0600 JSONL file; stdout contains counts only.
 *
 * This deliberately does not delete or queue unknown objects: an application
 * row may be gone, so the owner and any preservation duty cannot be inferred.
 */
import { createRequire } from 'node:module';
import { open, readdir, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { PrismaClient } = apiRequire('@prisma/client');
const { signRequest } = apiRequire('./dist/providers/aws-sigv4.js');
const APP_PREFIX = 'private/shop-applications/';
const SUPPORT_PREFIX = 'private/support-tickets/';
const PREFIXES = [APP_PREFIX, SUPPORT_PREFIX];
const BATCH = 500;
const MIN_AGE_MS = 72 * 60 * 60 * 1000;

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

function xmlValue(block, tag) {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(block);
  if (!match) return null;
  return match[1].replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_, hex, decimal) => String.fromCodePoint(hex ? Number.parseInt(hex, 16) : Number(decimal)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

export function parseS3List(xml) {
  if (!xml.includes('<ListBucketResult')) throw new Error('S3 inventory returned an unexpected response');
  const objects = [];
  for (const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const encodedKey = xmlValue(match[1], 'Key');
    const modified = xmlValue(match[1], 'LastModified');
    if (!encodedKey || !modified) throw new Error('S3 inventory omitted a key or timestamp');
    const lastModified = new Date(modified);
    if (Number.isNaN(lastModified.getTime())) throw new Error('S3 inventory returned an invalid timestamp');
    objects.push({ key: decodeURIComponent(encodedKey), lastModified });
  }
  const truncated = xmlValue(xml, 'IsTruncated');
  if (truncated !== 'true' && truncated !== 'false') throw new Error('S3 inventory omitted pagination status');
  const nextCursor = truncated === 'true' ? xmlValue(xml, 'NextContinuationToken') : null;
  if (truncated === 'true' && !nextCursor) throw new Error('S3 inventory omitted continuation token');
  return { objects, nextCursor };
}

async function* localObjects() {
  const configured = process.env.STORAGE_LOCAL_DIR ?? 'uploads';
  const root = isAbsolute(configured) ? configured : resolve(fileURLToPath(new URL('../apps/api/', import.meta.url)), configured);
  async function* walk(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) yield* walk(path);
      else if (entry.isFile()) {
        const details = await stat(path);
        yield { key: relative(root, path).split('/').join('/'), lastModified: details.mtime };
      }
    }
  }
  for (const prefix of PREFIXES) yield* walk(join(root, prefix));
}

async function* s3Objects() {
  const endpoint = process.env.S3_ENDPOINT ?? `https://s3.${process.env.S3_REGION ?? 'us-east-1'}.amazonaws.com`;
  const region = process.env.S3_REGION ?? 'us-east-1';
  const bucket = required('S3_BUCKET');
  const pathStyle = process.env.S3_FORCE_PATH_STYLE ?? 'true';
  if (!['true', 'false'].includes(pathStyle)) throw new Error('S3_FORCE_PATH_STYLE must be true or false');
  const forcePathStyle = pathStyle === 'true';
  const base = new URL(endpoint);
  if (forcePathStyle) base.pathname = `${base.pathname.replace(/\/+$/, '')}/${encodeURIComponent(bucket)}/`;
  else base.hostname = `${bucket}.${base.hostname}`;
  for (const prefix of PREFIXES) {
    let cursor = null;
    do {
    const url = new URL(base);
    url.searchParams.set('list-type', '2');
    url.searchParams.set('encoding-type', 'url');
    url.searchParams.set('prefix', prefix);
    url.searchParams.set('max-keys', '1000');
    if (cursor) url.searchParams.set('continuation-token', cursor);
    const headers = signRequest({
      method: 'GET', url: url.toString(), region, service: 's3',
      accessKey: required('S3_ACCESS_KEY'), secretKey: required('S3_SECRET_KEY'), payload: '',
    });
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`S3 inventory failed (HTTP ${response.status})`);
    const page = parseS3List(await response.text());
    for (const object of page.objects) yield object;
    if (page.nextCursor && page.nextCursor === cursor) throw new Error('S3 inventory cursor did not advance');
    cursor = page.nextCursor;
    } while (cursor);
  }
}

export function applicationIdFromKey(key) {
  if (!key.startsWith(APP_PREFIX)) return null;
  const remainder = key.slice(APP_PREFIX.length).split('/');
  return remainder.length === 2 && /^[A-Za-z0-9_-]{1,64}$/.test(remainder[0]) && remainder[1]
    ? remainder[0] : null;
}

export function ticketIdFromKey(key) {
  const match = /^private\/support-tickets\/([A-Za-z0-9_-]{1,64})\/[a-f0-9]{32}\.(jpg|png|webp|pdf)$/.exec(key);
  return match?.[1] ?? null;
}

async function main() {
  required('DATABASE_URL');
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex < 0 || !process.argv[outputIndex + 1] || process.argv.length !== 4 || outputIndex !== 2) {
    throw new Error('Usage: node scripts/inventory-private-evidence.mjs --output /secure/new-report.jsonl');
  }
  const output = resolve(process.argv[3]);
  const report = await open(output, 'wx', 0o600);
  const prisma = new PrismaClient();
  const counts = { linked: 0, queued: 0, deletedButPresent: 0, recentUntracked: 0, heldUntracked: 0, knownOwnerUntracked: 0, unknownOwnerUntracked: 0, invalidKey: 0, legacyTicketReferences: 0 };
  const write = async (row) => {
    let remaining = Buffer.from(`${JSON.stringify(row)}\n`);
    while (remaining.length) {
      const { bytesWritten } = await report.write(remaining);
      if (!bytesWritten) throw new Error('Inventory report write made no progress');
      remaining = remaining.subarray(bytesWritten);
    }
  };
  try {
    let batch = [];
    const inspect = async () => {
      if (!batch.length) return;
      const keys = batch.map((item) => item.key);
      const ids = [...new Set(keys.map(applicationIdFromKey).filter(Boolean))];
      const ticketIds = [...new Set(keys.map(ticketIdFromKey).filter(Boolean))];
      const [docs, supportFiles, tasks, applications, tickets] = await Promise.all([
        prisma.shopDocument.findMany({ where: { storageKey: { in: keys } }, select: { storageKey: true } }),
        prisma.ticketAttachment.findMany({ where: { storageKey: { in: keys } }, select: { storageKey: true } }),
        prisma.privateObjectDeletion.findMany({ where: { storageKey: { in: keys } }, select: { storageKey: true, status: true } }),
        prisma.shopApplication.findMany({ where: { id: { in: ids } }, select: { id: true, applicantId: true } }),
        prisma.supportTicket.findMany({ where: { id: { in: ticketIds } }, select: { id: true, userId: true } }),
      ]);
      const linked = new Set([...docs, ...supportFiles].map((row) => row.storageKey));
      const taskByKey = new Map(tasks.map((row) => [row.storageKey, row]));
      const appById = new Map(applications.map((row) => [row.id, row]));
      const ticketById = new Map(tickets.map((row) => [row.id, row]));
      const now = new Date();
      const held = await prisma.legalHold.findMany({
        where: { subjectType: 'USER', subjectId: { in: [...applications.map((row) => row.applicantId), ...tickets.map((row) => row.userId)] }, releasedAt: null,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: { subjectId: true },
      });
      const heldUsers = new Set(held.map((row) => row.subjectId));
      for (const object of batch) {
        const applicationId = applicationIdFromKey(object.key);
        const ticketId = ticketIdFromKey(object.key);
        const ownerId = applicationId ? appById.get(applicationId)?.applicantId : ticketId ? ticketById.get(ticketId)?.userId : null;
        const task = taskByKey.get(object.key);
        let kind;
        if (linked.has(object.key)) kind = 'linked';
        else if (task?.status === 'PENDING') kind = 'queued';
        else if (task?.status === 'DELETED') kind = 'deletedButPresent';
        else if (!applicationId && !ticketId) kind = 'invalidKey';
        else if (now.getTime() - object.lastModified.getTime() < MIN_AGE_MS) kind = 'recentUntracked';
        else if (ownerId && heldUsers.has(ownerId)) kind = 'heldUntracked';
        else if (ownerId) kind = 'knownOwnerUntracked';
        else kind = 'unknownOwnerUntracked';
        counts[kind]++;
        if (kind !== 'linked' && kind !== 'queued') {
          await write({ kind, storageKey: object.key, lastModified: object.lastModified.toISOString(), applicationId, ticketId });
        }
      }
      batch = [];
    };
    const provider = process.env.STORAGE_PROVIDER ?? 'local';
    if (!['local', 's3'].includes(provider)) throw new Error(`Unsupported STORAGE_PROVIDER=${provider}`);
    const objects = provider === 's3' ? s3Objects() : localObjects();
    for await (const object of objects) {
      batch.push(object);
      if (batch.length === BATCH) await inspect();
    }
    await inspect();

    let lastId;
    while (true) {
      const rows = await prisma.ticketMessage.findMany({
        where: { attachments: { isEmpty: false } }, orderBy: { id: 'asc' }, take: BATCH,
        ...(lastId ? { cursor: { id: lastId }, skip: 1 } : {}),
        select: { id: true, ticketId: true, attachments: true },
      });
      if (!rows.length) break;
      for (const row of rows) {
        counts.legacyTicketReferences += row.attachments.length;
        await write({ kind: 'legacyTicketReferences', ticketMessageId: row.id, ticketId: row.ticketId, references: row.attachments });
      }
      lastId = rows.at(-1).id;
    }
    await write({ kind: 'summary', counts, inspectedAt: new Date().toISOString() });
    console.log(JSON.stringify({ report: output, counts }));
  } finally {
    await prisma.$disconnect();
    await report.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();

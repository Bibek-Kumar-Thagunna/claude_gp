#!/usr/bin/env node
/**
 * GoPasal — runtime verification of the KYC document-upload path (task #80).
 *
 * This is not a unit test. It brings up the real development stack, boots the real
 * API with the real provider configuration, and drives real HTTP requests with real
 * multipart bodies against it — then reads the developer's own filesystem to check
 * that the bytes it uploaded are where the code claims they are, and that a delete
 * really removes them. Nothing here is mocked, stubbed, or faked: if the API is not
 * running, every check fails rather than passing quietly.
 *
 * It covers, in order:
 *   1  PostgreSQL and Redis are up on the configured development ports
 *   2  the API boots with sms=log, storage=local, maps=osm, push=log, COD enabled
 *   3  the upload routes are exposed (asserted against the live OpenAPI document)
 *   4  a genuine multipart upload of a real JPEG is accepted
 *   5  the object is written under the configured local storage directory
 *   6  the applicant can read it back through the authenticated route
 *   7  another applicant cannot (404), an anonymous caller cannot (401), and a
 *      non-privileged caller cannot use the reviewer route (403)
 *   8  deleting it removes the row and the bytes
 *   9  submission is refused while a required document is missing
 *  10  submission succeeds once the KYC set is complete
 *  11  the reviewer can download and accept a document with shops.view/shops.approve
 *  12  approval still enforces the document floor, and creates the shop
 *
 * Usage, from the gopasal/ directory:
 *
 *   node scripts/verify-uploads-e2e.mjs                 # start everything, verify, stop
 *   node scripts/verify-uploads-e2e.mjs --verbose        # stream the API log too
 *   node scripts/verify-uploads-e2e.mjs --no-db          # Postgres/Redis already running
 *   node scripts/verify-uploads-e2e.mjs --no-build       # reuse the existing dist/
 *   node scripts/verify-uploads-e2e.mjs --use-running    # verify an API you started
 *
 * `--use-running` needs SMS_DEV_OUTBOX_FILE set on that process, because the script
 * signs in the way a person does: it asks for a one-time code and then reads it out
 * of the development outbox. That variable is development-only — validateConfig
 * refuses to start production with it set.
 *
 * Exit code 0 means every check above passed. Any failure exits non-zero and prints
 * what was expected against what actually happened.
 *
 * It reads no production credential, writes nothing outside apps/api/uploads and
 * ./tmp, and never deletes a database, a volume or a seeded row. It does leave the
 * application, shop and test users it created behind, named so you can find them.
 */
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const API_DIR = join(REPO, 'apps', 'api');

const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const OPTS = {
  noDb: has('no-db'),
  noBuild: has('no-build'),
  useRunning: has('use-running'),
  verbose: has('verbose'),
};

// ── output ───────────────────────────────────────────────────────────────────
const C = { r: '\x1b[31m', g: '\x1b[32m', y: '\x1b[33m', c: '\x1b[36m', d: '\x1b[2m', x: '\x1b[0m' };
const say = (s = '') => process.stdout.write(`${s}\n`);
const head = (s) => say(`\n${C.c}${s}${C.x}\n${C.d}${'─'.repeat(Math.min(78, s.length + 8))}${C.x}`);
const pass = (s) => say(`  ${C.g}✔${C.x} ${s}`);
const info = (s) => say(`  ${C.d}·${C.x} ${s}`);
const warn = (s) => say(`  ${C.y}!${C.x} ${s}`);

/** A verification failure. Distinguished from a crash so the report still prints. */
class Failure extends Error {}
const fail = (msg) => {
  throw new Failure(msg);
};

/** The lines of the final report, keyed by the label the reader asked for. */
const REPORT = new Map();
const record = (label, line) => REPORT.set(label, line);

const json = (v) => JSON.stringify(v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const digest = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 12);

function eq(actual, expected, what) {
  if (json(actual) !== json(expected)) fail(`${what}: expected ${json(expected)}, got ${json(actual)}`);
  pass(`${what} = ${json(actual)}`);
}
function truthy(value, what) {
  if (!value) fail(`${what}: expected a value, got ${json(value)}`);
  pass(`${what} = ${json(value)}`);
}
// ── environment ──────────────────────────────────────────────────────────────
/** apps/api/.env, parsed the way dotenv would. Never written to. */
function parseEnvFile(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const at = line.indexOf('=');
    if (at <= 0) continue;
    let value = line.slice(at + 1).trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    out[line.slice(0, at).trim()] = value;
  }
  return out;
}

const ENV = parseEnvFile(join(API_DIR, '.env'));
const envOf = (key, fallback) => (ENV[key] ?? process.env[key] ?? fallback);
const boolOf = (key, fallback) => {
  const v = envOf(key, undefined);
  if (v === undefined || v === '') return fallback;
  return !/^(false|0|no|off)$/i.test(v.trim());
};

const PORT = Number(envOf('PORT', '4000'));
const PREFIX = envOf('API_PREFIX', 'api');
const ORIGIN = `http://127.0.0.1:${PORT}`;
const STORAGE_DIR = (() => {
  const dir = envOf('STORAGE_LOCAL_DIR', 'uploads');
  return isAbsolute(dir) ? dir : join(API_DIR, dir);
})();
const OUTBOX_DEFAULT = join(REPO, 'tmp', 'sms-outbox-e2e.jsonl');
let OUTBOX = OUTBOX_DEFAULT;

/** Where a TCP check should look for the database the API will actually dial. */
function databaseTarget() {
  const url = envOf('DATABASE_URL', '');
  try {
    const u = new URL(url);
    return { host: u.hostname || '127.0.0.1', port: Number(u.port || 5432) };
  } catch {
    return null;
  }
}

function tcp(host, port, timeoutMs = 3000) {
  return new Promise((done) => {
    const socket = connect({ host, port });
    const finish = (ok) => {
      socket.destroy();
      done(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}
// ── processes ────────────────────────────────────────────────────────────────
function run(cmd, args, cwd) {
  return new Promise((done) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    let out = '';
    const take = (d) => {
      out += d.toString();
      if (OPTS.verbose) process.stdout.write(d);
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.once('error', (err) => done({ code: -1, out: `${out}\n${err.message}` }));
    child.once('close', (code) => done({ code, out }));
  });
}

let api = null; // the API child process, when this script started it
let apiLog = '';
let stopping = false;

function apiTail(lines = 40) {
  return apiLog.split('\n').filter(Boolean).slice(-lines).join('\n');
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
let BASE = ''; // e.g. http://127.0.0.1:4000/api/v1

async function http(path, { method = 'GET', token, body, form, expect } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  } else if (form) {
    payload = form; // fetch sets the multipart boundary itself
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  const buf = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get('content-type') ?? '';
  let data = null;
  if (type.includes('json')) {
    try {
      data = JSON.parse(buf.toString('utf8'));
    } catch {
      data = null;
    }
  }
  const out = { status: res.status, headers: res.headers, json: data, buf };
  const want = expect === undefined ? null : Array.isArray(expect) ? expect : [expect];
  if (want && !want.includes(res.status)) {
    // 429 is the one status that means "the harness, not the code" — the API rate
    // limits per address, and a second run started inside the same minute trips it.
    const hint =
      res.status === 429 && !want.includes(429)
        ? ' · the API rate limited this address; wait a minute and run again'
        : '';
    fail(
      `${method} ${path} → ${res.status}, expected ${want.join(' or ')}` +
        `${data ? ` · body ${json(data).slice(0, 500)}` : ''}${hint}`,
    );
  }
  return out;
}
/**
 * Find the base path the running API actually answers on. `main.ts` sets a global
 * prefix and URI versioning, so it should be /api/v1 — but asking is better than
 * assuming, and the answer goes in the report.
 */
async function discoverBase(timeoutMs) {
  const candidates = [`${ORIGIN}/${PREFIX}/v1`, `${ORIGIN}/${PREFIX}`];
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (api && api.exitCode !== null) {
      say(apiTail(60));
      fail(`the API exited with code ${api.exitCode} before answering /health`);
    }
    for (const candidate of candidates) {
      try {
        const res = await fetch(`${candidate}/health`);
        if (res.status === 200) {
          BASE = candidate;
          return await res.json();
        }
      } catch {
        /* not listening yet */
      }
    }
    await sleep(500);
  }
  if (api) say(apiTail(60));
  fail(`nothing answered GET /health at ${candidates.join(' or ')} within ${Math.round(timeoutMs / 1000)}s`);
}

// ── one-time codes, read from the development outbox ─────────────────────────
function outboxEntries() {
  if (!existsSync(OUTBOX)) return [];
  return readFileSync(OUTBOX, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function codeFor(phone, skip) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const fresh = outboxEntries().slice(skip).reverse();
    const hit = fresh.find((entry) => String(entry.to ?? '').endsWith(phone));
    const code = hit ? /(\d{4,8})/.exec(String(hit.message ?? '')) : null;
    if (code) return code[1];
    await sleep(200);
  }
  fail(`no one-time code for ${phone} reached the development outbox at ${OUTBOX}`);
}
/** Sign in exactly as a person does: request a code, read it, verify it. */
async function signIn(phone, surface) {
  const skip = outboxEntries().length;
  await http('/auth/otp/request', { method: 'POST', body: { phone }, expect: [200, 201] });
  const code = await codeFor(phone, skip);
  const res = await http('/auth/otp/verify', {
    method: 'POST',
    body: { phone, code, surface },
    expect: [200, 201],
  });
  const token = res.json?.tokens?.accessToken;
  if (!token) fail(`sign-in for ${phone} returned no access token: ${json(res.json).slice(0, 300)}`);
  return { token, user: res.json.user, isNew: res.json.isNewUser };
}

/** A phone nobody is seeded on: the demo accounts are all 98…, these are 96…. */
const freshPhone = () => `96${String(randomInt(10_000_000, 99_999_999))}`;

// ── real files ───────────────────────────────────────────────────────────────
/**
 * A JPEG that is a JPEG: SOI + JFIF APP0, a COM segment carrying a unique label so
 * two uploads are never byte-identical, and EOI. The uploader validates by reading
 * the first bytes, so this is the same shape a phone camera would send.
 */
function jpegBytes(label) {
  const comment = Buffer.from(`GoPasal e2e ${label} ${randomBytes(8).toString('hex')}`, 'latin1');
  const length = Buffer.alloc(2);
  length.writeUInt16BE(comment.length + 2);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
      0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
    Buffer.from([0xff, 0xfe]),
    length,
    comment,
    Buffer.from([0xff, 0xd9]),
  ]);
}

/** A one-page PDF, for the bank proof. `%PDF-` at offset 0 is what makes it one. */
function pdfBytes(label) {
  const body =
    `%PDF-1.4\n% GoPasal e2e ${label} ${randomBytes(8).toString('hex')}\n` +
    '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n';
  return Buffer.from(body, 'latin1');
}
// ── the disk, read directly ──────────────────────────────────────────────────
let DOC_DIR = ''; // <storage root>/private/shop-applications/<applicationId>

const onDisk = () => (existsSync(DOC_DIR) ? readdirSync(DOC_DIR).sort() : []);
const bytesOf = (name) => readFileSync(join(DOC_DIR, name));
const findBytes = (buf) => onDisk().find((name) => bytesOf(name).equals(buf));

/** Upload one file the way a browser form does. */
async function uploadDocument(token, applicationId, kind, bytes, filename, mime, expect) {
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', new Blob([bytes], { type: mime }), filename);
  return http(`/seller/onboarding/applications/${applicationId}/documents`, {
    method: 'POST',
    token,
    form,
    expect,
  });
}

// ── the run ──────────────────────────────────────────────────────────────────
async function main() {
  say(`${C.c}GoPasal — runtime verification of the KYC upload path${C.x}`);
  info(`repository ${REPO}`);
  info(`storage root ${STORAGE_DIR}`);

  // Refuse to run against anything that is not the local development stack. This
  // script signs users in and creates a shop; it must never touch production.
  const declaredEnv = envOf('NODE_ENV', 'development');
  if (declaredEnv === 'production') fail('apps/api/.env says NODE_ENV=production — refusing to run');
  const storageProvider = envOf('STORAGE_PROVIDER', 'local');
  if (storageProvider !== 'local') {
    fail(`STORAGE_PROVIDER=${storageProvider} — this verification is for the local provider only`);
  }

  // ── 1 · PostgreSQL and Redis ───────────────────────────────────────────────
  head('1 · PostgreSQL and Redis on the development ports');
  if (OPTS.noDb) {
    info('--no-db: not touching the containers');
  } else {
    const up = await run('pnpm', ['db:up'], REPO);
    if (up.code !== 0) {
      say(up.out.slice(-3000));
      fail('pnpm db:up failed — resolve that first (pnpm db:portcheck names any port conflict)');
    }
    pass('pnpm db:up exit 0');
  }
  const db = databaseTarget();
  if (!db) fail('DATABASE_URL in apps/api/.env could not be parsed');
  const redis = { host: envOf('REDIS_HOST', '127.0.0.1'), port: Number(envOf('REDIS_PORT', '6379')) };
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await tcp(db.host, db.port)) break;
    if (attempt === 59) fail(`nothing is listening on ${db.host}:${db.port} (DATABASE_URL)`);
    await sleep(1000);
  }
  pass(`PostgreSQL answers on ${db.host}:${db.port}`);
  if (!(await tcp(redis.host, redis.port))) fail(`nothing is listening on ${redis.host}:${redis.port} (Redis)`);
  pass(`Redis answers on ${redis.host}:${redis.port}`);

  // ── 2 · the API boots with the development providers ───────────────────────
  head('2 · API boot with the development provider configuration');
  mkdirSync(dirname(OUTBOX), { recursive: true });
  if (existsSync(OUTBOX)) unlinkSync(OUTBOX);

  if (OPTS.useRunning) {
    const configured = envOf('SMS_DEV_OUTBOX_FILE', '');
    if (!configured) {
      fail(
        '--use-running needs SMS_DEV_OUTBOX_FILE set on the running API, otherwise this ' +
          'script cannot read the one-time code it is sent. Set it in apps/api/.env and restart.',
      );
    }
    const resolved = isAbsolute(configured) ? configured : join(API_DIR, configured);
    OUTBOX = resolved;
    info(`reading one-time codes from ${resolved}`);
  } else {
    if (!OPTS.noBuild) {
      const built = await run('npx', ['nest', 'build'], API_DIR);
      if (built.code !== 0) {
        say(built.out.slice(-4000));
        fail('nest build failed');
      }
      pass('nest build exit 0');
    }
    if (!existsSync(join(API_DIR, 'dist', 'main.js'))) fail('apps/api/dist/main.js is missing — run without --no-build');
    api = spawn(process.execPath, ['dist/main.js'], {
      cwd: API_DIR,
      env: { ...process.env, NODE_ENV: 'development', SMS_DEV_OUTBOX_FILE: OUTBOX },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const take = (d) => {
      apiLog += d.toString();
      if (OPTS.verbose) process.stdout.write(d);
    };
    api.stdout.on('data', take);
    api.stderr.on('data', take);
    info(`started node dist/main.js (pid ${api.pid})`);
  }
  const health = await discoverBase(90_000);
  pass(`GET ${BASE}/health → 200`);
  eq(health.status, 'ok', 'health.status');
  eq(health.db, 'up', 'health.db');
  eq(health.cache, 'up', 'health.cache');
  record('API boot', `booted on ${BASE} — health ok, db up, cache up`);

  // The providers actually resolved by DI, as the API itself reports them at boot.
  if (api) {
    for (let attempt = 0; attempt < 20 && !/providers →/.test(apiLog); attempt++) await sleep(200);
    const line = /providers →.*/.exec(apiLog)?.[0] ?? '';
    if (line === '') fail('the API never printed its provider line');
    info(line.trim());
    for (const expected of ['sms=log', 'storage=local', 'maps=osm', 'push=log']) {
      if (!line.includes(expected)) fail(`the live provider line does not contain ${expected}: ${line}`);
    }
    pass('providers → sms=log storage=local maps=osm push=log (from the running API)');
    record('Providers', line.trim());
  } else {
    warn('--use-running: cannot read the boot log, provider selection taken from apps/api/.env');
    record('Providers', 'not read from a boot log (--use-running)');
  }
  const cod = boolOf('PAYMENTS_COD_ENABLED', true);
  eq(cod, true, 'Cash on Delivery enabled (PAYMENTS_COD_ENABLED)');

  // ── 3 · the upload routes exist ────────────────────────────────────────────
  head('3 · the upload routes are exposed');
  const specUrl = `${ORIGIN}/${PREFIX}/docs-json`;
  const specRes = await fetch(specUrl);
  if (specRes.status !== 200) fail(`GET ${specUrl} → ${specRes.status} (expected the OpenAPI document)`);
  const openapi = await specRes.json();
  const paths = Object.keys(openapi.paths ?? {});
  if (paths.length === 0) fail('the OpenAPI document lists no paths');
  const required = [
    ['post', 'seller/onboarding/applications/{applicationId}/documents'],
    ['get', 'seller/onboarding/applications/{applicationId}/documents/{documentId}/file'],
    ['delete', 'seller/onboarding/applications/{applicationId}/documents/{documentId}'],
    ['get', 'admin/onboarding/applications/{applicationId}/documents/{documentId}/file'],
    ['post', 'admin/onboarding/applications/{applicationId}/documents/{documentId}/review'],
  ];
  for (const [method, tail] of required) {
    const key = paths.find((p) => p.endsWith(tail));
    if (!key) fail(`the API does not expose ${method.toUpperCase()} …/${tail}`);
    if (!openapi.paths[key][method]) fail(`${key} exists but has no ${method.toUpperCase()}`);
    pass(`${method.toUpperCase()} ${key}`);
  }
  record('Routes', `${required.length}/5 document routes present under ${BASE}`);
  // ── identities ─────────────────────────────────────────────────────────────
  head('identities (real OTP sign-in, no bypass)');
  const applicantPhone = freshPhone();
  const rivalPhone = freshPhone();
  const applicant = await signIn(applicantPhone, 'seller');
  pass(`applicant ${applicantPhone} signed in (new account: ${applicant.isNew})`);
  const rival = await signIn(rivalPhone, 'seller');
  pass(`second applicant ${rivalPhone} signed in (new account: ${rival.isNew})`);
  const reviewer = await signIn('9800000002', 'admin');
  pass('seeded Operations Admin 9800000002 signed in');

  // The reviewer's permissions are real, not asserted by this script: the queue is
  // behind shops.view, so a 200 here and a 403 for the applicant prove the guard.
  await http('/admin/onboarding/applications?status=OPEN', { token: reviewer.token, expect: 200 });
  pass('reviewer can read the review queue (shops.view)');
  await http('/admin/onboarding/applications?status=OPEN', { token: applicant.token, expect: 403 });
  pass('applicant is refused the review queue → 403');

  // ── an application to hang the documents on ────────────────────────────────
  head('a draft application');
  const categories = await http('/categories', { expect: 200 });
  const category = (Array.isArray(categories.json) ? categories.json : []).find((c) => c.slug === 'grocery')
    ?? (Array.isArray(categories.json) ? categories.json[0] : null);
  if (!category?.id) fail('GET /categories returned no category — has the database been seeded?');
  info(`category ${category.slug} (${category.id})`);

  const shopName = `E2E Verify Pasal ${randomBytes(3).toString('hex')}`;
  const created = await http('/seller/onboarding/applications', {
    method: 'POST',
    token: applicant.token,
    expect: [200, 201],
    body: {
      shopName,
      categoryId: category.id,
      contactPhone: applicantPhone,
      area: 'Baneshwor, Kathmandu',
      fullAddress: 'Ward 10, New Baneshwor, Kathmandu',
      ownerName: 'E2E Verification Owner',
      citizenshipNo: '12-34-56-78901',
      payoutMethod: 'BANK',
      bankName: 'Nabil Bank',
      bankAccountNo: '01234567890123',
      bankAccountName: 'E2E Verification Owner',
      deliveryRadiusKm: 2.5,
      hours: '7am – 9pm',
    },
  });
  const appId = created.json?.id;
  if (!appId) fail(`the application was created without an id: ${json(created.json).slice(0, 300)}`);
  DOC_DIR = join(STORAGE_DIR, 'private', 'shop-applications', appId);
  pass(`application ${created.json.reference} (${appId}) in status ${created.json.status}`);
  info(`documents will land in ${DOC_DIR}`);
  // ── 9 (first half) · submit is refused with no documents ───────────────────
  head('9 · submission refused while the KYC set is missing');
  const bare = await http(`/seller/onboarding/applications/${appId}/submit`, {
    method: 'POST',
    token: applicant.token,
    body: { acceptTerms: true },
    expect: 400,
  });
  const missingNow = [...(bare.json?.missingDocuments ?? [])].sort();
  eq(missingNow, ['BANK_PROOF', 'CITIZENSHIP_BACK', 'CITIZENSHIP_FRONT', 'SHOP_PHOTO'], 'missingDocuments');
  eq(bare.json?.missing ?? [], [], 'missing (typed fields)');
  record('Submit without documents', `400 — missingDocuments ${missingNow.join(', ')}`);

  // ── 4 · a real multipart upload ────────────────────────────────────────────
  head('4 · a real multipart upload');
  const frontBytes = jpegBytes('citizenship-front');
  const uploaded = await uploadDocument(
    applicant.token, appId, 'CITIZENSHIP_FRONT', frontBytes,
    'citizenship front.jpg', 'image/jpeg', [200, 201],
  );
  const frontId = uploaded.json?.id;
  if (!frontId) fail(`the upload returned no document id: ${json(uploaded.json).slice(0, 300)}`);
  eq(uploaded.json.kind, 'CITIZENSHIP_FRONT', 'document.kind');
  eq(uploaded.json.mimeType, 'image/jpeg', 'document.mimeType');
  eq(uploaded.json.sizeBytes, frontBytes.byteLength, 'document.sizeBytes');
  eq(uploaded.json.review, 'PENDING', 'document.review');
  if ('storageKey' in uploaded.json) fail('the response carries storageKey — it must never leave the server');
  pass('the response carries no storageKey');
  record('Upload', `201 for CITIZENSHIP_FRONT, ${frontBytes.byteLength} bytes, sha256:${digest(frontBytes)}`);

  // A file that lies about itself, to prove the three-fact check is live and not
  // only unit-tested: PDF bytes, sent as image/jpeg, named .jpg.
  const liar = await uploadDocument(
    applicant.token, appId, 'OTHER', pdfBytes('liar'),
    'not-really.jpg', 'image/jpeg', 400,
  );
  info(`disguised file refused: ${String(liar.json?.message ?? '').slice(0, 120)}`);
  pass('a PDF sent as image/jpeg is refused (content check is live)');

  // ── 5 · the bytes are on disk ──────────────────────────────────────────────
  head('5 · the object is on disk under the configured storage directory');
  const written = onDisk();
  eq(written.length, 1, 'files in the application directory');
  const storedName = written[0];
  if (!/^[0-9a-f]{32}\.jpg$/.test(storedName)) fail(`unexpected object name ${storedName}`);
  pass(`object name ${storedName} (32 hex + sniffed extension)`);
  if (!bytesOf(storedName).equals(frontBytes)) fail('the bytes on disk differ from the bytes uploaded');
  pass(`bytes on disk are byte-identical (sha256:${digest(bytesOf(storedName))})`);
  record('On disk', join(DOC_DIR, storedName));
  // ── 6 · read it back through the authenticated route ───────────────────────
  head('6 · retrieval through the authenticated route');
  const mine = await http(`/seller/onboarding/applications/${appId}/documents/${frontId}/file`, {
    token: applicant.token,
    expect: 200,
  });
  if (!mine.buf.equals(frontBytes)) fail('the downloaded bytes differ from what was uploaded');
  pass(`downloaded ${mine.buf.byteLength} bytes, identical to the upload`);
  eq(mine.headers.get('content-type'), 'image/jpeg', 'Content-Type');
  const disposition = mine.headers.get('content-disposition') ?? '';
  if (!disposition.startsWith('attachment')) fail(`Content-Disposition is ${json(disposition)}, expected attachment`);
  pass(`Content-Disposition ${json(disposition)}`);
  const cache = mine.headers.get('cache-control') ?? '';
  if (!/no-store/.test(cache) || !/private/.test(cache)) fail(`Cache-Control is ${json(cache)}`);
  pass(`Cache-Control ${json(cache)}`);
  eq(mine.headers.get('x-content-type-options'), 'nosniff', 'X-Content-Type-Options');
  record('Retrieval', `200, ${mine.buf.byteLength} bytes identical, attachment + no-store`);

  // ── 7 · nobody else can read it ────────────────────────────────────────────
  head('7 · authorization');
  const rivalApp = await http('/seller/onboarding/applications', {
    method: 'POST',
    token: rival.token,
    expect: [200, 201],
    body: { shopName: `E2E Rival ${randomBytes(3).toString('hex')}`, area: 'Patan' },
  });
  const rivalAppId = rivalApp.json?.id;
  if (!rivalAppId) fail('could not create the second applicant’s draft');

  await http(`/seller/onboarding/applications/${appId}/documents/${frontId}/file`, {
    token: rival.token,
    expect: 404,
  });
  pass('another applicant, through the owner’s application id → 404');
  await http(`/seller/onboarding/applications/${rivalAppId}/documents/${frontId}/file`, {
    token: rival.token,
    expect: 404,
  });
  pass('another applicant, through their own application id → 404');
  await http(`/seller/onboarding/applications/${appId}/documents/${frontId}/file`, { expect: 401 });
  pass('no credential at all → 401');
  await http(`/admin/onboarding/applications/${appId}/documents/${frontId}/file`, {
    token: applicant.token,
    expect: 403,
  });
  pass('the applicant on the reviewer route → 403 (shops.view enforced)');
  const stillThere = onDisk();
  eq(stillThere.length, 1, 'files still in the directory after the refused reads');
  record('Authorization', 'other applicant 404 (both routes), anonymous 401, reviewer route 403');

  // ── 8 · delete removes the row AND the bytes ───────────────────────────────
  head('8 · delete removes the object, not just the row');
  const removed = await http(`/seller/onboarding/applications/${appId}/documents/${frontId}`, {
    method: 'DELETE',
    token: applicant.token,
    expect: 200,
  });
  eq(removed.json?.id, frontId, 'the deleted document id');
  eq(removed.json?.kind, 'CITIZENSHIP_FRONT', 'the deleted document kind');
  eq(onDisk(), [], 'files left in the application directory');
  pass('the object is gone from disk, not orphaned');
  await http(`/seller/onboarding/applications/${appId}/documents/${frontId}/file`, {
    token: applicant.token,
    expect: 404,
  });
  pass('reading the deleted document → 404');
  const afterDelete = await http(`/seller/onboarding/applications/${appId}`, {
    token: applicant.token,
    expect: 200,
  });
  eq(afterDelete.json?.documents ?? [], [], 'documents on the application');
  record('Delete', `200, row gone, ${join(DOC_DIR, storedName)} gone, subsequent read 404`);

  // ── the full KYC set, uploaded one kind at a time ──────────────────────────
  head('the required document set');
  const bytesByKind = {
    CITIZENSHIP_FRONT: jpegBytes('citizenship-front-2'),
    CITIZENSHIP_BACK: jpegBytes('citizenship-back'),
    SHOP_PHOTO: jpegBytes('shop-front'),
  };
  const docIds = {};
  for (const [kind, bytes] of Object.entries(bytesByKind)) {
    const res = await uploadDocument(
      applicant.token, appId, kind, bytes,
      `${kind.toLowerCase()}.jpg`, 'image/jpeg', [200, 201],
    );
    docIds[kind] = res.json.id;
    if (!findBytes(bytes)) fail(`${kind} was accepted but its bytes are not on disk`);
    pass(`${kind} uploaded and on disk (sha256:${digest(bytes)})`);
  }

  // Still one short: BANK_PROOF is required because payoutMethod is BANK. This is
  // the narrow case — everything present except the payout-dependent document.
  const threeQuarters = await http(`/seller/onboarding/applications/${appId}/submit`, {
    method: 'POST',
    token: applicant.token,
    body: { acceptTerms: true },
    expect: 400,
  });
  eq(threeQuarters.json?.missingDocuments ?? [], ['BANK_PROOF'], 'missingDocuments with only BANK_PROOF short');

  const bankBytes = pdfBytes('bank-statement');
  const bank = await uploadDocument(
    applicant.token, appId, 'BANK_PROOF', bankBytes,
    'bank statement.pdf', 'application/pdf', [200, 201],
  );
  docIds.BANK_PROOF = bank.json.id;
  eq(bank.json.mimeType, 'application/pdf', 'BANK_PROOF mimeType');
  const bankName = findBytes(bankBytes);
  if (!bankName) fail('BANK_PROOF was accepted but its bytes are not on disk');
  if (!/^[0-9a-f]{32}\.pdf$/.test(bankName)) fail(`the PDF was stored as ${bankName}`);
  pass(`BANK_PROOF stored as ${bankName} (extension from the sniffed type)`);
  eq(onDisk().length, 4, 'objects on disk for the complete set');

  // The replacement invariant, at runtime rather than in a unit test: re-taking the
  // shop photo must leave exactly one shop photo, and the superseded bytes must be
  // gone from disk — a replaced KYC scan that lingers is a copy nobody accounts for.
  head('replacing a document leaves no second copy');
  const reshot = jpegBytes('shop-front-retaken');
  const replaced = await uploadDocument(
    applicant.token, appId, 'SHOP_PHOTO', reshot,
    'shop-front-retaken.jpg', 'image/jpeg', [200, 201],
  );
  if (replaced.json.id === docIds.SHOP_PHOTO) fail('the replacement reused the superseded document id');
  docIds.SHOP_PHOTO = replaced.json.id;
  eq(onDisk().length, 4, 'objects on disk after the replacement');
  if (findBytes(bytesByKind.SHOP_PHOTO)) fail('the superseded shop photo is still on disk');
  pass('the superseded object was removed');
  if (!findBytes(reshot)) fail('the replacement bytes are not on disk');
  pass('the replacement bytes are on disk');
  const setNow = await http(`/seller/onboarding/applications/${appId}`, {
    token: applicant.token,
    expect: 200,
  });
  const kinds = (setNow.json?.documents ?? []).map((d) => d.kind).sort();
  eq(kinds, ['BANK_PROOF', 'CITIZENSHIP_BACK', 'CITIZENSHIP_FRONT', 'SHOP_PHOTO'], 'attached kinds');
  eq(setNow.json?.missingDocuments ?? [], [], 'missingDocuments once the set is complete');
  record('Replacement', 'one object per kind kept; superseded bytes deleted from disk');

  // ── 10 · submission succeeds once the set is complete ──────────────────────
  head('10 · submission with the documents attached');
  const submitted = await http(`/seller/onboarding/applications/${appId}/submit`, {
    method: 'POST',
    token: applicant.token,
    body: { acceptTerms: true, note: 'Runtime verification of the document requirement.' },
    expect: [200, 201],
  });
  eq(submitted.json?.status, 'SUBMITTED', 'application status');
  truthy(submitted.json?.terms?.version, 'the seller-terms version recorded server-side');
  truthy(submitted.json?.review?.submittedAt, 'review.submittedAt');
  eq(submitted.json?.missingDocuments ?? [], [], 'missingDocuments after submission');
  record(
    'Submit with documents',
    `200 → SUBMITTED, terms v${submitted.json.terms.version}, 4 documents attached`,
  );

  // A submitted application is a record: it must stop accepting and stop losing
  // documents until a reviewer hands it back.
  await uploadDocument(
    applicant.token, appId, 'OWNER_PHOTO', jpegBytes('too-late'),
    'too-late.jpg', 'image/jpeg', 409,
  );
  pass('uploading to a submitted application → 409');
  await http(`/seller/onboarding/applications/${appId}/documents/${docIds.BANK_PROOF}`, {
    method: 'DELETE',
    token: applicant.token,
    expect: 409,
  });
  pass('deleting from a submitted application → 409');
  eq(onDisk().length, 4, 'objects on disk after the refused writes');

  // ── 11 · the reviewer can open and judge the document ─────────────────────
  head('11 · reviewer access with shops.view / shops.approve');
  const forReview = await http(`/admin/onboarding/applications/${appId}`, {
    token: reviewer.token,
    expect: 200,
  });
  eq(forReview.json?.status, 'SUBMITTED', 'status seen by the reviewer');
  eq((forReview.json?.documents ?? []).length, 4, 'documents visible to the reviewer');
  truthy(forReview.json?.kyc?.citizenshipNo, 'the KYC number the reviewer must check against the scan');
  if ((forReview.json?.documents ?? []).some((d) => 'storageKey' in d)) {
    fail('the reviewer view leaks storageKey');
  }
  pass('the reviewer view carries no storageKey');

  const reviewerCopy = await http(
    `/admin/onboarding/applications/${appId}/documents/${docIds.CITIZENSHIP_FRONT}/file`,
    { token: reviewer.token, expect: 200 },
  );
  if (!reviewerCopy.buf.equals(bytesByKind.CITIZENSHIP_FRONT)) {
    fail('the reviewer received different bytes than the applicant uploaded');
  }
  pass(`reviewer downloaded ${reviewerCopy.buf.byteLength} bytes, identical to the upload`);
  eq(reviewerCopy.headers.get('x-content-type-options'), 'nosniff', 'X-Content-Type-Options');

  // Rejecting has to say why — otherwise the applicant is sent back with nothing
  // to act on. Checked before the accept so the document is left in a clean state.
  await http(`/admin/onboarding/applications/${appId}/documents/${docIds.CITIZENSHIP_BACK}/review`, {
    method: 'POST',
    token: reviewer.token,
    body: { decision: 'REJECTED' },
    expect: 400,
  });
  pass('rejecting a document with no note → 400');
  const accepted = await http(
    `/admin/onboarding/applications/${appId}/documents/${docIds.CITIZENSHIP_FRONT}/review`,
    { method: 'POST', token: reviewer.token, body: { decision: 'ACCEPTED' }, expect: [200, 201] },
  );
  eq(accepted.json?.review, 'ACCEPTED', 'document review state');
  await http(`/admin/onboarding/applications/${appId}/documents/${docIds.CITIZENSHIP_FRONT}/review`, {
    method: 'POST',
    token: applicant.token,
    body: { decision: 'ACCEPTED' },
    expect: 403,
  });
  pass('the applicant cannot record a verdict → 403 (shops.approve enforced)');
  record(
    'Reviewer access',
    'application 200, document bytes identical, ACCEPTED recorded; applicant 403 on both admin routes',
  );

  // ── 12 · approval still enforces the document floor ───────────────────────
  head('12 · approval with the document requirement');
  const claimed = await http(`/admin/onboarding/applications/${appId}/claim`, {
    method: 'POST',
    token: reviewer.token,
    expect: [200, 201],
  });
  eq(claimed.json?.status, 'UNDER_REVIEW', 'status after claim');

  // Reject one document and try to approve anyway. This is the case the second
  // gate exists for: everything is attached, but one attachment is unusable.
  const rejectedDoc = await http(
    `/admin/onboarding/applications/${appId}/documents/${docIds.SHOP_PHOTO}/review`,
    {
      method: 'POST',
      token: reviewer.token,
      body: { decision: 'REJECTED', note: 'The shopfront sign is not readable.' },
      expect: [200, 201],
    },
  );
  eq(rejectedDoc.json?.review, 'REJECTED', 'shop photo review state');
  const blocked = await http(`/admin/onboarding/applications/${appId}/approve`, {
    method: 'POST',
    token: reviewer.token,
    body: {},
    expect: 400,
  });
  eq(blocked.json?.missingDocuments ?? [], ['SHOP_PHOTO'], 'missingDocuments blocking approval');
  pass('approval is refused while a required document is rejected');

  const handedBack = await http(`/admin/onboarding/applications/${appId}/request-changes`, {
    method: 'POST',
    token: reviewer.token,
    body: { note: 'Please send a clearer photo of the shopfront.', fields: [] },
    expect: [200, 201],
  });
  eq(handedBack.json?.status, 'CHANGES_REQUESTED', 'status after request-changes');

  const clearer = jpegBytes('shop-front-clear');
  const fixed = await uploadDocument(
    applicant.token, appId, 'SHOP_PHOTO', clearer,
    'shop-front-clear.jpg', 'image/jpeg', [200, 201],
  );
  eq(fixed.json?.review, 'PENDING', 'the replacement starts unreviewed');
  docIds.SHOP_PHOTO = fixed.json.id;
  eq(onDisk().length, 4, 'objects on disk after the fix');
  if (findBytes(reshot)) fail('the rejected shop photo is still on disk');
  pass('the rejected object was replaced, not accumulated');

  const resubmitted = await http(`/seller/onboarding/applications/${appId}/submit`, {
    method: 'POST',
    token: applicant.token,
    body: { acceptTerms: true },
    expect: [200, 201],
  });
  eq(resubmitted.json?.status, 'SUBMITTED', 'status after resubmission');
  eq(resubmitted.json?.review?.submitCount, 2, 'submitCount');

  const approved = await http(`/admin/onboarding/applications/${appId}/approve`, {
    method: 'POST',
    token: reviewer.token,
    body: { note: 'Welcome to GoPasal.' },
    expect: [200, 201],
  });
  eq(approved.json?.status, 'APPROVED', 'status after approval');
  truthy(approved.json?.shop?.id, 'the shop created by the approval');
  truthy(approved.json?.shop?.slug, 'the shop slug');
  eq((approved.json?.documents ?? []).length, 4, 'documents kept on the approved application');
  eq(onDisk().length, 4, 'objects still on disk after approval');

  // Approving twice is a retry, not a second shop.
  const again = await http(`/admin/onboarding/applications/${appId}/approve`, {
    method: 'POST',
    token: reviewer.token,
    body: {},
    expect: [200, 201],
  });
  eq(again.json?.shop?.id, approved.json.shop.id, 'the shop id on a repeated approval');
  pass('approval is idempotent — no second shop');
  await uploadDocument(
    applicant.token, appId, 'OTHER', jpegBytes('after-approval'),
    'after-approval.jpg', 'image/jpeg', 409,
  );
  pass('uploading to an approved application → 409');
  record(
    'Approval',
    `200 → APPROVED, shop ${approved.json.shop.slug} (${approved.json.shop.id}); ` +
      'refused first while a document was rejected; idempotent on retry',
  );

  // ── what this run left behind ──────────────────────────────────────────────
  head('what this run left behind');
  info(`application ${created.json.reference} (${appId}) — status APPROVED`);
  info(`shop ${approved.json.shop.slug} (${approved.json.shop.id}), owner ${applicantPhone}`);
  info(`users ${applicantPhone} and ${rivalPhone}`);
  info(`${onDisk().length} objects under ${DOC_DIR}`);
  info('nothing was deleted from the database; remove the rows yourself if you want a clean queue');

  // ── report ─────────────────────────────────────────────────────────────────
  head('report');
  const width = Math.max(...[...REPORT.keys()].map((k) => k.length));
  for (const [label, line] of REPORT) say(`  ${C.c}${label.padEnd(width)}${C.x}  ${line}`);
  say();
  say(`  ${C.g}every check passed against the API running at ${BASE}${C.x}`);
}
/**
 * Stop the API we started, politely first. `--use-running` started nothing, so
 * there is nothing to stop — the developer's own process is left alone. The
 * containers are left running too: stopping them here would surprise anyone who
 * had them up before, and `pnpm db:up` is idempotent anyway.
 *
 * Returns whether SIGINT alone was enough. That answer is a check, not a detail:
 * see the end of the file.
 */
async function shutdown() {
  if (OUTBOX === OUTBOX_DEFAULT && existsSync(OUTBOX)) unlinkSync(OUTBOX);
  if (!api || stopping) return true;
  stopping = true;
  const startedAt = Date.now();
  api.kill('SIGINT');
  for (let i = 0; i < 50 && api.exitCode === null; i++) await sleep(200);
  const took = Date.now() - startedAt;
  if (api.exitCode === null) {
    warn(`the API did not exit on SIGINT within ${took}ms — sending SIGKILL`);
    api.kill('SIGKILL');
    return false;
  }
  info(`API stopped on SIGINT in ${took}ms (exit ${api.exitCode})`);
  return true;
}

process.once('SIGINT', () => {
  void shutdown().then(() => process.exit(130));
});

let exitCode = 0;
try {
  await main();
} catch (err) {
  exitCode = 1;
  say(`\n  ${C.r}✘ ${err instanceof Failure ? err.message : (err?.stack ?? String(err))}${C.x}`);
  if (api && apiLog !== '') {
    say(`\n${C.d}── last lines of the API log ─────────────────────────────${C.x}`);
    say(apiTail(60));
  }
  if (REPORT.size > 0) {
    head('what had already passed when it failed');
    for (const [label, line] of REPORT) say(`  ${C.c}${label}${C.x}  ${line}`);
  }
} finally {
  const stoppedPolitely = await shutdown();
  // Refusing to stop is a defect like any other, so it is the last check of the
  // run rather than a warning nobody reads. A process that has to be SIGKILLed
  // abandons whatever its shutdown hooks were doing — open transactions, queue
  // connections, in-flight writes — and forces every operator, container runtime
  // and CI job to escalate to force.
  if (!stoppedPolitely) {
    exitCode = 1;
    say(
      `\n  ${C.r}✘ the API had to be SIGKILLed — exiting on SIGINT is part of the contract${C.x}`,
    );
  }
}
process.exit(exitCode);

#!/usr/bin/env node
/**
 * pg-probe.mjs — ask "what is actually listening on this host:port?" using only
 * Node's standard library, for machines that have neither psql nor lsof nor ss.
 *
 * It speaks just enough of the PostgreSQL v3 frontend protocol to classify the
 * peer without needing valid credentials:
 *
 *   - nothing listening            -> ECONNREFUSED
 *   - not PostgreSQL               -> no 'S'/'N' answer to an SSLRequest
 *   - PostgreSQL, asks for a secret-> AuthenticationSASL / MD5 / cleartext
 *   - PostgreSQL, refuses outright -> ErrorResponse, printed verbatim
 *
 * That last case is the useful one: a foreign PostgreSQL occupying the port will
 * often name itself in the error ("no pg_hba.conf entry for host ...", or a
 * data-directory path that is not the container's).
 *
 * Usage: node scripts/pg-probe.mjs [host] [port] [user] [database]
 * With no arguments it targets whatever apps/api/.env's DATABASE_URL points at,
 * so `pnpm db:probe` answers "what is at the address my app actually dials?".
 * Pass arguments to inspect something else, e.g. the squatter on the default port:
 *   node scripts/pg-probe.mjs localhost 5432
 * Exit:  0 = a PostgreSQL server answered, 1 = it did not.
 */
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Defaults come from apps/api/.env so the probe follows the app, not a guess. */
function defaultsFromEnvFile() {
  const fallback = { host: 'localhost', port: '5432', user: 'postgres', database: 'postgres' };
  try {
    const envPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'apps',
      'api',
      '.env',
    );
    const line = fs
      .readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .filter((l) => /^\s*DATABASE_URL=/.test(l))
      .pop();
    if (!line) return fallback;
    const url = new URL(line.replace(/^\s*DATABASE_URL=/, '').replace(/^["']|["']$/g, ''));
    return {
      host: url.hostname || fallback.host,
      port: url.port || '5432',
      user: decodeURIComponent(url.username) || fallback.user,
      database: url.pathname.replace(/^\//, '') || fallback.database,
    };
  } catch {
    return fallback;
  }
}

const DEF = defaultsFromEnvFile();
const [host = DEF.host, port = DEF.port, user = DEF.user, database = DEF.database] =
  process.argv.slice(2);

const AUTH = {
  0: 'AuthenticationOk (no password required — trust)',
  2: 'KerberosV5',
  3: 'cleartext password',
  5: 'MD5 password',
  7: 'GSSAPI',
  10: 'SASL / SCRAM-SHA-256',
  12: 'SASLFinal',
};
const ERR_FIELD = { S: 'severity', C: 'sqlstate', M: 'message', D: 'detail', H: 'hint', F: 'file' };

function connect(timeout = 4000) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host, port: Number(port) });
    sock.setTimeout(timeout);
    sock.once('connect', () => resolve(sock));
    sock.once('timeout', () => { sock.destroy(); reject(new Error('timed out')); });
    sock.once('error', reject);
  });
}

/** Read one protocol message: 1 type byte + Int32 length + payload. */
function readMessage(sock, timeout = 4000) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const done = (v) => { sock.removeAllListeners('data'); resolve(v); };
    sock.setTimeout(timeout);
    sock.once('timeout', () => { sock.destroy(); reject(new Error('timed out waiting for a reply')); });
    sock.once('error', reject);
    sock.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (buf.length < 5) return;
      const len = buf.readInt32BE(1);
      if (buf.length < len + 1) return;
      done({ type: String.fromCharCode(buf[0]), body: buf.subarray(5, len + 1) });
    });
  });
}

function startupMessage() {
  const params = [['user', user], ['database', database], ['application_name', 'gopasal-db-doctor']];
  const parts = [];
  for (const [k, v] of params) parts.push(Buffer.from(`${k}\0${v}\0`, 'utf8'));
  parts.push(Buffer.from([0]));
  const payload = Buffer.concat(parts);
  const msg = Buffer.alloc(8 + payload.length);
  msg.writeInt32BE(msg.length, 0);
  msg.writeInt32BE(196608, 4); // protocol 3.0
  payload.copy(msg, 8);
  return msg;
}

function parseError(body) {
  const out = {};
  let i = 0;
  while (i < body.length && body[i] !== 0) {
    const code = String.fromCharCode(body[i]);
    const end = body.indexOf(0, i + 1);
    out[ERR_FIELD[code] ?? code] = body.subarray(i + 1, end).toString('utf8');
    i = end + 1;
  }
  return out;
}

try {
  // 1. Is it PostgreSQL at all? SSLRequest gets a single-byte S/N from any pg.
  const ssl = await connect();
  const req = Buffer.alloc(8);
  req.writeInt32BE(8, 0);
  req.writeInt32BE(80877103, 4);
  ssl.write(req);
  const answer = await new Promise((res, rej) => {
    ssl.once('data', (d) => res(String.fromCharCode(d[0])));
    ssl.once('error', rej);
    ssl.once('timeout', () => rej(new Error('timed out')));
  });
  ssl.destroy();
  if (answer !== 'S' && answer !== 'N') {
    console.log(`peer on ${host}:${port} is NOT a PostgreSQL server (replied 0x${answer.charCodeAt(0).toString(16)})`);
    process.exit(1);
  }
  console.log(`PostgreSQL server present on ${host}:${port} (SSL ${answer === 'S' ? 'supported' : 'not supported'})`);

  // 2. What does it say when asked for this user/database?
  const sock = await connect();
  sock.write(startupMessage());
  const msg = await readMessage(sock);
  if (msg.type === 'R') {
    const code = msg.body.readInt32BE(0);
    console.log(`startup as "${user}"/"${database}" -> asks for: ${AUTH[code] ?? `auth code ${code}`}`);
    console.log('  => the port is reachable and this server is willing to authenticate.');
    console.log('     If your app still fails against it, this is probably not GoPasal’s');
    console.log('     container. Check that `pnpm db:ports` publishes the same host port that');
    console.log('     apps/api/.env DATABASE_URL dials — a foreign PostgreSQL reports the');
    console.log('     missing "gopasal" role as "password authentication failed".');
  } else if (msg.type === 'E') {
    const e = parseError(msg.body);
    console.log(`startup as "${user}"/"${database}" -> ErrorResponse`);
    for (const [k, v] of Object.entries(e)) console.log(`  ${k}: ${v}`);
  } else {
    console.log(`startup as "${user}"/"${database}" -> unexpected message type '${msg.type}'`);
  }
  sock.destroy();
  process.exit(0);
} catch (err) {
  const code = err && typeof err === 'object' && 'code' in err ? err.code : '';
  if (code === 'ECONNREFUSED') console.log(`nothing is listening on ${host}:${port} (ECONNREFUSED)`);
  else console.log(`probe failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

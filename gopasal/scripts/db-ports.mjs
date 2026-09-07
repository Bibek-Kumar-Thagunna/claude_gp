#!/usr/bin/env node
/**
 * db-ports.mjs — the HOST ports GoPasal publishes: resolve them, prove they are
 * bindable, and move them in both places at once.
 *
 * Why this exists. Docker does not test a port, it binds it, and a failed bind
 * aborts the entire `docker compose up` — leaving the sibling container in
 * `created` state, which then reads as "the container is not running" instead of
 * "the port was taken". Meanwhile the app, still dialling the old port, reaches
 * whatever else is listening there; a foreign PostgreSQL reports the absent
 * 'gopasal' role as "password authentication failed", so a port collision
 * masquerades as a credential problem. This script settles the question first,
 * using the only test that is authoritative: attempting the bind itself.
 *
 * Modes:
 *   check                     resolve the configured host ports, bind-test them,
 *                             identify whatever occupies one, and report drift
 *                             between docker-compose.yml and apps/api/.env
 *   find                      suggest the first bindable pair
 *   set <pgPort> <redisPort>  write ./.env (which docker compose reads) AND
 *                             apps/api/.env together, so they cannot drift
 *   print <postgres|redis>    "<addr> <port>" for scripts (used by db-doctor.sh)
 *
 * Nothing here starts, stops or modifies any service, container or volume.
 * Exit: 0 = fine, 1 = a port is taken or the two files disagree.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE = path.join(ROOT, 'docker-compose.yml');
const ROOT_ENV = path.join(ROOT, '.env'); // docker compose loads this automatically
const API_ENV = path.join(ROOT, 'apps', 'api', '.env');

/**
 * Container-internal ports are fixed; only the host side is negotiable.
 *
 * `optional: true` marks a service that is not part of the default stack (MinIO
 * only starts with `--profile s3`). Optional services are bind-tested and
 * drift-checked by `check`, but `find`/`set` leave them alone — those two write
 * apps/api/.env, and the only ports that file must agree on to function are the
 * database and Redis.
 */
const SERVICES = {
  postgres: { container: 5432, variable: 'POSTGRES_HOST_PORT', preferred: 15432, name: 'PostgreSQL' },
  redis: { container: 6379, variable: 'REDIS_HOST_PORT', preferred: 6380, name: 'Redis' },
  minio: {
    container: 9000,
    variable: 'MINIO_API_HOST_PORT',
    preferred: 19000,
    name: 'MinIO S3 API',
    optional: true,
  },
};

const read = (p) => {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return '';
  }
};

/** Parse KEY=value pairs, ignoring comments — used for ./.env and apps/api/.env. */
function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

/** Compose precedence: a real shell variable beats ./.env, which beats the default. */
function composeEnv() {
  return { ...parseEnv(read(ROOT_ENV)), ...process.env };
}

/** Expand ${VAR} and ${VAR:-default} exactly as compose does. */
function expand(str, env) {
  return str.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (_, name, def) => {
    const v = env[name];
    return v !== undefined && v !== '' ? v : (def ?? '');
  });
}

/**
 * What docker-compose.yml will actually publish for a container port.
 * The mapping's host side is "port", "addr:port", and either part may be a
 * substitution — so expand first, THEN split, because "${VAR:-15432}" itself
 * contains a colon and would otherwise be cut in half.
 */
function composeMapping(containerPort) {
  const re = new RegExp(`^\\s*-\\s*"?([^"\\s]*):${containerPort}"?\\s*$`, 'm');
  const m = re.exec(read(COMPOSE));
  if (!m) return null;
  let hostSide = expand(m[1], composeEnv());
  let addr = '0.0.0.0'; // Docker's own default when no address is given
  const cut = hostSide.lastIndexOf(':');
  if (cut !== -1) {
    addr = hostSide.slice(0, cut);
    hostSide = hostSide.slice(cut + 1);
  }
  return /^\d+$/.test(hostSide) ? { addr, port: Number(hostSide) } : null;
}

/** What the application dials, which is the number that has to match. */
function appPorts() {
  const env = parseEnv(read(API_ENV));
  let pg = null;
  const url = env.DATABASE_URL;
  if (url) {
    const m = /^[^:]+:\/\/[^@]*@([^:/?]+):(\d+)\//.exec(url);
    if (m) pg = { host: m[1], port: Number(m[2]) };
  }
  const redis = env.REDIS_PORT
    ? { host: env.REDIS_HOST || 'localhost', port: Number(env.REDIS_PORT) }
    : null;
  // S3_ENDPOINT is only load-bearing when storage is actually pointed at S3;
  // with the default STORAGE_PROVIDER=local nothing dials MinIO at all.
  let minio = null;
  if (env.S3_ENDPOINT) {
    const m = /^https?:\/\/([^:/]+)(?::(\d+))?/.exec(env.S3_ENDPOINT);
    if (m) minio = { host: m[1], port: Number(m[2] ?? 80), used: env.STORAGE_PROVIDER === 's3' };
  }
  return { pg, redis, minio };
}

/**
 * The authoritative test: try to bind it, which is what the Docker daemon does.
 * A listener on 0.0.0.0:P also blocks 127.0.0.1:P, so this catches both.
 */
function bindTest(addr, port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', (err) => resolve({ free: false, code: err.code || 'EADDRINUSE' }));
    srv.listen({ host: addr, port, exclusive: true }, () =>
      srv.close(() => resolve({ free: true, code: '' })),
    );
  });
}

/** Name the occupant well enough to know whether it is ours: ask it to speak. */
function identify(host, port, kind) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: host === '0.0.0.0' ? '127.0.0.1' : host, port });
    const finish = (label) => {
      sock.destroy();
      resolve(label);
    };
    sock.setTimeout(2500);
    sock.once('timeout', () => finish('listening, but silent (not PostgreSQL, not Redis)'));
    sock.once('error', () => resolve('could not connect to ask what it is'));
    sock.once('connect', () => {
      if (kind === 'postgres') {
        const req = Buffer.alloc(8);
        req.writeInt32BE(8, 0);
        req.writeInt32BE(80877103, 4); // SSLRequest
        sock.write(req);
      } else if (kind === 'minio') {
        // Anything on an S3 endpoint speaks HTTP; MinIO identifies itself in a
        // Server: header, so one HEAD is enough to tell "ours" from "someone's".
        sock.write('HEAD /minio/health/live HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n');
      } else {
        sock.write('PING\r\n');
      }
    });
    sock.once('data', (d) => {
      const txt = d.toString('latin1');
      if (kind === 'postgres') {
        const c = txt[0];
        if (c === 'S' || c === 'N') {
          finish(`a PostgreSQL server (SSL ${c === 'S' ? 'supported' : 'not supported'})`);
        } else finish('something that is NOT PostgreSQL');
      } else if (kind === 'minio') {
        if (/^HTTP\/1\.[01]/.test(txt)) {
          finish(/MinIO/i.test(txt) ? 'a MinIO server' : 'an HTTP server that is NOT MinIO');
        } else finish('something that does not speak HTTP');
      } else if (/^\+PONG/.test(txt) || /^-NOAUTH|^-ERR/.test(txt)) {
        finish('a Redis server');
      } else finish('something that is NOT Redis');
    });
  });
}

/** Is the port held by GoPasal's own container? Then "in use" is expected. */
function ownContainerOn(port) {
  try {
    const out = execFileSync('docker', ['ps', '--format', '{{.Names}} {{.Ports}}'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out
      .split(/\r?\n/)
      .filter((l) => /^gopasal-/.test(l) && new RegExp(`:${port}->`).test(l))
      .map((l) => l.split(' ')[0])[0];
  } catch {
    return undefined; // no docker, or daemon down — not this script's problem
  }
}

const ok = (s) => console.log(`    ✔ ${s}`);
const bad = (s) => console.log(`    x ${s}`);
const note = (s) => console.log(`      ${s}`);

async function cmdCheck() {
  let problems = 0;
  const app = appPorts();
  console.log('\nGoPasal host ports — resolved from docker-compose.yml, then bind-tested:\n');

  for (const [svc, def] of Object.entries(SERVICES)) {
    const map = composeMapping(def.container);
    if (!map) {
      console.log(`  ${def.name}`);
      bad(`no mapping ending in :${def.container} found in docker-compose.yml`);
      problems++;
      continue;
    }
    // An optional service that the app is not configured to use is reported, not
    // judged: a taken port only matters to someone who runs `--profile s3`.
    const inUse = def.optional ? Boolean(app.minio?.used) : true;
    const counts = (n) => {
      if (inUse) problems += n;
    };
    console.log(
      `  ${def.name} — host ${map.addr}:${map.port} -> container ${def.container}` +
        (def.optional ? (inUse ? '  [profile s3, in use]' : '  [profile s3, not in use]') : ''),
    );

    const held = ownContainerOn(map.port);
    const b = await bindTest(map.addr, map.port);
    if (b.free) {
      ok(`bindable: 'docker compose up' can publish ${map.addr}:${map.port}`);
    } else if (held) {
      ok(`already published by GoPasal's own container '${held}' — expected while the stack is up`);
    } else {
      counts(1);
      bad(`NOT bindable (${b.code}) — 'docker compose up' will fail on this port`);
      note(`occupant: ${await identify(map.addr, map.port, svc)}`);
      if (def.optional) {
        note(`Set ${def.variable} in ./.env to a free port and update S3_ENDPOINT in apps/api/.env.`);
      } else {
        note('Nothing needs to be stopped. Take a different host port instead:');
        note('    pnpm db:portfind        # suggests a bindable pair');
        note('    pnpm db:setports <postgres> <redis>   # updates ./.env and apps/api/.env');
      }
    }

    // Drift between what compose publishes and what the app dials is the whole
    // reason a wrong-server connection is possible, so it is an error, not a note.
    const want = svc === 'postgres' ? app.pg : svc === 'redis' ? app.redis : app.minio;
    if (!want) {
      if (def.optional) {
        note('apps/api/.env has no S3_ENDPOINT — storage is on the local disk provider');
      } else {
        bad(`apps/api/.env does not define the ${def.name} port`);
        problems++;
      }
    } else if (want.port !== map.port) {
      counts(1);
      bad(`apps/api/.env dials ${want.host}:${want.port} but compose publishes ${map.port}`);
      note('PORT DRIFT — this is how you end up authenticating against a different server.');
      if (def.optional) {
        note(`    set ${def.variable}=${want.port} in ./.env, or point S3_ENDPOINT at ${map.port}`);
      } else {
        note(`    pnpm db:setports ${svc === 'postgres' ? `${map.port} <redis>` : `<postgres> ${map.port}`}`);
      }
    } else {
      ok(`apps/api/.env agrees: ${want.host}:${want.port}`);
    }
    console.log('');
  }
  return problems;
}

/**
 * Candidates stay below 32768: the Linux ephemeral range starts there, so a
 * high port can be stolen intermittently by an outgoing connection — the worst
 * kind of bug to debug. Steps of 1 from the preferred value, which is already
 * chosen to sit away from the 5432/5433/5434… run that native clusters use.
 */
function candidates(preferred) {
  const list = [];
  for (let i = 0; i <= 60; i++) list.push(preferred + i);
  return list.filter((p) => p >= 1024 && p <= 32767);
}

async function cmdFind() {
  const chosen = {};
  console.log('\nLooking for host ports this machine will actually let Docker bind:\n');
  for (const [svc, def] of Object.entries(SERVICES)) {
    if (def.optional) continue; // `find`/`set` only move the two ports apps/api/.env needs
    const map = composeMapping(def.container);
    const addr = map ? map.addr : '127.0.0.1';
    let picked = null;
    for (const p of candidates(map ? map.port : def.preferred)) {
      const held = ownContainerOn(p);
      const b = await bindTest(addr, p);
      if (b.free || held) {
        picked = p;
        console.log(`  ${def.name}: ${addr}:${p}${held ? ` (already GoPasal's '${held}')` : ''}`);
        break;
      }
    }
    if (!picked) {
      console.log(`  ${def.name}: nothing free in the scanned range — widen it by hand`);
      return 1;
    }
    chosen[svc] = picked;
  }
  console.log(`\nApply both in one step (updates ./.env and apps/api/.env together):\n`);
  console.log(`    pnpm db:setports ${chosen.postgres} ${chosen.redis}\n`);
  return 0;
}

/** ./.env is what `docker compose` itself reads; it holds ports, never secrets. */
function upsertRootEnv(pairs) {
  let text = read(ROOT_ENV);
  if (!text.trim()) {
    text =
      '# Host port overrides for docker-compose.yml. Read automatically by\n' +
      '# `docker compose` because this directory is the compose project root.\n' +
      '# Written by `pnpm db:setports`. Ports only — no secrets belong here.\n';
  }
  for (const [k, v] of pairs) {
    const re = new RegExp(`^[ \\t]*${k}=.*$`, 'm');
    text = re.test(text)
      ? text.replace(re, `${k}=${v}`)
      : `${text.replace(/\n*$/, '\n')}${k}=${v}\n`;
  }
  fs.writeFileSync(ROOT_ENV, text.replace(/\n*$/, '\n'), 'utf8');
}

/**
 * Only the port inside DATABASE_URL and the REDIS_PORT value change. Credentials,
 * database name, host and every other line are left exactly as they are — this
 * script has no business touching them.
 */
function rewriteApiEnv(pg, redis) {
  const text = read(API_ENV);
  if (!text) throw new Error('apps/api/.env not found — copy apps/api/.env.example to it first');
  let out = text.replace(/^([ \t]*DATABASE_URL=[^:\s]+:\/\/[^@\n]*@[^:/\n]+):\d+\//m, `$1:${pg}/`);
  if (out === text) throw new Error('could not find a DATABASE_URL with a port in apps/api/.env');
  const before = out;
  out = out.replace(/^([ \t]*REDIS_PORT=)\d+/m, `$1${redis}`);
  if (out === before) throw new Error('could not find REDIS_PORT in apps/api/.env');
  fs.writeFileSync(API_ENV, out, 'utf8');
}

async function cmdSet(args) {
  const force = args.includes('--force');
  const [pg, redis] = args.filter((a) => !a.startsWith('--')).map(Number);
  if (!Number.isInteger(pg) || !Number.isInteger(redis)) {
    console.error('usage: pnpm db:setports <postgres-host-port> <redis-host-port> [--force]');
    return 2;
  }
  for (const p of [pg, redis]) {
    if (p < 1024 || p > 65535) {
      console.error(`port ${p} is out of range (1024-65535)`);
      return 2;
    }
    if (p >= 32768) {
      console.error(
        `refusing ${p}: it is inside the ephemeral port range, where an outgoing\n` +
          'connection can take it from under you intermittently. Pick something below 32768.',
      );
      return 2;
    }
  }
  for (const [svc, p] of [['postgres', pg], ['redis', redis]]) {
    const held = ownContainerOn(p);
    const b = await bindTest('127.0.0.1', p);
    if (!b.free && !held && !force) {
      console.error(`\nrefusing to set ${svc} to ${p}: ${b.code} — that port is already taken by`);
      console.error(`${await identify('127.0.0.1', p, svc)}. Run 'pnpm db:portfind', or --force.\n`);
      return 1;
    }
  }
  // apps/api/.env first: if its shape is unexpected this throws, and ./.env has
  // not been changed yet — a half-applied pair is exactly the drift to avoid.
  try {
    rewriteApiEnv(pg, redis);
  } catch (err) {
    console.error(`\n  ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
  upsertRootEnv([['POSTGRES_HOST_PORT', pg], ['REDIS_HOST_PORT', redis]]);
  console.log(`\n  ./.env          POSTGRES_HOST_PORT=${pg}  REDIS_HOST_PORT=${redis}`);
  console.log(`  apps/api/.env   DATABASE_URL port -> ${pg}, REDIS_PORT -> ${redis}`);
  console.log('\n  Credentials, database name and the Prisma schema were not touched.');
  console.log('  Now recreate the two containers so they pick up the new mapping:\n');
  console.log('      pnpm db:down && pnpm db:up      # volumes are preserved (no -v)');
  console.log('      pnpm db:ports\n');
  return 0;
}

/** Machine-readable, for db-doctor.sh: "<addr> <port>" or nothing at all. */
function cmdPrint(which) {
  const def = SERVICES[which];
  if (!def) return 2;
  const map = composeMapping(def.container);
  if (!map) return 1;
  console.log(`${map.addr} ${map.port}`);
  return 0;
}

const [mode = 'check', ...rest] = process.argv.slice(2);
let code = 0;
switch (mode) {
  case 'check':
    code = await cmdCheck();
    if (code === 0) console.log('  Both host ports are consistent and available.\n');
    break;
  case 'find':
    code = await cmdFind();
    break;
  case 'set':
    code = await cmdSet(rest);
    break;
  case 'print':
    code = cmdPrint(rest[0]);
    break;
  default:
    console.error(
      'usage: node scripts/db-ports.mjs [check | find | set <pg> <redis> | print <postgres|redis>]',
    );
    code = 2;
}
process.exit(code);

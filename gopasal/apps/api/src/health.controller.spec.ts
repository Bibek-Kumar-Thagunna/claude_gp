import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

function controller(dbUp: boolean, cacheUp: boolean, scannerUp = true): HealthController {
  const prisma = { $queryRaw: () => dbUp ? Promise.resolve([1]) : Promise.reject(new Error('db down')) };
  const redis = { client: { ping: () => cacheUp ? Promise.resolve('PONG') : Promise.reject(new Error('cache down')) } };
  return new HealthController(prisma as never, redis as never, { ready: () => Promise.resolve(scannerUp) } as never);
}

describe('health probes', () => {
  it('keeps liveness independent of external dependencies', () => {
    assert.equal(controller(false, false).live().status, 'ok');
  });

  it('reports readiness only when both dependencies answer', async () => {
    const result = await controller(true, true).ready();
    assert.deepEqual({ status: result.status, db: result.db, cache: result.cache, scanner: result.scanner }, { status: 'ok', db: 'up', cache: 'up', scanner: 'up' });
  });

  it('throws HTTP 503 readiness details when a dependency fails', async () => {
    await assert.rejects(
      () => controller(false, true).ready(),
      (error: ServiceUnavailableException) => {
        assert.equal(error.getStatus(), 503);
        assert.deepEqual(error.getResponse(), { status: 'degraded', db: 'down', cache: 'up', scanner: 'up', timestamp: (error.getResponse() as { timestamp: string }).timestamp });
        return true;
      },
    );
  });

  it('retains the legacy probe as a readiness alias', async () => {
    await assert.rejects(() => controller(true, false).check(), ServiceUnavailableException);
  });

  it('does not mark a deployment ready when file screening is unavailable', async () => {
    await assert.rejects(() => controller(true, true, false).ready(), ServiceUnavailableException);
  });

  it('labels a local opt-out as disabled rather than pretending it is screened', async () => {
    const prisma = { $queryRaw: () => Promise.resolve([1]) };
    const redis = { client: { ping: () => Promise.resolve('PONG') } };
    const health = new HealthController(prisma as never, redis as never, { name: 'disabled', ready: () => Promise.resolve(true) } as never);
    const result = await health.ready();
    assert.equal(result.status, 'ok');
    assert.equal(result.scanner, 'disabled');
  });
});

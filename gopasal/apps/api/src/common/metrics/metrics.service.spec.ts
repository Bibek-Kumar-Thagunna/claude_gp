import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AppConfig } from '../../config/configuration';
import type { NotificationQueue } from '../../modules/notifications/notification.queue';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import { metricRoute } from './metrics.interceptor';
import { MetricsService } from './metrics.service';

describe('production metrics', () => {
  it('uses route templates rather than IDs or query strings as labels', () => {
    assert.equal(metricRoute({ baseUrl: '', route: { path: '/api/v1/orders/:id' } } as Request), '/api/v1/orders/:id');
    assert.equal(metricRoute({ baseUrl: '/api/v1', route: { path: '/orders/:id' } } as Request), '/api/v1/orders/:id');
    assert.equal(metricRoute({ baseUrl: '', originalUrl: '/orders/secret-id?phone=9800' } as Request), 'unmatched');
  });

  it('exports bounded HTTP, dependency, queue and business gauges', async () => {
    const config = {
      get(key: string) {
        if (key === 'metrics') return { enabled: false, host: '127.0.0.1', port: 9464 };
        if (key === 'env') return 'test';
        throw new Error(`unexpected config key ${key}`);
      },
    } as unknown as ConfigService<AppConfig, true>;
    const group = (status: string, count: number) => [{ status, _count: { _all: count } }];
    const prisma = {
      order: { groupBy: () => Promise.resolve(group('PLACED', 3)) },
      paymentIntent: { groupBy: () => Promise.resolve(group('PENDING', 2)) },
      refund: { groupBy: () => Promise.resolve(group('FAILED', 1)) },
      dispute: { groupBy: () => Promise.resolve(group('OPEN', 4)) },
      settlement: { groupBy: () => Promise.resolve(group('OPEN', 5)) },
      shopApplication: { groupBy: () => Promise.resolve(group('SUBMITTED', 6)) },
    } as unknown as PrismaService;
    const redis = { client: { ping: () => Promise.resolve('PONG') } } as unknown as RedisService;
    const queue = {
      counts: () => Promise.resolve({ waiting: 7, active: 1, delayed: 2, failed: 0 }),
    } as unknown as NotificationQueue;
    const service = new MetricsService(config, prisma, redis, queue);

    const finish = service.requestStarted('get');
    finish();
    service.recordCompleted('get', '/api/v1/orders/:id', 200, 0.125);
    const metrics = await service.render();

    assert.match(metrics, /gopasal_http_requests_total\{[^\n]*method="GET"[^\n]*route="\/api\/v1\/orders\/:id"[^\n]*status_code="200"[^\n]*\} 1/);
    assert.match(metrics, /gopasal_dependency_up\{[^\n]*dependency="postgres"[^\n]*\} 1/);
    assert.match(metrics, /gopasal_queue_jobs\{[^\n]*queue="notifications"[^\n]*state="waiting"[^\n]*\} 7/);
    assert.match(metrics, /gopasal_business_records\{[^\n]*entity="refund"[^\n]*state="failed"[^\n]*\} 1/);
    assert.doesNotMatch(metrics, /secret-id|phone=9800/);
  });
});

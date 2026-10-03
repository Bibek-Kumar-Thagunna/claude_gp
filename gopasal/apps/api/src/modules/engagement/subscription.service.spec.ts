import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../../common/prisma/prisma.service';
import { SubscriptionService } from './subscription.service';

describe('Gold enrollment', () => {
  it('never grants a paid membership without verified billing', async () => {
    let writes = 0;
    const prisma = {
      subscription: { upsert: () => { writes += 1; return Promise.resolve({}); } },
    } as unknown as PrismaService;
    const service = new SubscriptionService(prisma);
    await assert.rejects(service.subscribe('customer', 'gold'), ServiceUnavailableException);
    assert.equal(writes, 0);
  });
});

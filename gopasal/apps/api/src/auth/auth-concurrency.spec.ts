import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { RedisService } from '../common/redis/redis.service';
import type { RbacService } from '../rbac/rbac.service';
import type { AppConfig } from '../config/configuration';
import type { SmsProvider } from './sms.provider';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

describe('authentication concurrency guarantees', () => {
  it('consumes a valid OTP exactly once under concurrent verification', async () => {
    const challenge = {
      id: 'otp_1',
      identifier: '9800000001',
      purpose: 'login',
      codeHash: await argon2.hash('123456'),
      attempts: 0,
      consumedAt: null as Date | null,
      expiresAt: new Date(Date.now() + 60_000),
    };

    const prisma = {
      otpChallenge: {
        findFirst: () => Promise.resolve(challenge.consumedAt ? null : { ...challenge }),
        update: () => Promise.resolve({}),
        updateMany: ({ data }: { data: { consumedAt?: Date; attempts?: { increment: number } } }) => {
          if (challenge.consumedAt || challenge.expiresAt <= new Date() || challenge.attempts >= 5) {
            return Promise.resolve({ count: 0 });
          }
          if (data.consumedAt) challenge.consumedAt = data.consumedAt;
          if (data.attempts) challenge.attempts += data.attempts.increment;
          return Promise.resolve({ count: 1 });
        },
      },
    } as unknown as PrismaService;
    const config = {
      get: () => ({ ttl: 300, length: 6, maxAttempts: 5, resendCooldown: 60, maxPerHour: 5 }),
    } as unknown as ConfigService<AppConfig, true>;
    const service = new AuthService(
      prisma,
      {} as RedisService,
      {} as TokenService,
      {} as RbacService,
      config,
      {} as SmsProvider,
    );

    const results = await Promise.allSettled([
      service.verifyOtpChallenge({ phone: '9800000001', code: '123456', purpose: 'login' }),
      service.verifyOtpChallenge({ phone: '9800000001', code: '123456', purpose: 'login' }),
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  });

  it('rotates a refresh token exactly once under concurrent use', async () => {
    const sessions = new Map<string, {
      id: string;
      userId: string;
      refreshTokenHash: string;
      revokedAt: Date | null;
      expiresAt: Date;
    }>();
    let sequence = 0;
    const user = { id: 'user_1', phone: '9800000001', isPlatformStaff: false, status: 'ACTIVE' };
    const prisma = {
      session: {
        create: ({ data }: { data: { userId: string; refreshTokenHash: string; expiresAt: Date } }) => {
          const row = { id: `session_${++sequence}`, ...data, revokedAt: null };
          sessions.set(row.id, row);
          return Promise.resolve({ ...row });
        },
        findUnique: ({ where }: { where: { id: string } }) => {
          const row = sessions.get(where.id);
          return Promise.resolve(row ? { ...row } : null);
        },
        update: ({ where, data }: { where: { id: string }; data: Partial<{ refreshTokenHash: string; expiresAt: Date; revokedAt: Date }> }) => {
          const row = sessions.get(where.id)!;
          Object.assign(row, data);
          return Promise.resolve({ ...row });
        },
        updateMany: ({ where, data }: {
          where: { id: string; refreshTokenHash: string; revokedAt: null; expiresAt: { gt: Date } };
          data: Partial<{ refreshTokenHash: string; expiresAt: Date }>;
        }) => {
          const row = sessions.get(where.id);
          if (!row || row.refreshTokenHash !== where.refreshTokenHash || row.revokedAt || row.expiresAt <= where.expiresAt.gt) {
            return Promise.resolve({ count: 0 });
          }
          Object.assign(row, data);
          return Promise.resolve({ count: 1 });
        },
      },
      user: { findUnique: () => Promise.resolve({ ...user }) },
    } as unknown as PrismaService;
    const config = {
      get: () => ({
        accessSecret: 'access-secret-for-concurrency-test',
        refreshSecret: 'refresh-secret-for-concurrency-test',
        accessTtl: 900,
        refreshTtl: 1209600,
      }),
    } as unknown as ConfigService<AppConfig, true>;
    const service = new TokenService(new JwtService({}), prisma, config);
    const issued = await service.issueForUser(user, { surface: 'customer' });

    const results = await Promise.allSettled([
      service.rotate(issued.refreshToken, { ip: '127.0.0.1' }),
      service.rotate(issued.refreshToken, { ip: '127.0.0.1' }),
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../common/prisma/prisma.service';
import type { AppConfig } from '../config/configuration';
import { TokenService } from './token.service';

/**
 * `Session.refreshTokenHash` is `@unique`, and the real hash cannot exist until
 * the row does — the refresh token embeds the session id — so the row is
 * created with a placeholder and updated a moment later. When that placeholder
 * was the constant string 'pending', two people signing in at the same instant
 * both inserted it and the second lost the race to the unique index. Prisma
 * raised P2002, the exception filter turned it into `409 A record with these
 * details already exists.`, and a user was told, on a login screen, that their
 * account already existed. The window is wide, because `mint` runs an argon2
 * hash before overwriting the placeholder.
 */

function subject() {
  const created: { refreshTokenHash: string }[] = [];
  const unique = new Set<string>();
  const prisma = {
    session: {
      create: ({ data }: { data: { refreshTokenHash: string } }) => {
        // Stand in for the unique index the database actually enforces.
        if (unique.has(data.refreshTokenHash)) {
          return Promise.reject(
            new Error('Unique constraint failed on the fields: (`refreshTokenHash`)'),
          );
        }
        unique.add(data.refreshTokenHash);
        created.push(data);
        return Promise.resolve({ id: `session_${created.length}` });
      },
      update: ({ data }: { data: { refreshTokenHash: string } }) => {
        unique.add(data.refreshTokenHash);
        return Promise.resolve({});
      },
    },
  } as unknown as PrismaService;

  const config = {
    get: () => ({
      accessSecret: 'access-secret-for-tests',
      refreshSecret: 'refresh-secret-for-tests',
      accessTtl: 900,
      refreshTtl: 1209600,
    }),
  } as unknown as ConfigService<AppConfig, true>;

  return { service: new TokenService(new JwtService({}), prisma, config), created };
}

const user = (id: string) => ({ id, phone: `98000000${id}`, isPlatformStaff: false });

describe('session creation under concurrent sign-in', () => {
  it('gives each new session its own placeholder hash', async () => {
    const { service, created } = subject();

    await Promise.all([
      service.issueForUser(user('1'), { surface: 'customer' }),
      service.issueForUser(user('2'), { surface: 'seller' }),
      service.issueForUser(user('3'), { surface: 'rider' }),
    ]);

    const placeholders = created.map((c) => c.refreshTokenHash);
    assert.equal(placeholders.length, 3);
    assert.equal(
      new Set(placeholders).size,
      3,
      'two sessions shared a placeholder, which the unique index would reject',
    );
  });

  it('never writes the bare constant that used to collide', async () => {
    const { service, created } = subject();
    await service.issueForUser(user('1'), { surface: 'customer' });
    assert.notEqual(created[0].refreshTokenHash, 'pending');
  });

  it('signs in many people at once without a unique-constraint failure', async () => {
    const { service } = subject();
    // Ten simultaneous sign-ins is an ordinary evening, not a stress test.
    await assert.doesNotReject(() =>
      Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          service.issueForUser(user(String(i)), { surface: 'customer' }),
        ),
      ),
    );
  });
});

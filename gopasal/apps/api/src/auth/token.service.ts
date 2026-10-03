import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import type { AppConfig } from '../config/configuration';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // access-token lifetime (seconds)
}

interface AccessClaims {
  sub: string;
  phone: string;
  staff: boolean;
}
interface RefreshClaims {
  sub: string;
  sid: string;
}

/**
 * Issues short-lived access JWTs and long-lived, ROTATING refresh tokens.
 * Each refresh token is a JWT bound to a DB Session row (by `sid`); the token's
 * hash is stored so a session can be listed and revoked, and every refresh
 * rotates the token (reuse of a rotated token fails the hash check).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async issueForUser(
    user: { id: string; phone: string; isPlatformStaff: boolean },
    ctx: { surface: string; userAgent?: string; ip?: string },
  ): Promise<TokenPair> {
    const { refreshTtl } = this.config.get('jwt', { infer: true });
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        surface: ctx.surface,
        userAgent: ctx.userAgent,
        ip: ctx.ip,
        // Unique per session, not the literal 'pending'.
        //
        // `refreshTokenHash` is `@unique`, and the real hash cannot be computed
        // until the row exists — the refresh token embeds the session id — so a
        // placeholder is unavoidable. A *constant* placeholder is not: two
        // sign-ins landing in the same window both inserted 'pending' and the
        // second hit the unique index. That surfaced as P2002, which the
        // exception filter maps to `409 A record with these details already
        // exists.` — shown on a login screen, to a user whose only mistake was
        // signing in at the same moment as somebody else. The window is not
        // narrow either: `mint` hashes with argon2 before overwriting this, which
        // is deliberately slow. Two different people, two different phones, and
        // one of them simply could not log in.
        refreshTokenHash: `pending:${randomUUID()}`,
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });
    return this.mint(user, session.id);
  }

  async rotate(refreshToken: string, ctx: { userAgent?: string; ip?: string }): Promise<TokenPair> {
    const { refreshSecret } = this.config.get('jwt', { infer: true });
    let claims: RefreshClaims;
    try {
      claims = await this.jwt.verifyAsync<RefreshClaims>(refreshToken, { secret: refreshSecret });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.session.findUnique({ where: { id: claims.sid } });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired');
    }
    const matches = await argon2.verify(session.refreshTokenHash, refreshToken).catch(() => false);
    if (!matches) {
      // token reuse / tampering → nuke the session defensively
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token no longer valid');
    }

    const user = await this.prisma.user.findUnique({ where: { id: claims.sub } });
    if (session.userId !== claims.sub || !user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account unavailable');
    }

    // argon2 verification creates a real concurrency window: two requests can
    // both verify the same old hash before either rotates it. Claim the exact
    // stored hash atomically, replacing it with a unique non-token marker. Only
    // the winner may mint the next pair; the loser receives 401. If the process
    // dies before mint completes, the session fails closed rather than leaving
    // a reusable refresh token behind.
    const previousHash = session.refreshTokenHash;
    const claimed = await this.prisma.session.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: previousHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: {
        refreshTokenHash: `rotating:${randomUUID()}`,
        lastUsedAt: new Date(),
        userAgent: ctx.userAgent,
        ip: ctx.ip,
      },
    });
    if (claimed.count !== 1) throw new UnauthorizedException('Refresh token no longer valid');
    return this.mint(user, session.id);
  }

  async revokeByRefreshToken(refreshToken: string): Promise<void> {
    const { refreshSecret } = this.config.get('jwt', { infer: true });
    try {
      const { sid } = await this.jwt.verifyAsync<RefreshClaims>(refreshToken, {
        secret: refreshSecret,
      });
      await this.prisma.session.updateMany({
        where: { id: sid, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      /* already-invalid token → nothing to revoke */
    }
  }

  private async mint(
    user: { id: string; phone: string; isPlatformStaff: boolean },
    sessionId: string,
  ): Promise<TokenPair> {
    const { accessSecret, refreshSecret, accessTtl, refreshTtl } = this.config.get('jwt', {
      infer: true,
    });

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, phone: user.phone, staff: user.isPlatformStaff } satisfies AccessClaims,
      { secret: accessSecret, expiresIn: accessTtl },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, sid: sessionId } satisfies RefreshClaims,
      { secret: refreshSecret, expiresIn: refreshTtl },
    );

    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        refreshTokenHash: await argon2.hash(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return { accessToken, refreshToken, expiresIn: accessTtl };
  }
}

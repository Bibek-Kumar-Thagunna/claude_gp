import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { RbacService } from '../rbac/rbac.service';
import type { AppConfig } from '../config/configuration';
import { SMS_PROVIDER, type SmsProvider } from './sms.provider';
import { TokenService, type TokenPair } from './token.service';

/** Nepal MSISDN → canonical 10-digit local form (drops +977 / 977 / leading 0). */
export function normalizeNepalPhone(raw: string): string {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('977')) d = d.slice(3);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (!/^9\d{9}$/.test(d)) {
    throw new BadRequestException('Enter a valid Nepal mobile number (98XXXXXXXX).');
  }
  return d;
}

/** Log-safe rendering of a subscriber number. */
export function maskPhone(phone: string): string {
  return phone.length < 6 ? '**********' : `${phone.slice(0, 3)}xxxxx${phone.slice(-2)}`;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly tokens: TokenService,
    private readonly rbac: RbacService,
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  /**
   * Issue a one-time code. The code is random, stored only as an argon2 hash,
   * expires, supersedes its predecessor and is rate-limited two ways (a
   * per-phone cooldown and an hourly ceiling). None of that changes with the
   * transport: in development the configured provider prints the message to this
   * log, and the code still has to be typed back into `verifyOtp`. The code is
   * never returned in the HTTP response — that would make every phone number
   * signable-in by anyone who can call the endpoint.
   */
  async requestOtp(input: { phone: string; purpose?: string }): Promise<{
    sent: true;
    cooldownSeconds: number;
    expiresInSeconds: number;
    /** False when the configured provider is the development one (see the API log). */
    delivered: boolean;
  }> {
    const phone = normalizeNepalPhone(input.phone);
    const purpose = input.purpose ?? 'login';
    const otp = this.config.get('otp', { infer: true });

    // Ceiling first: the hourly counter must not be spent by requests the
    // cooldown would have refused anyway.
    await this.enforceHourlyCeiling(phone, otp.maxPerHour);

    const cooldownKey = `otp:cooldown:${phone}`;
    const fresh = await this.redis.client.set(cooldownKey, '1', 'EX', otp.resendCooldown, 'NX');
    if (fresh === null) {
      const ttl = await this.redis.client.ttl(cooldownKey);
      throw new HttpException(
        `Please wait ${Math.max(ttl, 1)} seconds before requesting another code.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(randomInt(0, 10 ** otp.length)).padStart(otp.length, '0');
    const codeHash = await argon2.hash(code);

    // supersede any previous unconsumed challenge for this phone+purpose
    await this.prisma.otpChallenge.updateMany({
      where: { identifier: phone, purpose, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    const challenge = await this.prisma.otpChallenge.create({
      data: {
        identifier: phone,
        purpose,
        codeHash,
        expiresAt: new Date(Date.now() + otp.ttl * 1000),
      },
    });

    try {
      await this.sms.send(
        phone,
        `Your GoPasal verification code is ${code}. It expires in ${Math.round(otp.ttl / 60)} minutes.`,
      );
    } catch (err) {
      // The gateway did not accept the message, so there is no code in the
      // caller's hand. Retire the challenge and release the cooldown so they can
      // try again immediately, and say plainly that sending failed rather than
      // reporting a send that did not happen.
      await this.prisma.otpChallenge
        .update({ where: { id: challenge.id }, data: { consumedAt: new Date() } })
        .catch(() => undefined);
      await this.redis.client.del(cooldownKey).catch(() => 0);
      this.logger.error(`OTP send failed for ${maskPhone(phone)}: ${(err as Error).message}`);
      throw new HttpException(
        'We could not send the verification code right now. Please try again in a moment.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return {
      sent: true,
      cooldownSeconds: otp.resendCooldown,
      expiresInSeconds: otp.ttl,
      delivered: this.sms.delivers,
    };
  }

  /**
   * Hourly ceiling per phone, on top of the short cooldown. The cooldown alone
   * only slows an attacker down; this caps the total number of codes — and the
   * SMS bill — for one number. Keyed to the clock hour so it needs no cleanup.
   */
  private async enforceHourlyCeiling(phone: string, maxPerHour: number): Promise<void> {
    const key = `otp:sends:${phone}:${Math.floor(Date.now() / 3_600_000)}`;
    const used = await this.redis.client.incr(key);
    if (used === 1) await this.redis.client.expire(key, 3600);
    if (used > maxPerHour) {
      throw new HttpException(
        'Too many verification codes requested for this number. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async verifyOtp(input: {
    phone: string;
    code: string;
    purpose?: string;
    surface?: string;
    userAgent?: string;
    ip?: string;
  }): Promise<{ user: SafeUser; tokens: TokenPair; isNewUser: boolean }> {
    const phone = normalizeNepalPhone(input.phone);
    const purpose = input.purpose ?? 'login';
    const otp = this.config.get('otp', { infer: true });

    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { identifier: phone, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) {
      throw new BadRequestException('Code expired or not found. Request a new one.');
    }
    if (challenge.attempts >= otp.maxAttempts) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      });
      throw new HttpException('Too many attempts. Request a new code.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const ok = await argon2.verify(challenge.codeHash, input.code).catch(() => false);
    if (!ok) {
      await this.prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Incorrect code. Please try again.');
    }

    await this.prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });

    const existing = await this.prisma.user.findUnique({ where: { phone } });
    const user =
      existing ??
      (await this.prisma.user.create({ data: { phone, locale: 'en', status: 'ACTIVE' } }));
    if (user.status !== 'ACTIVE') {
      throw new BadRequestException('This account is not active. Contact support.');
    }

    const tokens = await this.tokens.issueForUser(user, {
      surface: input.surface ?? 'customer',
      userAgent: input.userAgent,
      ip: input.ip,
    });

    return { user: toSafeUser(user), tokens, isNewUser: !existing };
  }

  async refresh(refreshToken: string, ctx: { userAgent?: string; ip?: string }): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken, ctx);
  }

  async logout(refreshToken: string): Promise<{ ok: true }> {
    await this.tokens.revokeByRefreshToken(refreshToken);
    return { ok: true };
  }

  /** `/auth/me` — profile plus the caller's resolved RBAC picture. */
  async profile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        ownedShops: { select: { id: true, name: true, slug: true, status: true } },
        shopMemberships: {
          where: { status: 'ACTIVE' },
          select: { shopId: true, role: { select: { name: true } } },
        },
        platformMembership: { select: { role: { select: { name: true } } } },
      },
    });
    if (!user) throw new BadRequestException('User not found');
    const access = await this.rbac.describe(userId);
    return { user: toSafeUser(user), memberships: { shops: user.shopMemberships, platform: user.platformMembership }, access };
  }
}

export interface SafeUser {
  id: string;
  phone: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  locale: string;
  isPlatformStaff: boolean;
}
function toSafeUser(u: {
  id: string;
  phone: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  locale: string;
  isPlatformStaff: boolean;
}): SafeUser {
  return {
    id: u.id,
    phone: u.phone,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    locale: u.locale,
    isPlatformStaff: u.isPlatformStaff,
  };
}

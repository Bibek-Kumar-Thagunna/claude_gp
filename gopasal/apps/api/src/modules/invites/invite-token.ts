import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Invite credentials, and why they are stored the way they are.
 *
 * Two secrets travel with every invite because they serve different people:
 *
 *   token — 32 random bytes, base64url. Goes in the link the owner shares. It is
 *           looked up directly, so it cannot be salted; instead it is long enough
 *           that a plain SHA-256 digest is not brute-forceable, and the digest is
 *           what we index. A leaked database therefore yields no working links.
 *
 *   code  — 6 digits, spoken aloud or typed by someone who never got the link.
 *           Short enough to guess, so it is NEVER used to find an invite: the
 *           invite is located by the invitee's phone number first, then the code
 *           is compared in constant time and every failure is counted.
 *
 * The phone number is the third factor and the important one: accepting an
 * invite requires an OTP-verified session on the exact number that was invited,
 * so a forwarded link is useless to anyone else.
 */

export interface InviteSecrets {
  /** goes in the URL — show once, never stored in the clear */
  token: string;
  /** short spoken code — show once, never stored in the clear */
  code: string;
  tokenHash: string;
  codeHash: string;
}

export const INVITE_CODE_LENGTH = 6;
/** After this many wrong codes the invite must be resent (which re-rolls both). */
export const INVITE_MAX_ATTEMPTS = 8;

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Codes are salted per invite via the phone number so digests aren't a rainbow table. */
export function hashInviteCode(code: string, phone: string): string {
  return createHash('sha256').update(`${phone}:${code}`, 'utf8').digest('hex');
}

export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function generateInviteSecrets(phone: string): InviteSecrets {
  const token = randomBytes(32).toString('base64url');
  const code = String(randomInt(0, 10 ** INVITE_CODE_LENGTH)).padStart(INVITE_CODE_LENGTH, '0');
  return {
    token,
    code,
    tokenHash: hashInviteToken(token),
    codeHash: hashInviteCode(code, phone),
  };
}

/** Default validity. Long enough for a shopkeeper to reach a busy relative. */
export const INVITE_TTL_DAYS = 7;

export function inviteExpiry(days = INVITE_TTL_DAYS): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

/**
 * The URL the invitee opens. Which console it points at depends on the scope —
 * shop staff land on seller.gopasal.com, platform staff on admin.gopasal.com —
 * and both hosts come from env so local development works with ports.
 */
export function inviteJoinUrl(scope: 'SHOP' | 'PLATFORM', token: string): string {
  const base =
    scope === 'PLATFORM'
      ? process.env.ADMIN_APP_URL ?? 'http://localhost:3002'
      : process.env.SELLER_APP_URL ?? 'http://localhost:3001';
  return `${base.replace(/\/+$/, '')}/join/${token}`;
}

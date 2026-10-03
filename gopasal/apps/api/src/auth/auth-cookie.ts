import type { Request } from 'express';

export const COOKIE_AUTH_HEADER = 'x-gopasal-auth-mode';
export const COOKIE_AUTH_VALUE = 'cookie';
export const COOKIE_AUTH_SURFACE_HEADER = 'x-gopasal-auth-surface';
export const LEGACY_REFRESH_COOKIE_NAME = 'gopasal_refresh';
const AUTH_SURFACES = ['customer', 'seller', 'admin', 'rider'] as const;
export type CookieAuthSurface = (typeof AUTH_SURFACES)[number];

export function wantsCookieAuth(req: Request): boolean {
  return req.get(COOKIE_AUTH_HEADER)?.toLowerCase() === COOKIE_AUTH_VALUE;
}

export function readCookieAuthSurface(req: Request): CookieAuthSurface | undefined {
  const value = req.get(COOKIE_AUTH_SURFACE_HEADER)?.toLowerCase();
  return AUTH_SURFACES.find((surface) => surface === value);
}

export function refreshCookieName(surface: CookieAuthSurface): string {
  return `${LEGACY_REFRESH_COOKIE_NAME}_${surface}`;
}

/** Read one host-only refresh cookie without adding a global cookie parser. */
export function readRefreshCookie(
  req: Request,
  surface: CookieAuthSurface,
): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  const expectedName = refreshCookieName(surface);
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== expectedName) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function refreshCookieHeader(input: {
  surface: CookieAuthSurface;
  token?: string;
  maxAgeSeconds: number;
  path: string;
  secure: boolean;
}): string {
  const value = input.token ? encodeURIComponent(input.token) : '';
  const maxAge = input.token ? Math.max(0, Math.floor(input.maxAgeSeconds)) : 0;
  return [
    `${refreshCookieName(input.surface)}=${value}`,
    `Max-Age=${maxAge}`,
    `Path=${input.path}`,
    'HttpOnly',
    'SameSite=Strict',
    ...(input.secure ? ['Secure'] : []),
  ].join('; ');
}

/** Remove the pre-surface cookie introduced by older browser builds. */
export function legacyRefreshCookieExpiry(path: string, secure: boolean): string {
  return [
    `${LEGACY_REFRESH_COOKIE_NAME}=`,
    'Max-Age=0',
    `Path=${path}`,
    'HttpOnly',
    'SameSite=Strict',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

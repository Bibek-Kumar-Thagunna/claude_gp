import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Request } from 'express';
import {
  legacyRefreshCookieExpiry,
  readCookieAuthSurface,
  readRefreshCookie,
  refreshCookieHeader,
  wantsCookieAuth,
} from './auth-cookie';

function request(headers: Record<string, string>): Request {
  return {
    headers,
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as Request;
}

describe('browser refresh cookie', () => {
  it('enables cookie mode only through the explicit browser header', () => {
    assert.equal(wantsCookieAuth(request({ 'x-gopasal-auth-mode': 'cookie' })), true);
    assert.equal(wantsCookieAuth(request({ 'x-gopasal-auth-mode': 'bearer' })), false);
    assert.equal(wantsCookieAuth(request({})), false);
  });

  it('accepts only a named GoPasal browser surface', () => {
    assert.equal(readCookieAuthSurface(request({ 'x-gopasal-auth-surface': 'seller' })), 'seller');
    assert.equal(readCookieAuthSurface(request({ 'x-gopasal-auth-surface': 'ADMIN' })), 'admin');
    assert.equal(readCookieAuthSurface(request({ 'x-gopasal-auth-surface': 'unknown' })), undefined);
  });

  it('reads only the requested surface cookie without confusing adjacent sessions', () => {
    const req = request({
      cookie: 'gopasal_refresh_admin=admin-token; gopasal_refresh_seller=a.b%2Fc; other=1',
    });
    assert.equal(readRefreshCookie(req, 'seller'), 'a.b/c');
    assert.equal(readRefreshCookie(req, 'admin'), 'admin-token');
    assert.equal(
      readRefreshCookie(request({ cookie: 'gopasal_refresh_seller=%E0%A4%A' }), 'seller'),
      undefined,
    );
  });

  it('creates a host-only HttpOnly strict cookie and requires TLS when deployed', () => {
    const header = refreshCookieHeader({
      surface: 'seller',
      token: 'signed.token',
      maxAgeSeconds: 1209600,
      path: '/api/v1/auth',
      secure: true,
    });
    assert.match(header, /^gopasal_refresh_seller=signed.token;/);
    assert.match(header, /Max-Age=1209600/);
    assert.match(header, /Path=\/api\/v1\/auth/);
    assert.match(header, /HttpOnly/);
    assert.match(header, /SameSite=Strict/);
    assert.match(header, /Secure/);
    assert.doesNotMatch(header, /Domain=/);
  });

  it('expires the cookie without echoing an old token', () => {
    const header = refreshCookieHeader({
      surface: 'admin',
      maxAgeSeconds: 1209600,
      path: '/api/v1/auth',
      secure: false,
    });
    assert.match(header, /^gopasal_refresh_admin=;/);
    assert.match(header, /Max-Age=0/);
    assert.doesNotMatch(header, /Secure/);
  });

  it('expires the obsolete shared cookie during migration', () => {
    const header = legacyRefreshCookieExpiry('/api/v1/auth', false);
    assert.match(header, /^gopasal_refresh=;/);
    assert.match(header, /Max-Age=0/);
  });
});

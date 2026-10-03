import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { configureRealtimeOrigins, extractSocketToken, realtimeOriginAllowed } from './ws-auth';

describe('realtime handshake security', () => {
  it('accepts auth payloads and bearer headers but never query tokens', () => {
    assert.equal(extractSocketToken({ handshake: { auth: { token: 'Bearer auth-token' }, headers: {}, query: {} } } as never), 'auth-token');
    assert.equal(extractSocketToken({ handshake: { auth: {}, headers: { authorization: 'Bearer header-token' }, query: {} } } as never), 'header-token');
    assert.equal(extractSocketToken({ handshake: { auth: {}, headers: {}, query: { token: 'leaked-token' } } } as never), null);
  });

  it('allows configured browser origins and origin-less native clients only', () => {
    configureRealtimeOrigins(['https://gopasal.com']);
    assert.equal(realtimeOriginAllowed('https://gopasal.com'), true);
    assert.equal(realtimeOriginAllowed('https://evil.example'), false);
    assert.equal(realtimeOriginAllowed(undefined), true);
  });
});

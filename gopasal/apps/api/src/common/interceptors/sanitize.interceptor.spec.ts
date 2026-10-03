import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sanitize } from './sanitize.interceptor';

describe('response sanitizer', () => {
  it('preserves a shared record wherever it legitimately appears', () => {
    const record = { id: 'v1', version: 1, codeHash: 'never-send-this' };
    assert.deepEqual(sanitize({ current: record, history: [record] }), {
      current: { id: 'v1', version: 1 },
      history: [{ id: 'v1', version: 1 }],
    });
  });

  it('still cuts an actual circular reference', () => {
    const record: Record<string, unknown> = { id: 'v1' };
    record.self = record;
    assert.deepEqual(sanitize(record), { id: 'v1', self: undefined });
  });
});

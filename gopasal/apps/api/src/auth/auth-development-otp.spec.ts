import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { developmentOtpForResponse } from './auth.service';

describe('development OTP response helper', () => {
  it('exposes the real code only for the explicit local log transport', () => {
    assert.equal(developmentOtpForResponse('local', 'log', '123456'), '123456');
    assert.equal(developmentOtpForResponse('test', 'log', '123456'), '123456');
  });

  it('never exposes a code in production, even if log transport is misselected', () => {
    assert.equal(developmentOtpForResponse('production', 'log', '123456'), undefined);
  });

  it('does not expose codes in staging or when a real gateway is active', () => {
    assert.equal(developmentOtpForResponse('staging', 'log', '123456'), undefined);
    assert.equal(developmentOtpForResponse('local', 'sparrow', '123456'), undefined);
    assert.equal(developmentOtpForResponse('local', 'twilio', '123456'), undefined);
  });
});

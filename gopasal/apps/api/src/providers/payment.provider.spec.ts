import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import { PAYMENT_PROVIDERS, type PaymentProvider, paymentProvidersFactory } from './payment.provider';

/**
 * Payments are the one place where a convincing local imitation is worse than
 * nothing: a fabricated redirect that bounces the browser back to a success page
 * would let a signature bug, a wrong amount field or a missing verification step
 * pass every local test and fail on the first real rupee.
 *
 * So what is pinned here is the opposite of a happy path. Cash on Delivery — the
 * method GoPasal is actually built around — must be usable with zero credentials.
 * The online gateways must be *absent from checkout* rather than broken inside it,
 * and if something reaches them anyway they must reject, never resolve.
 */
const paymentsConfig = (over: Partial<AppConfig['payments']> = {}): AppConfig['payments'] => ({
  codEnabled: true,
  esewa: { baseUrl: 'https://rc-epay.esewa.com.np' },
  khalti: { baseUrl: 'https://a.khalti.com/api/v2' },
  ...over,
});

const build = (over: Partial<AppConfig['payments']> = {}): PaymentProvider[] =>
  paymentProvidersFactory.useFactory(
    ({ get: () => paymentsConfig(over) }) as unknown as ConfigService<AppConfig, true>,
  );

const methodOf = (method: string, over: Partial<AppConfig['payments']> = {}): PaymentProvider => {
  const found = build(over).find((p) => p.method === method);
  assert.ok(found, `${method} must be present in the provider list`);
  return found;
};

const ORDER = { orderId: 'ord_1', orderCode: 'GP-100001', amount: 1250, returnUrl: 'https://gopasal.com/orders/ord_1' };

describe('paymentProvidersFactory', () => {
  it('binds the token checkout resolves', () => {
    assert.equal(paymentProvidersFactory.provide, PAYMENT_PROVIDERS);
  });

  it('always offers all three methods so checkout can filter on `enabled`', () => {
    assert.deepEqual(
      build().map((p) => p.method),
      ['COD', 'ESEWA', 'KHALTI'],
    );
  });
});

describe('Cash on Delivery', () => {
  it('is enabled with no credential of any kind, which is what makes local dev complete', () => {
    assert.equal(methodOf('COD').enabled, true);
  });

  it('leaves the order PENDING rather than claiming money has arrived', async () => {
    const cod = methodOf('COD');
    assert.deepEqual(await cod.init(ORDER), { status: 'PENDING' });
    assert.deepEqual(await cod.verify({}), { status: 'PENDING' });
  });

  it('can be switched off by configuration', () => {
    assert.equal(methodOf('COD', { codEnabled: false }).enabled, false);
  });

  it('hands out no redirect, because no gateway is involved', async () => {
    assert.equal((await methodOf('COD').init(ORDER)).redirectUrl, undefined);
  });
});

describe('eSewa and Khalti, pending the finance milestone', () => {
  for (const method of ['ESEWA', 'KHALTI'] as const) {
    it(`${method} is disabled without credentials, so checkout never shows it`, () => {
      assert.equal(methodOf(method).enabled, false);
    });

    it(`${method} stays disabled even once credentials are set, because it is unimplemented`, () => {
      // The honest state: a token in .env does not conjure an integration. Reporting
      // `enabled: true` here would put a dead button in front of a paying customer.
      const configured = methodOf(method, {
        esewa: { baseUrl: 'https://rc-epay.esewa.com.np', merchant: 'EPAYTEST', secret: 'secret' },
        khalti: { baseUrl: 'https://a.khalti.com/api/v2', secret: 'test-secret' },
      });
      assert.equal(configured.enabled, false);
    });

    it(`${method} rejects instead of fabricating a redirect to a success page`, async () => {
      const provider = methodOf(method);
      await assert.rejects(() => provider.init(ORDER), (err: Error) => {
        assert.match(err.message, new RegExp(`${method} payments are not available in this deployment`));
        assert.match(err.message, /finance milestone/);
        // The old implementation returned `<returnUrl>?gateway=…&ref=…`, which read
        // as a completed payment. Nothing resembling the return URL may come back.
        assert.doesNotMatch(err.message, /gopasal\.com\/orders/);
        return true;
      });
    });

    it(`${method} rejects verification rather than reporting PAID`, async () => {
      await assert.rejects(
        () => methodOf(method).verify({ providerRef: 'ref', token: 'tok' }),
        /not available in this deployment/,
      );
    });
  }
});

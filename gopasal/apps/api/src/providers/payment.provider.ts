import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';

export type PaymentMethod = 'COD' | 'ESEWA' | 'KHALTI';

export interface PaymentInitResult {
  status: 'PENDING' | 'REQUIRES_ACTION' | 'PAID';
  redirectUrl?: string;
  providerRef?: string;
}
export interface PaymentVerifyResult {
  status: 'PAID' | 'FAILED' | 'PENDING';
  providerRef?: string;
}

/**
 * A single payment method. `enabled` reflects whether the method is usable in
 * this deployment, and checkout only ever offers enabled methods — so a gateway
 * that has no credentials is absent from the UI rather than failing at the last
 * step of a purchase.
 *
 * Note what is deliberately NOT here: a "mock gateway" for development. eSewa and
 * Khalti both publish sandbox environments with test credentials, and money
 * movement is the one area where a local imitation is actively harmful — it would
 * let a signature bug, a wrong amount field or a missing verification step pass
 * every local test and fail on the first real transaction. Development points at
 * the sandbox (ESEWA_BASE_URL / KHALTI_BASE_URL already default to it); until the
 * finance milestone wires the real signing and verification, the online methods
 * stay disabled and Cash on Delivery — which needs no gateway at all — carries
 * the entire local flow.
 */
export interface PaymentProvider {
  readonly method: PaymentMethod;
  readonly enabled: boolean;
  init(input: {
    orderId: string;
    orderCode: string;
    amount: number; // NPR rupees
    returnUrl?: string;
  }): Promise<PaymentInitResult>;
  verify(input: { providerRef?: string; token?: string }): Promise<PaymentVerifyResult>;
}

/** All configured payment methods, injected as an array. */
export const PAYMENT_PROVIDERS = Symbol('PAYMENT_PROVIDERS');

/**
 * Cash on Delivery is fully implemented, because there is nothing to implement:
 * no gateway is involved, the rider collects, and the order stays PENDING until
 * they mark it collected. This is the method the whole platform is built around
 * (SRS: COD-first), which is why local development is genuinely complete without
 * a single payment credential.
 */
class CodProvider implements PaymentProvider {
  readonly method = 'COD' as const;
  constructor(readonly enabled: boolean) {}
  init(): Promise<PaymentInitResult> {
    return Promise.resolve({ status: 'PENDING' }); // collected by the rider on delivery
  }
  verify(): Promise<PaymentVerifyResult> {
    return Promise.resolve({ status: 'PENDING' });
  }
}

/**
 * Online gateway placeholder. It is `enabled: false` unless credentials exist,
 * and if it is ever reached anyway it refuses loudly.
 *
 * The previous version of this class returned a fabricated redirect URL of the
 * form `<returnUrl>?gateway=esewa&ref=<orderCode>`, which looked like a working
 * checkout: the browser bounced back to the success page having paid nobody. A
 * refusal is worth more than that, because it cannot be mistaken for a payment.
 */
class UnimplementedGateway implements PaymentProvider {
  readonly enabled = false;
  private readonly logger: Logger;

  constructor(
    readonly method: PaymentMethod,
    private readonly configured: boolean,
    private readonly docs: string,
  ) {
    this.logger = new Logger(`Pay:${method.toLowerCase()}`);
    if (configured) {
      // Credentials present but no implementation yet — say so once, at boot,
      // rather than letting someone conclude from the .env that it works.
      this.logger.warn(
        `credentials are configured but the ${method} integration is not implemented yet — ` +
          'the method stays disabled at checkout',
      );
    }
  }

  init(): Promise<PaymentInitResult> {
    return Promise.reject(this.refuse());
  }
  verify(): Promise<PaymentVerifyResult> {
    return Promise.reject(this.refuse());
  }

  private refuse(): ServiceUnavailableException {
    return new ServiceUnavailableException(
      `${this.method} payments are not available in this deployment. ${this.docs}`,
    );
  }
}

export const paymentProvidersFactory = {
  provide: PAYMENT_PROVIDERS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfig, true>): PaymentProvider[] => {
    const p = config.get('payments', { infer: true });
    return [
      new CodProvider(p.codEnabled),
      new UnimplementedGateway(
        'ESEWA',
        Boolean(p.esewa.merchant && p.esewa.secret),
        'Pending the finance milestone: signed ePay v2 form POST plus server-side status verification.',
      ),
      new UnimplementedGateway(
        'KHALTI',
        Boolean(p.khalti.secret),
        'Pending the finance milestone: ePayment v2 initiate plus server-side lookup verification.',
      ),
    ];
  },
};

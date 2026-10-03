import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, randomUUID } from "node:crypto";
import type { AppConfig } from "../config/configuration";

export type PaymentMethod = "COD" | "ESEWA" | "KHALTI";

export interface PaymentInitResult {
  status: "PENDING" | "REQUIRES_ACTION" | "PAID";
  redirectUrl?: string;
  actionUrl?: string;
  formFields?: Record<string, string>;
  providerRef?: string;
}
export interface PaymentVerifyResult {
  status: "PAID" | "FAILED" | "PENDING";
  providerRef?: string;
}
export interface PaymentRefundResult {
  status: "COMPLETED";
  providerRef: string;
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
 * every integration test and fail on the first real transaction. Non-production
 * environments point at the vendors' sandboxes; the exact signing, initiation,
 * server-side verification and escrow path used at launch remains in place. Until
 * credentials are supplied, those methods stay absent and Cash on Delivery keeps
 * checkout usable.
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
  verify(input: {
    providerRef?: string;
    token?: string;
    orderId?: string;
    amount?: number;
  }): Promise<PaymentVerifyResult>;
  /** Optional because not every Nepal gateway publishes a usable merchant
   * refund API. The Khalti implementation safely covers full wallet refunds;
   * bank refunds that require a separately verified payer mobile can remain in
   * the operations queue. Absence or rejection never means simulated success. */
  refundFull?(input: {
    providerRef: string;
    amount: number;
  }): Promise<PaymentRefundResult>;
}

/** All configured payment methods, injected as an array. */
export const PAYMENT_PROVIDERS = Symbol("PAYMENT_PROVIDERS");

/**
 * Cash on Delivery is fully implemented, because there is nothing to implement:
 * no gateway is involved, the rider collects, and the order stays PENDING until
 * they mark it collected. This is the method the whole platform is built around
 * (SRS: COD-first), which is why the commerce flow remains usable before gateway
 * credentials are supplied.
 */
class CodProvider implements PaymentProvider {
  readonly method = "COD" as const;
  constructor(readonly enabled: boolean) {}
  init(): Promise<PaymentInitResult> {
    return Promise.resolve({ status: "PENDING" }); // collected by the rider on delivery
  }
  verify(): Promise<PaymentVerifyResult> {
    return Promise.resolve({ status: "PENDING" });
  }
}

class EsewaProvider implements PaymentProvider {
  readonly method = "ESEWA" as const;
  readonly enabled: boolean;
  constructor(
    private readonly merchant: string | undefined,
    private readonly secret: string | undefined,
    private readonly baseUrl: string,
    private readonly callbackBaseUrl: string,
  ) {
    this.enabled = Boolean(merchant && secret);
  }

  init(input: { orderId: string; orderCode: string; amount: number }): Promise<PaymentInitResult> {
    if (!this.enabled || !this.merchant || !this.secret) return Promise.reject(this.refuse());
    const transactionUuid = `${input.orderId}-${randomUUID()}`.replace(/[^A-Za-z0-9-]/g, "-");
    const totalAmount = String(input.amount);
    const signedFieldNames = "total_amount,transaction_uuid,product_code";
    const signature = createHmac("sha256", this.secret)
      .update(
        `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${this.merchant}`,
      )
      .digest("base64");
    const callback = `${this.callbackBaseUrl}/payments/callback/esewa?orderId=${encodeURIComponent(input.orderId)}`;
    return Promise.resolve({
      status: "REQUIRES_ACTION" as const,
      actionUrl: `${this.baseUrl.replace(/\/+$/, "")}/api/epay/main/v2/form`,
      providerRef: transactionUuid,
      formFields: {
        amount: totalAmount,
        tax_amount: "0",
        total_amount: totalAmount,
        transaction_uuid: transactionUuid,
        product_code: this.merchant,
        product_service_charge: "0",
        product_delivery_charge: "0",
        success_url: `${callback}&outcome=success`,
        failure_url: `${callback}&outcome=failure`,
        signed_field_names: signedFieldNames,
        signature,
      },
    });
  }

  async verify(input: { providerRef?: string; amount?: number }): Promise<PaymentVerifyResult> {
    if (!this.enabled || !this.merchant) throw this.refuse();
    if (!input.providerRef || input.amount == null)
      throw new BadRequestException("eSewa payment reference and amount are required");
    const statusBase = this.baseUrl.includes("rc-epay.esewa.com.np")
      ? "https://uat.esewa.com.np"
      : this.baseUrl.replace(/\/+$/, "");
    const query = new URLSearchParams({
      product_code: this.merchant,
      total_amount: String(input.amount),
      transaction_uuid: input.providerRef,
    });
    const result = await paymentJson(
      `${statusBase}/api/epay/transaction/status/?${query.toString()}`,
      { method: "GET" },
      "eSewa",
    );
    if (Number(result.totalAmount) !== input.amount)
      throw new BadRequestException("eSewa verified a different payment amount");
    const status = stringField(result.status).toUpperCase();
    if (status === "COMPLETE") return { status: "PAID", providerRef: input.providerRef };
    if (["CANCELED", "NOT_FOUND", "FULL_REFUND"].includes(status))
      return { status: "FAILED", providerRef: input.providerRef };
    return { status: "PENDING", providerRef: input.providerRef };
  }

  private refuse(): ServiceUnavailableException {
    return new ServiceUnavailableException("eSewa payments are not configured in this deployment");
  }
}

class KhaltiProvider implements PaymentProvider {
  readonly method = "KHALTI" as const;
  readonly enabled: boolean;

  constructor(
    private readonly secret: string | undefined,
    private readonly baseUrl: string,
    private readonly callbackBaseUrl: string,
    private readonly websiteUrl: string,
  ) {
    this.enabled = Boolean(secret);
  }

  async init(input: { orderId: string; orderCode: string; amount: number }) {
    if (!this.enabled || !this.secret) throw this.refuse();
    const result = await paymentJson(
      `${this.apiBase()}/epayment/initiate/`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${this.secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          return_url: `${this.callbackBaseUrl}/payments/callback/khalti?orderId=${encodeURIComponent(input.orderId)}`,
          website_url: this.websiteUrl,
          amount: input.amount * 100,
          purchase_order_id: input.orderId,
          purchase_order_name: input.orderCode,
        }),
      },
      "Khalti",
    );
    const pidx = typeof result.pidx === "string" ? result.pidx : undefined;
    const paymentUrl = typeof result.payment_url === "string" ? result.payment_url : undefined;
    if (!pidx || !paymentUrl)
      throw new ServiceUnavailableException("Khalti returned an incomplete payment response");
    return { status: "REQUIRES_ACTION" as const, providerRef: pidx, redirectUrl: paymentUrl };
  }

  async verify(input: { providerRef?: string; amount?: number }): Promise<PaymentVerifyResult> {
    if (!this.enabled || !this.secret) throw this.refuse();
    if (!input.providerRef || input.amount == null)
      throw new BadRequestException("Khalti payment reference and amount are required");
    const result = await paymentJson(
      `${this.apiBase()}/epayment/lookup/`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${this.secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pidx: input.providerRef }),
      },
      "Khalti",
      true,
    );
    if (Number(result.total_amount) !== input.amount * 100)
      throw new BadRequestException("Khalti verified a different payment amount");
    const status = stringField(result.status);
    if (status === "Completed") return { status: "PAID", providerRef: input.providerRef };
    if (["Expired", "User canceled", "Refunded"].includes(status))
      return { status: "FAILED", providerRef: input.providerRef };
    return { status: "PENDING", providerRef: input.providerRef };
  }

  async refundFull(input: { providerRef: string; amount: number }): Promise<PaymentRefundResult> {
    if (!this.enabled || !this.secret) throw this.refuse();
    const lookup = await this.lookup(input.providerRef);
    if (Number(lookup.total_amount) !== input.amount * 100)
      throw new BadRequestException("Khalti returned a different original payment amount");
    const transactionId = stringField(lookup.transaction_id);
    if (!transactionId)
      throw new ServiceUnavailableException("Khalti payment has no refundable transaction id yet");
    if (stringField(lookup.status) === "Refunded" || lookup.refunded === true) {
      return { status: "COMPLETED", providerRef: transactionId };
    }
    if (stringField(lookup.status) !== "Completed") {
      throw new ServiceUnavailableException("Khalti payment is not ready for a full refund");
    }

    await paymentJson(
      `${this.refundBase()}/api/merchant-transaction/${encodeURIComponent(transactionId)}/refund/`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${this.secret}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      },
      "Khalti",
    );
    return { status: "COMPLETED", providerRef: transactionId };
  }

  private lookup(providerRef: string) {
    if (!this.secret) throw this.refuse();
    return paymentJson(
      `${this.apiBase()}/epayment/lookup/`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${this.secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ pidx: providerRef }),
      },
      "Khalti",
      true,
    );
  }

  private apiBase() {
    const base = this.baseUrl.replace(/\/+$/, "");
    return base.endsWith("/api/v2") ? base : `${base}/api/v2`;
  }

  private refundBase() {
    return this.baseUrl.replace(/\/api\/v2\/?$/, "").replace(/\/+$/, "");
  }

  private refuse() {
    return new ServiceUnavailableException("Khalti payments are not configured in this deployment");
  }
}

async function paymentJson(
  url: string,
  init: RequestInit,
  gateway: string,
  acceptErrorPayload = false,
): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok && !(acceptErrorPayload && typeof result.status === "string")) {
      throw new ServiceUnavailableException(`${gateway} rejected the payment request`);
    }
    return result;
  } catch (error) {
    if (error instanceof BadRequestException || error instanceof ServiceUnavailableException)
      throw error;
    throw new ServiceUnavailableException(
      error instanceof Error && error.name === "AbortError"
        ? `${gateway} payment request timed out`
        : `${gateway} payment service could not be reached`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export const paymentProvidersFactory = {
  provide: PAYMENT_PROVIDERS,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfig, true>): PaymentProvider[] => {
    const p = config.get("payments", { infer: true });
    const callbackBaseUrl = `${config.get("publicUrl", { infer: true })}/${config.get("apiPrefix", { infer: true })}`;
    const websiteUrl = config.get("customerWebUrl", { infer: true });
    return [
      new CodProvider(p.codEnabled),
      new EsewaProvider(p.esewa.merchant, p.esewa.secret, p.esewa.baseUrl, callbackBaseUrl),
      new KhaltiProvider(p.khalti.secret, p.khalti.baseUrl, callbackBaseUrl, websiteUrl),
    ];
  },
};

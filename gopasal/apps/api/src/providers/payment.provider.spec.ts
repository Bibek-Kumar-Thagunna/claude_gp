import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../config/configuration";
import {
  PAYMENT_PROVIDERS,
  type PaymentProvider,
  paymentProvidersFactory,
} from "./payment.provider";

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
const paymentsConfig = (over: Partial<AppConfig["payments"]> = {}): AppConfig["payments"] => ({
  codEnabled: true,
  esewa: { baseUrl: "https://rc-epay.esewa.com.np" },
  khalti: { baseUrl: "https://a.khalti.com/api/v2" },
  ...over,
});

const build = (over: Partial<AppConfig["payments"]> = {}): PaymentProvider[] =>
  paymentProvidersFactory.useFactory({
    get: (key: string) => {
      if (key === "payments") return paymentsConfig(over);
      if (key === "publicUrl") return "https://api.gopasal.com";
      if (key === "apiPrefix") return "api";
      if (key === "customerWebUrl") return "https://gopasal.com";
      return "test-payment-signing-secret";
    },
  } as unknown as ConfigService<AppConfig, true>);

const methodOf = (method: string, over: Partial<AppConfig["payments"]> = {}): PaymentProvider => {
  const found = build(over).find((p) => p.method === method);
  assert.ok(found, `${method} must be present in the provider list`);
  return found;
};

const ORDER = {
  orderId: "ord_1",
  orderCode: "GP-100001",
  amount: 1250,
  returnUrl: "https://gopasal.com/orders/ord_1",
};

describe("paymentProvidersFactory", () => {
  it("binds the token checkout resolves", () => {
    assert.equal(paymentProvidersFactory.provide, PAYMENT_PROVIDERS);
  });

  it("offers only real payment methods so checkout can filter on `enabled`", () => {
    assert.deepEqual(
      build().map((p) => p.method),
      ["COD", "ESEWA", "KHALTI"],
    );
  });
});

describe("Cash on Delivery", () => {
  it("is enabled with no credential of any kind, which is what makes local dev complete", () => {
    assert.equal(methodOf("COD").enabled, true);
  });

  it("leaves the order PENDING rather than claiming money has arrived", async () => {
    const cod = methodOf("COD");
    assert.deepEqual(await cod.init(ORDER), { status: "PENDING" });
    assert.deepEqual(await cod.verify({}), { status: "PENDING" });
  });

  it("can be switched off by configuration", () => {
    assert.equal(methodOf("COD", { codEnabled: false }).enabled, false);
  });

  it("hands out no redirect, because no gateway is involved", async () => {
    assert.equal((await methodOf("COD").init(ORDER)).redirectUrl, undefined);
  });
});

describe("production online gateways", () => {
  it("keeps both gateways absent until the required credentials exist", () => {
    assert.equal(methodOf("ESEWA").enabled, false);
    assert.equal(methodOf("KHALTI").enabled, false);
  });

  it("builds an HMAC-signed eSewa ePay v2 POST form and never declares it paid", async () => {
    const esewa = methodOf("ESEWA", {
      esewa: { baseUrl: "https://rc-epay.esewa.com.np", merchant: "EPAYTEST", secret: "secret" },
    });
    assert.equal(esewa.enabled, true);
    const initiated = await esewa.init(ORDER);
    assert.equal(initiated.status, "REQUIRES_ACTION");
    assert.equal(initiated.actionUrl, "https://rc-epay.esewa.com.np/api/epay/main/v2/form");
    assert.equal(initiated.formFields?.product_code, "EPAYTEST");
    assert.equal(initiated.formFields?.total_amount, String(ORDER.amount));
    assert.match(initiated.formFields?.success_url ?? "", /api\/payments\/callback\/esewa/);
    assert.ok(initiated.formFields?.signature);
  });

  it("only accepts eSewa after a server status lookup returns COMPLETE for the exact amount", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve(new Response(
        JSON.stringify({ status: "COMPLETE", totalAmount: ORDER.amount, refId: "ES-1" }),
        { status: 200, headers: { "content-type": "application/json" } },
      ));
    try {
      const esewa = methodOf("ESEWA", {
        esewa: { baseUrl: "https://rc-epay.esewa.com.np", merchant: "EPAYTEST", secret: "secret" },
      });
      assert.equal(
        (await esewa.verify({ providerRef: ORDER.orderId, amount: ORDER.amount })).status,
        "PAID",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("initiates Khalti in paisa and accepts only a matching Completed lookup", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (url, init) => {
      const requestUrl = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      requests.push({ url: requestUrl, init });
      const body =
        requests.length === 1
          ? { pidx: "PIDX-1", payment_url: "https://pay.khalti.com/?pidx=PIDX-1" }
          : {
              pidx: "PIDX-1",
              total_amount: ORDER.amount * 100,
              status: "Completed",
              transaction_id: "TX-1",
            };
      return Promise.resolve(new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    };
    try {
      const khalti = methodOf("KHALTI", {
        khalti: { baseUrl: "https://dev.khalti.com", secret: "test-secret" },
      });
      assert.equal(khalti.enabled, true);
      const initiated = await khalti.init(ORDER);
      assert.equal(initiated.redirectUrl, "https://pay.khalti.com/?pidx=PIDX-1");
      const requestBody = requests[0]?.init?.body;
      if (typeof requestBody !== "string") assert.fail("Khalti request body must be JSON");
      assert.match(requestBody, new RegExp(`"amount":${ORDER.amount * 100}`));
      assert.equal(
        (await khalti.verify({ providerRef: "PIDX-1", amount: ORDER.amount })).status,
        "PAID",
      );
      assert.match(requests[1]?.url ?? "", /epayment\/lookup/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("executes a Khalti full refund using the verified transaction id", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (url, init) => {
      const requestUrl = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      requests.push({ url: requestUrl, init });
      const body = requests.length === 1
        ? { pidx: "PIDX-1", total_amount: ORDER.amount * 100, status: "Completed", transaction_id: "TX-1", refunded: false }
        : { detail: "Transaction refund successful." };
      return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
    };
    try {
      const khalti = methodOf("KHALTI", {
        khalti: { baseUrl: "https://dev.khalti.com", secret: "test-secret" },
      });
      if (typeof khalti.refundFull !== "function") assert.fail("Khalti refund must be configured");
      assert.deepEqual(
        await khalti.refundFull({ providerRef: "PIDX-1", amount: ORDER.amount }),
        { status: "COMPLETED", providerRef: "TX-1" },
      );
      assert.match(requests[0]?.url ?? "", /api\/v2\/epayment\/lookup/);
      assert.equal(requests[1]?.url, "https://dev.khalti.com/api/merchant-transaction/TX-1/refund/");
      assert.equal(requests[1]?.init?.method, "POST");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("treats an already-refunded Khalti lookup as idempotent success", async () => {
    let requests = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => {
      requests += 1;
      return Promise.resolve(new Response(JSON.stringify({
        pidx: "PIDX-1",
        total_amount: ORDER.amount * 100,
        status: "Refunded",
        transaction_id: "TX-1",
        refunded: true,
      }), { status: 200, headers: { "content-type": "application/json" } }));
    };
    try {
      const khalti = methodOf("KHALTI", {
        khalti: { baseUrl: "https://dev.khalti.com", secret: "test-secret" },
      });
      if (typeof khalti.refundFull !== "function") assert.fail("Khalti refund must be configured");
      assert.equal((await khalti.refundFull({ providerRef: "PIDX-1", amount: ORDER.amount })).status, "COMPLETED");
      assert.equal(requests, 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

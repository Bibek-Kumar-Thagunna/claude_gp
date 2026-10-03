#!/usr/bin/env node

/**
 * Investor-critical API journey against the local development stack.
 *
 * This does not bypass auth or write the database directly. OTPs are requested
 * and verified through the public auth API. In development, SMS_PROVIDER=log
 * returns the one-time development code to the caller; an optional
 * SMS_DEV_OUTBOX_FILE remains a fallback for the same local-only transport.
 * Run only against an isolated test database, then reseed afterwards.
 */
import { readFile } from "node:fs/promises";

const base = process.env.GOPASAL_API_URL ?? "http://localhost:4000/api/v1";
const outbox = process.env.SMS_DEV_OUTBOX_FILE ?? "/tmp/gopasal-sms-outbox.jsonl";
const evidence = [];

function ok(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function record(flow, detail) {
  evidence.push({ flow, detail });
  console.log(`✓ ${flow}: ${detail}`);
}

async function request(path, { method = "GET", token, body, expected = [200, 201] } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${path} returned ${response.status}: ${JSON.stringify(payload)}`);
  }
  return { status: response.status, body: payload };
}

async function latestOtp(phone, since) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const lines = (await readFile(outbox, "utf8")).trim().split("\n").filter(Boolean);
      for (const line of lines.reverse()) {
        const item = JSON.parse(line);
        if (item.to === phone && Date.parse(item.at) >= since) {
          const code = String(item.message).match(/\b(\d{6})\b/)?.[1];
          if (code) return code;
        }
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`No development OTP appeared in ${outbox} for ${phone}`);
}

async function login(phone, surface) {
  const since = Date.now() - 1000;
  const challenge = await request("/auth/otp/request", { method: "POST", body: { phone, purpose: "login" } });
  ok(challenge.body.sent === true && challenge.body.delivered === false, `${phone} must use the log development transport`);
  const code = challenge.body.developmentCode ?? await latestOtp(phone, since);
  const verified = await request("/auth/otp/verify", {
    method: "POST",
    body: { phone, code, purpose: "login", surface },
  });
  ok(verified.body.tokens?.accessToken, `${phone} must receive a real access token`);
  return { token: verified.body.tokens.accessToken, user: verified.body.user, isNewUser: verified.body.isNewUser };
}

async function main() {
  const health = await request("/health");
  ok(health.body.status === "ok" && health.body.db === "up" && health.body.cache === "up", "API, database and cache must be healthy");
  record("Platform boot", "API reports database and cache healthy");

  const shops = await request("/shops?limit=100&q=Namaste");
  const shop = shops.body.data.find((row) => row.slug === "namaste-kirana");
  ok(shop, "Namaste Kirana must be publicly discoverable through backend search");
  const products = await request(`/shops/${encodeURIComponent(shop.slug)}/products?limit=100`);
  const rice = products.body.data.find((row) => row.name === "Basmati Rice");
  ok(rice?.variants?.length, "seeded rice and variants must come from catalog API");
  record("Catalog", `${shops.body.meta.total} public shops; variant-backed product loaded`);

  const customer = await login("9899999998", "customer");
  await request("/users/me", { method: "PATCH", token: customer.token, body: { name: "Investor E2E Customer" } });
  const address = await request("/users/me/addresses", {
    method: "POST", token: customer.token,
    body: {
      label: "Demo", recipientName: "Investor E2E Customer", phone: "9899999998",
      area: "New Baneshwor", landmark: "Demo desk", fullAddress: "New Baneshwor, Kathmandu",
      lat: 27.698, lng: 85.3455, isDefault: true,
    },
  });
  await request("/cart/items", {
    method: "POST", token: customer.token,
    body: { productId: rice.id, variantId: rice.variants[0].id, qty: 3 },
  });
  const cart = await request("/cart", { token: customer.token });
  ok(cart.body.subtotal === rice.variants[0].price * 3 && cart.body.meetsMinOrder, "cart totals must be server-calculated");
  const coupon = await request("/orders/preview-coupon", { method: "POST", token: customer.token, body: { couponCode: "WELCOME100" } });
  ok(coupon.body.discount > 0, "WELCOME100 must be validated by the backend");
  record("Customer auth/cart", "real OTP, persisted address, server cart and coupon quote succeeded");

  const methods = await request(`/orders/payment-methods/${shop.id}`, { token: customer.token });
  ok(methods.body.some((row) => row.id === "COD") && !methods.body.some((row) => row.id === "DEVELOPMENT"), "checkout must expose COD and no simulated payment method");
  const retiredPayment = await request("/orders/checkout", {
    method: "POST", token: customer.token,
    body: { addressId: address.body.id, paymentMethod: "DEVELOPMENT" }, expected: [400],
  });
  ok(retiredPayment.status === 400, "direct submission of the retired payment method must be rejected");
  const checkout = await request("/orders/checkout", {
    method: "POST", token: customer.token,
    body: { addressId: address.body.id, paymentMethod: "COD", couponCode: "WELCOME100", note: "Investor E2E" },
  });
  const order = checkout.body;
  ok(order.id && order.status === "PLACED" && order.paymentMethod === "COD", "checkout must persist a COD order");
  record("Production payment boundary", "COD checkout succeeded; simulated payment was absent and rejected at API ingress");

  const seller = await login("9811111111", "seller");
  const sellerMe = await request("/auth/me", { token: seller.token });
  const shopAccess = sellerMe.body.access.shops.find((row) => row.shopId === shop.id);
  ok(shopAccess?.owner && shopAccess.permissions.includes("orders.accept"), "shop owner permissions must resolve from backend RBAC");
  const queue = await request(`/seller/shops/${shop.id}/orders?q=${encodeURIComponent(order.code)}`, { token: seller.token });
  ok(queue.body.data.some((row) => row.id === order.id), "seller must see the same persisted order");
  await request(`/seller/shops/${shop.id}/orders/${order.id}/accept`, { method: "POST", token: seller.token, body: { note: "Accepted in E2E" } });
  await request(`/seller/shops/${shop.id}/orders/${order.id}/pack`, { method: "POST", token: seller.token, body: { note: "Packed in E2E" } });
  const riders = await request(`/seller/shops/${shop.id}/riders`, { token: seller.token });
  const rider = riders.body.find((row) => row.user.phone === "9811111120");
  ok(rider, "seeded rider must be visible to this shop only");
  const riderSession = await login("9811111120", "rider");
  await request("/rider/status", { method: "PATCH", token: riderSession.token, body: { status: "ONLINE" } });
  await request(`/seller/shops/${shop.id}/orders/${order.id}/assign`, { method: "POST", token: seller.token, body: { riderId: rider.id } });

  const riderJobs = await request("/rider/deliveries", { token: riderSession.token });
  ok(riderJobs.body.some((row) => row.orderId === order.id), "assigned order must appear in rider's own queue");
  await request(`/rider/orders/${order.id}/delivery`, { method: "PATCH", token: riderSession.token, body: { status: "PICKED_UP" } });
  await request(`/seller/shops/${shop.id}/orders/${order.id}/dispatch`, { method: "POST", token: seller.token, body: { note: "Dispatched in E2E" } });
  await request(`/rider/orders/${order.id}/delivery`, { method: "PATCH", token: riderSession.token, body: { status: "EN_ROUTE" } });
  await request(`/rider/orders/${order.id}/delivery`, { method: "PATCH", token: riderSession.token, body: { status: "DELIVERED", podNote: "Handed to customer", codCollected: true } });
  const delivered = await request(`/orders/${order.id}`, { token: customer.token });
  ok(delivered.body.status === "DELIVERED" && delivered.body.tracking.deliveryStatus === "DELIVERED", "customer order and delivery states must agree");
  record("Seller/rider delivery", "same order accepted, packed, assigned, dispatched and delivered through scoped APIs");

  const review = await request(`/orders/${order.id}/review`, { method: "POST", token: customer.token, body: { rating: 5, comment: "Verified end-to-end test order" } });
  const sellerReviews = await request(`/seller/shops/${shop.id}/reviews?q=${encodeURIComponent(order.code)}`, { token: seller.token });
  ok(sellerReviews.body.data.some((row) => row.id === review.body.id), "seller must see customer's persisted review");
  await request(`/seller/shops/${shop.id}/reviews/${review.body.id}/reply`, { method: "POST", token: seller.token, body: { reply: "Thank you from Namaste Kirana" } });
  const publicReviews = await request(`/shops/${shop.id}/reviews`);
  ok(publicReviews.body.reviews.some((row) => row.id === review.body.id && row.sellerReply), "seller reply must be public and persisted");
  record("Reviews", "delivered-order review and seller reply round-tripped through APIs");

  const ticket = await request("/support/tickets", { method: "POST", token: customer.token, body: { subject: "Investor E2E support", category: "order", orderId: order.id, message: "Please confirm this ticket is persisted." } });
  const admin = await login("9800000001", "admin");
  const overview = await request("/admin/overview", { token: admin.token });
  ok(overview.body.orders.total >= 4 && overview.body.shops.total >= 3, "admin metrics must reflect database records");
  const adminTickets = await request("/admin/support/tickets", { token: admin.token });
  ok(adminTickets.body.some((row) => row.id === ticket.body.id), "admin must see customer ticket");
  await request(`/admin/support/tickets/${ticket.body.id}/reply`, { method: "POST", token: admin.token, body: { body: "Confirmed by platform support." } });
  const ticketAfter = await request(`/support/tickets/${ticket.body.id}`, { token: customer.token });
  ok(ticketAfter.body.messages.some((row) => row.isStaff), "customer must see persisted staff reply");
  const users = await request("/admin/users?q=9899999998", { token: admin.token });
  const testUser = users.body.find((row) => row.phone === "9899999998");
  await request(`/admin/users/${testUser.id}/suspend`, { method: "POST", token: admin.token });
  const suspended = await request("/admin/users?q=9899999998", { token: admin.token });
  ok(suspended.body.find((row) => row.id === testUser.id).status === "SUSPENDED", "admin suspension must persist/refetch");
  await request(`/admin/users/${testUser.id}/reactivate`, { method: "POST", token: admin.token });
  let audit;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    audit = await request(`/admin/audit?entityId=${testUser.id}`, { token: admin.token });
    if (audit.body.items?.length >= 2) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  ok(audit.body.items?.length >= 2, "admin mutations must be audit logged");
  record("Admin/support", "live metrics, support reply, user suspend/reactivate and audit trail verified");

  // Reuse the already authenticated rider session. Besides keeping the journey
  // below the public OTP endpoint's per-IP abuse limit, this proves that an
  // active shop member with limited permissions cannot manage roles.
  const denied = await request(`/seller/shops/${shop.id}/roles`, { token: riderSession.token, expected: [403] });
  ok(denied.status === 403, "rider without rbac.manage must be denied owner-only role management");
  const customerDenied = await request("/admin/overview", { token: customer.token, expected: [403] });
  ok(customerDenied.status === 403, "customer must be denied platform admin access");
  record("RBAC boundaries", "limited rider owner-only denial and customer admin denial both returned 403");

  let notifications;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    notifications = await request("/notifications", { token: customer.token });
    if (notifications.body.items.some((row) => row.data?.orderId === order.id)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  ok(notifications.body.items.some((row) => row.data?.orderId === order.id), "order lifecycle must produce persisted customer notifications");
  record("Notifications", `${notifications.body.items.filter((row) => row.data?.orderId === order.id).length} persisted updates for the E2E order`);

  const orders = await request("/orders", { token: customer.token });
  ok(orders.body.some((row) => row.id === order.id && row.status === "DELIVERED" && row.paymentStatus === "PAID"), "final order history must show delivered and paid");
  console.log("\nInvestor-critical E2E API verification PASSED");
  console.log(JSON.stringify({ orderId: order.id, orderCode: order.code, evidence }, null, 2));
}

main().catch((error) => {
  console.error("\nInvestor-critical E2E API verification FAILED");
  console.error(error);
  process.exitCode = 1;
});

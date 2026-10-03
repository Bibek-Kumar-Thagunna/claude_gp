/**
 * GoPasal end-to-end lifecycle verification.
 *
 *   node scripts/verify-lifecycle-e2e.mjs
 *
 * Drives a running API exactly as the four consoles do — customer, seller,
 * rider, admin — across the happy path and the branches that actually break in
 * practice: a rider going en route before the shop dispatches, a failed
 * delivery and its return-to-shop custody chain, rejection, customer
 * cancellation, staff invitation, and every admin read.
 *
 * Every step records a status instead of throwing, so one failure does not mask
 * the rest of the run; the exit summary lists only what broke.
 *
 * Requires a seeded database (`pnpm db:seed`) and the development SMS transport,
 * which returns the verification code on the request itself. Sign-in is
 * deliberately paced: `/auth/otp/request` allows five requests a minute per IP
 * and one a minute per number, and the driver waits those limits out rather
 * than pretending they are not there.
 */
import { readFileSync } from "node:fs";

// Point at any running GoPasal API. Defaults to the local dev server.
const BASE = process.env.GOPASAL_API ?? "http://localhost:4000/api/v1";
// Only used as a fallback: the dev OTP transport returns `developmentCode` on
// the request itself, so the outbox is read only when that field is absent.
const OUTBOX =
  process.env.SMS_DEV_OUTBOX_FILE ??
  new URL("../apps/api/tmp/sms-outbox.jsonl", import.meta.url).pathname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
let n = 0;
let section = "";

function head(title) {
  section = title;
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 58 - title.length))}`);
}
function record(name, ok, detail = "") {
  n += 1;
  results.push({ n, section, name, ok, detail });
  console.log(`${String(n).padStart(2, "0")} ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

async function call(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  return { status: res.status, ok: res.ok, body: json, text };
}
const why = (r) => `${r.status} ${(r.text ?? "").slice(0, 180)}`;

function latestOtp(phone) {
  let raw = "";
  try {
    raw = readFileSync(OUTBOX, "utf8");
  } catch {
    return null;
  }
  const lines = raw.trim().split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const row = JSON.parse(lines[i]);
    // Only the verification SMS. An invitation to the same number also carries
    // a six-digit code, and matching that one is how a driver fools itself.
    if (row.to === phone && /verification code/i.test(row.message ?? "")) {
      return (String(row.message).match(/\b(\d{6})\b/) ?? [])[1] ?? null;
    }
  }
  return null;
}

let lastOtpAt = 0;
/** At most one OTP request every 15s across the whole run: the route allows 5/min per IP. */
async function otpRequest(phone) {
  const since = Date.now() - lastOtpAt;
  if (since < 15_000) await sleep(15_000 - since);
  lastOtpAt = Date.now();
  return call("POST", "/auth/otp/request", { body: { phone } });
}

async function login(phone, label) {
  // The dev transport hands the code straight back on the request
  // (`developmentCode`), so there is no outbox parsing and no race. Throttling
  // is real and correct — 5 requests per minute per IP, 60s per phone — so the
  // driver waits it out rather than hammering.
  let code = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const req = await otpRequest(phone);
    if (req.ok) {
      code = req.body?.developmentCode ?? latestOtp(phone);
      break;
    }
    if (req.status === 429) {
      // Either the 60s per-phone cooldown or the per-IP window. Both clear
      // within about a minute; anything shorter just burns another slot.
      const stated = Number((req.text.match(/wait (\d+) second/i) ?? [])[1] ?? 0);
      await sleep(Math.max(stated + 3, 65) * 1000);
      continue;
    }
    record(`login ${label}`, false, why(req));
    return null;
  }
  if (!code) {
    record(`login ${label}`, false, "could not obtain a verification code");
    return null;
  }
  const verify = await call("POST", "/auth/otp/verify", { body: { phone, code } });
  const token = verify.body?.accessToken ?? verify.body?.tokens?.accessToken;
  record(`login ${label} (${phone})`, Boolean(token), token ? "" : why(verify));
  return token ?? null;
}

const A = {}; // actors
const ctx = {};

/** Place a fresh COD order as the customer; returns its id. */
async function placeOrder(note) {
  await call("DELETE", "/cart", { token: A.customer });
  await call("POST", "/cart/items", { token: A.customer, body: { productId: ctx.productId, qty: 2 } });
  const out = await call("POST", "/orders/checkout", {
    token: A.customer,
    body: { addressId: ctx.addressId, paymentMethod: "COD", useGoCoins: false, note },
  });
  return { id: out.body?.id ?? null, code: out.body?.code ?? null, res: out };
}

async function main() {
  // ══════════════════════════ SIGN IN ═══════════════════════════════════════
  head("Sign-in (OTP)");
  // Sequential, spaced. `/auth/otp/request` allows 5 per minute per IP, so
  // four parallel sign-ins lose three of themselves to the throttler — which is
  // the endpoint behaving correctly, not a defect to route around.
  A.customer = await login("9840000002", "customer");
  A.seller = await login("9811111111", "seller owner");
  A.rider = await login("9811111120", "rider");
  A.admin = await login("9800000001", "platform admin");
  if (!A.customer || !A.seller || !A.rider) return finish();

  // ══════════════════════════ SETUP ═════════════════════════════════════════
  head("Catalog & shop context");
  const shops = await call("GET", "/shops", { token: A.customer });
  const shop = (shops.body?.data ?? []).find((s) => s.slug === "namaste-kirana");
  if (!record("customer browses shops", Boolean(shop), shop?.name ?? why(shops))) return finish();

  const products = await call("GET", `/shops/${shop.slug}/products`, { token: A.customer });
  const product = (products.body?.data ?? [])[0];
  if (!record("customer lists products", Boolean(product), product?.name ?? why(products))) return finish();
  ctx.productId = product.id;

  const addrs = await call("GET", "/users/me/addresses", { token: A.customer });
  ctx.addressId = (addrs.body?.data ?? addrs.body ?? [])[0]?.id;
  if (!record("customer has a delivery address", Boolean(ctx.addressId), why(addrs))) return finish();

  const myShops = await call("GET", "/seller/shops", { token: A.seller });
  ctx.shopId = (myShops.body?.data ?? myShops.body ?? []).find((s) => s.slug === "namaste-kirana")?.id;
  if (!record("seller resolves shop", Boolean(ctx.shopId), ctx.shopId ?? why(myShops))) return finish();

  const riders = await call("GET", `/seller/shops/${ctx.shopId}/riders`, { token: A.seller });
  ctx.riderId = (riders.body?.data ?? riders.body ?? [])[0]?.id;
  record("seller lists riders", Boolean(ctx.riderId), ctx.riderId ?? why(riders));

  // ══════════════════════════ A. HAPPY PATH ═════════════════════════════════
  head("A. Happy path — seller dispatches, then rider delivers");
  {
    const placed = await placeOrder("flow A");
    if (record("customer places order", Boolean(placed.id), placed.code ?? why(placed.res))) {
      const id = placed.id;
      record("seller accepts", (await call("POST", `/seller/shops/${ctx.shopId}/orders/${id}/accept`, { token: A.seller, body: {} })).ok);
      record("seller packs", (await call("POST", `/seller/shops/${ctx.shopId}/orders/${id}/pack`, { token: A.seller, body: {} })).ok);
      await call("PATCH", "/rider/status", { token: A.rider, body: { status: "ONLINE" } });
      const assign = await call("POST", `/seller/shops/${ctx.shopId}/orders/${id}/assign`, { token: A.seller, body: { riderId: ctx.riderId } });
      record("seller assigns rider", assign.ok, assign.ok ? "" : why(assign));
      const dispatch = await call("POST", `/seller/shops/${ctx.shopId}/orders/${id}/dispatch`, { token: A.seller, body: {} });
      record("seller dispatches", dispatch.ok, dispatch.ok ? "" : why(dispatch));

      const afterDispatch = await call("GET", `/orders/${id}`, { token: A.customer });
      record("customer sees out-for-delivery after dispatch", afterDispatch.body?.status === "OUT_FOR_DELIVERY",
        `order=${afterDispatch.body?.status} delivery=${afterDispatch.body?.tracking?.deliveryStatus}`);
      record("tracking hides rider until actually en route", afterDispatch.body?.tracking?.rider === null,
        afterDispatch.body?.tracking?.rider ? "rider exposed while still at shop" : "correct");

      record("rider picks up", (await call("PATCH", `/rider/orders/${id}/delivery`, { token: A.rider, body: { status: "PICKED_UP" } })).ok);
      record("rider goes en route", (await call("PATCH", `/rider/orders/${id}/delivery`, { token: A.rider, body: { status: "EN_ROUTE" } })).ok);
      const ping = await call("POST", "/rider/ping", { token: A.rider, body: { lat: 27.6938, lng: 85.3423, accuracy: 8 } });
      record("rider pings location", ping.ok, ping.ok ? "" : why(ping));

      const live = await call("GET", `/orders/${id}`, { token: A.customer });
      record("customer sees live rider", Boolean(live.body?.tracking?.rider), live.body?.tracking?.rider?.name ?? "tracking.rider null");

      const delivered = await call("PATCH", `/rider/orders/${id}/delivery`, {
        token: A.rider, body: { status: "DELIVERED", podNote: "Handed over at the gate", codCollected: true },
      });
      record("rider delivers", delivered.ok, delivered.ok ? "" : why(delivered));
      const done = await call("GET", `/orders/${id}`, { token: A.customer });
      record("order reaches DELIVERED", done.body?.status === "DELIVERED", `order=${done.body?.status}`);
    }
  }

  // ══════════════════════════ B. RIDER-FIRST ════════════════════════════════
  head("B. Rider goes en route before the seller dispatches");
  {
    const placed = await placeOrder("flow B");
    if (record("customer places order", Boolean(placed.id), placed.code ?? why(placed.res))) {
      const id = placed.id;
      await call("POST", `/seller/shops/${ctx.shopId}/orders/${id}/accept`, { token: A.seller, body: {} });
      await call("PATCH", "/rider/status", { token: A.rider, body: { status: "ONLINE" } });

      // Before packing, the rider must NOT be able to drag the order forward.
      await call("POST", `/seller/shops/${ctx.shopId}/orders/${id}/assign`, { token: A.seller, body: { riderId: ctx.riderId } });
      await call("PATCH", `/rider/orders/${id}/delivery`, { token: A.rider, body: { status: "PICKED_UP" } });
      const early = await call("PATCH", `/rider/orders/${id}/delivery`, { token: A.rider, body: { status: "EN_ROUTE" } });
      record("en route before packing is refused", early.status === 400, `${early.status} ${early.body?.message ?? ""}`);

      const stillAccepted = await call("GET", `/orders/${id}`, { token: A.customer });
      record("refusal left the order untouched", stillAccepted.body?.status === "ACCEPTED",
        `order=${stillAccepted.body?.status} delivery=${stillAccepted.body?.tracking?.deliveryStatus}`);

      // Now pack, and let the rider — not the seller — carry it forward.
      await call("POST", `/seller/shops/${ctx.shopId}/orders/${id}/pack`, { token: A.seller, body: {} });
      const enroute = await call("PATCH", `/rider/orders/${id}/delivery`, { token: A.rider, body: { status: "EN_ROUTE" } });
      record("rider en route advances a packed order", enroute.ok, enroute.ok ? "" : why(enroute));
      const seen = await call("GET", `/orders/${id}`, { token: A.customer });
      record("customer sees it without seller dispatch", seen.body?.status === "OUT_FOR_DELIVERY", `order=${seen.body?.status}`);
      ctx.flowB = id;
    }
  }

  // ══════════════════════════ C. FAILED + RETURN ════════════════════════════
  head("C. Failed delivery and the return-to-shop custody chain");
  {
    const id = ctx.flowB;
    if (id) {
      const failed = await call("PATCH", `/rider/orders/${id}/delivery`, {
        token: A.rider, body: { status: "FAILED", failReason: "Customer did not answer the door" },
      });
      record("rider records a failure", failed.ok, failed.ok ? "" : why(failed));

      const earlyCancel = await call("POST", `/orders/${id}/cancel`, { token: A.customer, body: { reason: "changed mind" } });
      record("customer cancel blocked while parcel is out", earlyCancel.status === 403,
        `${earlyCancel.status} ${(earlyCancel.body?.message ?? "").slice(0, 90)}`);

      const returning = await call("PATCH", `/seller/shops/${ctx.shopId}/orders/${id}/delivery`, {
        token: A.seller, body: { status: "RETURNING_TO_SHOP" },
      });
      record("parcel marked returning to shop", returning.ok, returning.ok ? "" : why(returning));

      const riderSelfConfirm = await call("PATCH", `/rider/orders/${id}/delivery`, {
        token: A.rider, body: { status: "RETURNED_TO_SHOP", returnNote: "left it outside" },
      });
      record("rider cannot self-confirm the shop received it", riderSelfConfirm.status === 403, `${riderSelfConfirm.status}`);

      const returned = await call("PATCH", `/seller/shops/${ctx.shopId}/orders/${id}/delivery`, {
        token: A.seller, body: { status: "RETURNED_TO_SHOP", returnNote: "Parcel back on the shelf, intact" },
      });
      record("shop confirms receipt", returned.ok, returned.ok ? "" : why(returned));

      const cancel = await call("POST", `/orders/${id}/cancel`, { token: A.customer, body: { reason: "no longer needed" } });
      record("customer can cancel once parcel is back", cancel.ok, cancel.ok ? "" : why(cancel));
    }
  }

  // ══════════════════════════ D. REJECT ═════════════════════════════════════
  head("D. Seller rejects a new order");
  {
    const placed = await placeOrder("flow D");
    if (record("customer places order", Boolean(placed.id), placed.code ?? why(placed.res))) {
      const rej = await call("POST", `/seller/shops/${ctx.shopId}/orders/${placed.id}/reject`, {
        token: A.seller, body: { reason: "Out of stock right now" },
      });
      record("seller rejects", rej.ok, rej.ok ? "" : why(rej));
      const seen = await call("GET", `/orders/${placed.id}`, { token: A.customer });
      record("customer sees REJECTED", seen.body?.status === "REJECTED", `order=${seen.body?.status}`);
      const late = await call("POST", `/seller/shops/${ctx.shopId}/orders/${placed.id}/accept`, { token: A.seller, body: {} });
      record("a rejected order cannot be accepted later", !late.ok, `${late.status}`);
    }
  }

  // ══════════════════════════ E. CUSTOMER CANCEL ════════════════════════════
  head("E. Customer cancels before the shop acts");
  {
    const placed = await placeOrder("flow E");
    if (record("customer places order", Boolean(placed.id), placed.code ?? why(placed.res))) {
      const cancel = await call("POST", `/orders/${placed.id}/cancel`, { token: A.customer, body: { reason: "ordered by mistake" } });
      record("customer cancels", cancel.ok, cancel.ok ? "" : why(cancel));
      const seen = await call("GET", `/orders/${placed.id}`, { token: A.customer });
      record("order is CANCELLED", seen.body?.status === "CANCELLED", `order=${seen.body?.status}`);
    }
  }

  // ══════════════════════════ F. INVITES ════════════════════════════════════
  head("F. Staff invitation");
  {
    const roles = await call("GET", `/seller/shops/${ctx.shopId}/roles`, { token: A.seller });
    const role = (roles.body?.data ?? roles.body ?? []).find((r) => r.name !== "Owner");
    record("seller lists assignable roles", Boolean(role), role?.name ?? why(roles));
    if (role) {
      const phone = `98${Math.floor(10000000 + Math.random() * 89999999)}`;
      const invite = await call("POST", `/seller/shops/${ctx.shopId}/invites`, {
        token: A.seller, body: { phone, roleId: role.id, name: "Audit Staff" },
      });
      record("seller creates invite", invite.ok, invite.ok ? `delivery=${invite.body?.invite?.delivery}` : why(invite));
      const link = invite.body?.shareOnce?.link ?? "";
      const token = link.split("/join/")[1];
      record("invite returns a one-time link", Boolean(token), link || "no link");

      if (token) {
        const preview = await call("GET", `/invites/${token}`);
        record("invite link previews without auth", preview.ok,
          preview.ok ? `${preview.body?.shop?.name ?? ""} as ${preview.body?.role?.name ?? ""}` : why(preview));

        const invitee = await login(phone, "invited staff");
        if (invitee) {
          const pending = await call("GET", "/invites/mine/pending", { token: invitee });
          const count = Array.isArray(pending.body) ? pending.body.length : (pending.body?.data?.length ?? 0);
          record("invitee sees the pending invite", pending.ok && count > 0, pending.ok ? `${count} pending` : why(pending));

          const accept = await call("POST", "/invites/accept", { token: invitee, body: { token } });
          record("invitee accepts", accept.ok, accept.ok ? "" : why(accept));

          const staff = await call("GET", `/seller/shops/${ctx.shopId}/staff`, { token: A.seller });
          record("new member appears on the team", JSON.stringify(staff.body ?? "").includes(phone),
            staff.ok ? "" : why(staff));

          const reuse = await call("POST", "/invites/accept", { token: invitee, body: { token } });
          record("the same invite cannot be used twice", !reuse.ok, `${reuse.status} ${(reuse.body?.message ?? "").slice(0, 70)}`);
        }
      }
    }
  }

  // ══════════════════════════ G. ADMIN ══════════════════════════════════════
  head("G. Admin console");
  if (A.admin) {
    for (const [label, path] of [
      ["overview", "/admin/overview"],
      ["shops", "/admin/shops?page=1&limit=10"],
      ["users", "/admin/users?page=1&limit=10"],
      ["finance overview", "/admin/finance/overview"],
      ["finance ledger", "/admin/finance/ledger?page=1&limit=10"],
      ["refund queue", "/admin/finance/refunds?page=1&limit=10"],
      ["settlements", "/admin/finance/settlements?page=1&limit=10"],
      ["orders trend", "/admin/analytics/orders-trend"],
      ["onboarding queue", "/admin/onboarding/applications?page=1&limit=10"],
      ["audit trail", "/admin/audit?page=1&limit=10"],
      ["coupons", "/admin/coupons"],
      ["policies", "/admin/policies"],
      ["fraud flags", "/admin/fraud?page=1&limit=10"],
      ["products moderation", "/admin/products?page=1&limit=10"],
      ["platform config", "/admin/config"],
    ]) {
      const r = await call("GET", path, { token: A.admin });
      record(`admin reads ${label}`, r.ok, r.ok ? "" : why(r));
    }
  }

  finish();
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${"=".repeat(66)}`);
  console.log(`${results.length - failed.length}/${results.length} steps passed`);
  if (failed.length) {
    console.log("\nFAILURES");
    for (const f of failed) console.log(`  [${f.section}] ${f.name}\n      ${f.detail}`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error("driver crashed:", e); finish(); });

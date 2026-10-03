#!/usr/bin/env node

/**
 * Local proof for seller/admin OTP, invitation acceptance and default-deny RBAC.
 * It uses only public/guarded HTTP endpoints and cleans up the memberships it
 * creates. The accepted invitation remains as the audit history it is designed
 * to be; the invited accounts can be reused on later runs.
 */
const base = process.env.GOPASAL_API_URL ?? "http://localhost:4000/api/v1";
const sellerInviteePhone = process.env.GOPASAL_TEST_SELLER_INVITEE ?? "9899999971";
const adminInviteePhone = process.env.GOPASAL_TEST_ADMIN_INVITEE ?? "9899999972";

function check(value, message) {
  if (!value) throw new Error(`Assertion failed: ${message}`);
}

function pass(flow, detail) {
  console.log(`✓ ${flow}: ${detail}`);
}

async function call(path, { method = "GET", token, body, expected = [200, 201] } = {}) {
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

async function login(phone, surface) {
  const challenge = await call("/auth/otp/request", {
    method: "POST",
    body: { phone, purpose: "login" },
  });
  check(/^\d{6}$/.test(challenge.body.developmentCode ?? ""), "local API must return a six-digit development OTP");
  check(challenge.body.delivered === false, "local log transport must not claim SMS delivery");
  const verified = await call("/auth/otp/verify", {
    method: "POST",
    body: { phone, code: challenge.body.developmentCode, purpose: "login", surface },
  });
  check(verified.body.tokens?.accessToken, `${surface} login must return a real token`);
  return { token: verified.body.tokens.accessToken, user: verified.body.user };
}

async function main() {
  const health = await call("/health");
  check(health.body.status === "ok", "API must be healthy");

  const owner = await login("9811111111", "seller");
  const ownerMe = await call("/auth/me", { token: owner.token });
  const owned = ownerMe.body.access.shops.find((shop) => shop.owner && shop.status === "ACTIVE");
  check(owned?.permissions.includes("team.invite"), "owner must resolve team.invite from backend RBAC");
  const shopRoles = await call(`/seller/shops/${owned.shopId}/roles`, { token: owner.token });
  const deliveryRole = shopRoles.body.find((role) => role.name === "Delivery" && !role.isPrivileged);
  check(deliveryRole, "Delivery role must be assignable");

  const shopIssued = await call(`/seller/shops/${owned.shopId}/invites`, {
    method: "POST",
    token: owner.token,
    body: { phone: sellerInviteePhone, roleId: deliveryRole.id, name: "RBAC Seller Invitee", note: "Delivery access verification" },
  });
  check(/^\d{6}$/.test(shopIssued.body.shareOnce.code), "seller invite must issue a six-digit share-once code");
  check(shopIssued.body.invite.delivery === "development: not delivered", "local seller invitation must not claim handset delivery");
  const shopToken = shopIssued.body.shareOnce.link.split("/").pop();
  const shopPreview = await call(`/invites/${encodeURIComponent(shopToken)}`);
  check(shopPreview.body.scope === "SHOP" && shopPreview.body.phoneMasked, "shop link must expose a safe public preview");

  const invitedSeller = await login(sellerInviteePhone, "seller");
  const sellerWrongConsole = await call("/invites/accept", {
    method: "POST",
    token: invitedSeller.token,
    body: { code: shopIssued.body.shareOnce.code, scope: "PLATFORM" },
    expected: [404],
  });
  check(sellerWrongConsole.status === 404, "shop code must not activate through the admin scope");
  await call("/invites/accept", {
    method: "POST",
    token: invitedSeller.token,
    body: { code: shopIssued.body.shareOnce.code, scope: "SHOP" },
  });
  const sellerMe = await call("/auth/me", { token: invitedSeller.token });
  const sellerAccess = sellerMe.body.access.shops.find((shop) => shop.shopId === owned.shopId);
  check(sellerAccess?.permissions.includes("delivery.view"), "accepted seller invite must activate the selected role");
  check(!sellerAccess.permissions.includes("team.invite"), "Delivery role must not gain team administration");
  const sellerDenied = await call(`/seller/shops/${owned.shopId}/staff`, { token: invitedSeller.token, expected: [403] });
  check(sellerDenied.status === 403, "backend must deny team roster to Delivery role");
  const roster = await call(`/seller/shops/${owned.shopId}/staff`, { token: owner.token });
  const invitedMembership = roster.body.find((row) => row.user.id === invitedSeller.user.id);
  check(invitedMembership, "accepted shop invitation must create a visible membership");
  await call(`/seller/shops/${owned.shopId}/staff/${invitedMembership.id}`, { method: "DELETE", token: owner.token });
  pass("Seller auth and invitation", "six-digit OTP, secure invite acceptance, scoped membership and 403 default-deny verified");

  const superAdmin = await login("9800000001", "admin");
  const privacy = await call("/admin/privacy", { token: superAdmin.token });
  check(typeof privacy.body.counts?.due === "number", "super admin must see the retention dashboard");
  const sellerPrivacyDenied = await call("/admin/privacy", { token: owner.token, expected: [403] });
  check(sellerPrivacyDenied.status === 403, "seller owner must not read platform privacy records");
  const platformRoles = await call("/admin/roles", { token: superAdmin.token });
  const supportRole = platformRoles.body.find((role) => role.name === "Support Agent" && !role.isPrivileged);
  check(supportRole, "Support Agent role must be assignable");
  const platformIssued = await call("/admin/staff/invites", {
    method: "POST",
    token: superAdmin.token,
    body: { phone: adminInviteePhone, roleId: supportRole.id, name: "RBAC Admin Invitee", note: "Support access verification" },
  });
  check(platformIssued.body.invite.delivery === "development: not delivered", "local admin invitation must not claim handset delivery");
  const platformToken = platformIssued.body.shareOnce.link.split("/").pop();
  const platformPreview = await call(`/invites/${encodeURIComponent(platformToken)}`);
  check(platformPreview.body.scope === "PLATFORM", "platform link must resolve to the admin scope");

  const invitedAdmin = await login(adminInviteePhone, "admin");
  const beforeAccept = await call("/auth/me", { token: invitedAdmin.token });
  check(beforeAccept.body.access.platform.length === 0, "new invited account must have no access before acceptance");
  const adminWrongConsole = await call("/invites/accept", {
    method: "POST",
    token: invitedAdmin.token,
    body: { code: platformIssued.body.shareOnce.code, scope: "SHOP" },
    expected: [404],
  });
  check(adminWrongConsole.status === 404, "platform code must not activate through the seller scope");
  await call("/invites/accept", {
    method: "POST",
    token: invitedAdmin.token,
    body: { code: platformIssued.body.shareOnce.code, scope: "PLATFORM" },
  });
  const afterAccept = await call("/auth/me", { token: invitedAdmin.token });
  check(afterAccept.body.access.platform.includes("support.view"), "accepted platform invite must activate selected permissions");
  check(!afterAccept.body.access.platform.includes("rbac.platform.manage"), "Support Agent must not gain role management");
  const adminDenied = await call("/admin/roles", { token: invitedAdmin.token, expected: [403] });
  check(adminDenied.status === 403, "backend must deny platform role management to Support Agent");
  const supportPrivacyDenied = await call("/admin/privacy", { token: invitedAdmin.token, expected: [403] });
  check(supportPrivacyDenied.status === 403, "Support Agent must not read privacy records");
  const supportPurgeDenied = await call("/admin/privacy/runs", { method: "POST", token: invitedAdmin.token, expected: [403] });
  check(supportPurgeDenied.status === 403, "Support Agent must not launch retention processing");
  await call(`/admin/staff/${invitedAdmin.user.id}`, { method: "DELETE", token: superAdmin.token });
  pass("Admin auth and invitation", "pre-accept default deny, scoped acceptance, real permission grant and privacy/RBAC isolation verified");

  pass("Authentication contract", "seller and admin both use six-digit expiring OTPs; local helper still verifies through the real endpoint");
}

main().catch((error) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

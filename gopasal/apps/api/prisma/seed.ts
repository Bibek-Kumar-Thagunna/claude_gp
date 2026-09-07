/* eslint-disable no-console */
/**
 * GoPasal database seed — idempotent.
 *
 * Safe to run repeatedly (`pnpm db:seed`); it upserts by natural keys
 * (phone, slug, code, [scope,shopId,name], [key,version]) so re-running never
 * duplicates. It creates a realistic slice of the platform so all three
 * surfaces (customer, seller, admin) are demoable end-to-end the moment the
 * app boots — including a live rider-tracking order that is OUT_FOR_DELIVERY.
 *
 * Permissions + role templates are sourced from the SAME catalogue the RBAC
 * guard uses (src/rbac/permissions.catalog.ts), so seed and runtime never drift.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import {
  ALL_PERMISSIONS,
  SHOP_PERMISSIONS,
  PLATFORM_PERMISSIONS,
  DEFAULT_SHOP_ROLES,
  DEFAULT_PLATFORM_ROLES,
  type PermScope,
  type RoleDef,
} from '../src/rbac/permissions.catalog';

/**
 * Fail fast with an actionable message instead of Prisma's generic
 * "Environment variable not found: DATABASE_URL".
 *
 * `new PrismaClient()` does not read `.env` — only the Prisma CLI does, and it
 * then passes it down to the seed process. So this file must be launched as
 * `prisma db seed` (which `pnpm db:seed` does), not as a bare
 * `ts-node prisma/seed.ts`.
 */
if (!process.env.DATABASE_URL) {
  console.error(
    'DATABASE_URL is not set.\n' +
      '  Run the seed through the Prisma CLI so apps/api/.env is loaded:\n' +
      '    pnpm --filter @gopasal/api db:seed      (or: pnpm db:seed from the repo root)\n' +
      '  A bare `ts-node prisma/seed.ts` will not load .env.',
  );
  process.exit(1);
}

const prisma = new PrismaClient();

// ── helpers ──────────────────────────────────────────────────────────────────
function permsFor(def: RoleDef, scope: PermScope): string[] {
  if (def.permissions === '*') {
    return (scope === 'PLATFORM' ? PLATFORM_PERMISSIONS : SHOP_PERMISSIONS).map((p) => p.key);
  }
  return def.permissions;
}

/** Create/update a role by its (scope, shopId, name) identity and reset its perms. */
async function ensureRole(opts: {
  scope: PermScope;
  shopId?: string | null;
  name: string;
  description?: string;
  isSystem?: boolean;
  isPrivileged?: boolean;
  permissions: string[];
}) {
  const shopId = opts.shopId ?? null;
  let role = await prisma.role.findFirst({ where: { scope: opts.scope, shopId, name: opts.name } });
  const data = {
    scope: opts.scope,
    shopId,
    name: opts.name,
    description: opts.description,
    isSystem: opts.isSystem ?? false,
    isPrivileged: opts.isPrivileged ?? false,
  };
  role = role
    ? await prisma.role.update({ where: { id: role.id }, data })
    : await prisma.role.create({ data });

  await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
  if (opts.permissions.length) {
    await prisma.rolePermission.createMany({
      data: opts.permissions.map((permissionKey) => ({ roleId: role.id, permissionKey })),
      skipDuplicates: true,
    });
  }
  return role;
}

function ensureUser(phone: string, data: Prisma.UserUncheckedCreateInput) {
  const { phone: _p, ...rest } = data;
  return prisma.user.upsert({ where: { phone }, create: { phone, ...rest }, update: rest });
}

function ensureShopMembership(userId: string, shopId: string, roleId: string, status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE') {
  return prisma.shopMembership.upsert({
    where: { userId_shopId: { userId, shopId } },
    create: { userId, shopId, roleId, status },
    update: { roleId, status },
  });
}

async function ensureProduct(
  shopId: string,
  categoryId: string | null,
  data: Omit<Prisma.ProductUncheckedCreateInput, 'shopId'>,
  variants: Prisma.ProductVariantUncheckedCreateInput[] = [],
) {
  let product = await prisma.product.findFirst({ where: { shopId, name: data.name } });
  if (!product) {
    product = await prisma.product.create({ data: { ...data, shopId, categoryId: categoryId ?? undefined } });
    if (variants.length) {
      await prisma.productVariant.createMany({
        data: variants.map((v) => ({ ...v, productId: product!.id })),
      });
    }
  }
  return product;
}

async function main() {
  console.log('🌱  Seeding GoPasal…');

  // ── 1. Permissions (source of truth for RBAC) ──────────────────────────────
  for (const p of ALL_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      create: { key: p.key, label: p.label, description: p.description, scope: p.scope, group: p.group },
      update: { label: p.label, description: p.description, scope: p.scope, group: p.group },
    });
  }
  console.log(`   • ${ALL_PERMISSIONS.length} permissions`);

  // ── 2. System role templates ───────────────────────────────────────────────
  // PLATFORM roles are concrete (assigned directly). SHOP roles are templates
  // (shopId = null) an owner can clone; each shop also gets its own Owner role.
  const platformRoles = new Map<string, string>(); // name → roleId
  for (const def of DEFAULT_PLATFORM_ROLES) {
    const role = await ensureRole({
      scope: 'PLATFORM',
      name: def.name,
      description: def.description,
      isSystem: true,
      isPrivileged: def.isPrivileged ?? false,
      permissions: permsFor(def, 'PLATFORM'),
    });
    platformRoles.set(def.name, role.id);
  }
  for (const def of DEFAULT_SHOP_ROLES) {
    await ensureRole({
      scope: 'SHOP',
      shopId: null,
      name: def.name,
      description: def.description,
      isSystem: true,
      isPrivileged: def.isPrivileged ?? false,
      permissions: permsFor(def, 'SHOP'),
    });
  }
  console.log(`   • ${DEFAULT_PLATFORM_ROLES.length} platform + ${DEFAULT_SHOP_ROLES.length} shop role templates`);

  // ── 3. Platform staff ───────────────────────────────────────────────────────
  const superAdmin = await ensureUser('9800000001', {
    phone: '9800000001',
    name: 'Platform Admin',
    email: 'admin@gopasal.com',
    isPlatformStaff: true,
  });
  await prisma.platformMembership.upsert({
    where: { userId: superAdmin.id },
    create: { userId: superAdmin.id, roleId: platformRoles.get('Super Admin')! },
    update: { roleId: platformRoles.get('Super Admin')! },
  });

  const opsAdmin = await ensureUser('9800000002', {
    phone: '9800000002',
    name: 'Ops Admin',
    email: 'ops@gopasal.com',
    isPlatformStaff: true,
  });
  await prisma.platformMembership.upsert({
    where: { userId: opsAdmin.id },
    create: { userId: opsAdmin.id, roleId: platformRoles.get('Operations Admin')! },
    update: { roleId: platformRoles.get('Operations Admin')! },
  });

  const supportAgent = await ensureUser('9800000003', {
    phone: '9800000003',
    name: 'Support Agent',
    email: 'support@gopasal.com',
    isPlatformStaff: true,
  });
  await prisma.platformMembership.upsert({
    where: { userId: supportAgent.id },
    create: { userId: supportAgent.id, roleId: platformRoles.get('Support Agent')! },
    update: { roleId: platformRoles.get('Support Agent')! },
  });
  console.log('   • platform staff: Super Admin, Ops Admin, Support Agent');

  // ── 4. Categories ────────────────────────────────────────────────────────────
  const categoryDefs = [
    { slug: 'grocery', en: 'Grocery', np: 'किराना', icon: 'ShoppingBasket', hue: 'amber', sortOrder: 1 },
    { slug: 'vegetables', en: 'Vegetables & Fruits', np: 'तरकारी र फलफूल', icon: 'Carrot', hue: 'green', sortOrder: 2 },
    { slug: 'pharmacy', en: 'Pharmacy', np: 'औषधि पसल', icon: 'Pill', hue: 'red', sortOrder: 3 },
    { slug: 'meat-fish', en: 'Meat & Fish', np: 'मासु र माछा', icon: 'Fish', hue: 'rose', sortOrder: 4 },
    { slug: 'bakery', en: 'Bakery', np: 'बेकरी', icon: 'Croissant', hue: 'orange', sortOrder: 5 },
    { slug: 'electronics', en: 'Electronics', np: 'इलेक्ट्रोनिक्स', icon: 'Smartphone', hue: 'blue', sortOrder: 6 },
  ];
  const categories = new Map<string, string>(); // slug → id
  for (const c of categoryDefs) {
    const cat = await prisma.category.upsert({ where: { slug: c.slug }, create: c, update: c });
    categories.set(c.slug, cat.id);
  }
  console.log(`   • ${categoryDefs.length} categories`);

  // ── 5. Shops (owners, staff, riders, products) ───────────────────────────────
  // Shop 1 — Namaste Kirana (Baneshwor grocery)
  const bibek = await ensureUser('9811111111', { phone: '9811111111', name: 'Bibek Shrestha', locale: 'np' });
  const namaste = await prisma.shop.upsert({
    where: { slug: 'namaste-kirana' },
    update: {},
    create: {
      slug: 'namaste-kirana',
      name: 'Namaste Kirana Pasal',
      nameNp: 'नमस्ते किराना पसल',
      description: 'Your neighbourhood grocery in Baneshwor — daily essentials, delivered by us.',
      categoryId: categories.get('grocery'),
      ownerId: bibek.id,
      status: 'ACTIVE',
      verified: true,
      approvedAt: new Date(),
      phone: '9811111111',
      area: 'Baneshwor, Kathmandu',
      fullAddress: 'Baneshwor Chowk, Kathmandu 44600',
      lat: 27.6935,
      lng: 85.342,
      deliveryRadiusKm: 4,
      hours: '7am – 9pm',
      minOrder: 200,
      emoji: '🛒',
    },
  });
  const namasteOwnerRole = await ensureRole({
    scope: 'SHOP', shopId: namaste.id, name: 'Owner',
    description: 'Full control of the shop', isSystem: true, isPrivileged: true,
    permissions: SHOP_PERMISSIONS.map((p) => p.key),
  });
  await ensureShopMembership(bibek.id, namaste.id, namasteOwnerRole.id);
  // A manager teammate (clone the Manager template into this shop)
  const managerDef = DEFAULT_SHOP_ROLES.find((r) => r.name === 'Manager')!;
  const namasteManagerRole = await ensureRole({
    scope: 'SHOP', shopId: namaste.id, name: 'Manager', description: managerDef.description,
    permissions: permsFor(managerDef, 'SHOP'),
  });
  const sita = await ensureUser('9811111112', { phone: '9811111112', name: 'Sita Rai' });
  await ensureShopMembership(sita.id, namaste.id, namasteManagerRole.id);

  await ensureProduct(namaste.id, categories.get('grocery')!, {
    name: 'Basmati Rice', nameNp: 'बासमती चामल', price: 180, mrp: 200, unit: '1 kg',
    tags: ['staple', 'rice'], trackStock: true, stock: 500,
  }, [
    { productId: '', name: '1 kg', price: 180, mrp: 200, stock: 500 },
    { productId: '', name: '5 kg', price: 860, mrp: 950, stock: 120 },
    { productId: '', name: '25 kg', price: 4100, mrp: 4500, stock: 30 },
  ]);
  await ensureProduct(namaste.id, categories.get('grocery')!, {
    name: 'Sunflower Cooking Oil', nameNp: 'सूर्यमुखी तेल', price: 320, mrp: 360, unit: '1 L',
    tags: ['oil'], trackStock: true, stock: 200,
  }, [
    { productId: '', name: '1 L', price: 320, mrp: 360, stock: 200 },
    { productId: '', name: '5 L', price: 1550, mrp: 1700, stock: 45 },
  ]);
  await ensureProduct(namaste.id, categories.get('grocery')!, {
    name: 'Wai Wai Noodles (Pack of 5)', nameNp: 'वाइ वाइ चाउचाउ', price: 110, mrp: 125, unit: 'pack of 5',
    tags: ['snacks', 'noodles'], trackStock: true, stock: 300,
  });
  await ensureProduct(namaste.id, categories.get('grocery')!, {
    name: 'Fresh Farm Eggs', nameNp: 'अण्डा', price: 220, mrp: 240, unit: '1 dozen',
    tags: ['eggs', 'dairy'], trackStock: true, stock: 80,
  });
  await ensureProduct(namaste.id, categories.get('grocery')!, {
    name: 'Masoor Daal (Red Lentils)', nameNp: 'मसुरको दाल', price: 160, unit: '1 kg',
    tags: ['lentils', 'daal'], trackStock: true, stock: 150,
  });

  // Rider for shop 1
  const hari = await ensureUser('9811111120', { phone: '9811111120', name: 'Hari Tamang' });
  const deliveryDef = DEFAULT_SHOP_ROLES.find((r) => r.name === 'Delivery')!;
  const namasteDeliveryRole = await ensureRole({
    scope: 'SHOP', shopId: namaste.id, name: 'Delivery', description: deliveryDef.description,
    permissions: permsFor(deliveryDef, 'SHOP'),
  });
  await ensureShopMembership(hari.id, namaste.id, namasteDeliveryRole.id);
  const hariRider = await prisma.rider.upsert({
    where: { userId: hari.id },
    update: { shopId: namaste.id, status: 'ON_DELIVERY' },
    create: { userId: hari.id, shopId: namaste.id, vehicleType: 'MOTORBIKE', status: 'ON_DELIVERY' },
  });

  // Shop 2 — Everest Pharmacy (Patan)
  const anjana = await ensureUser('9822222221', { phone: '9822222221', name: 'Anjana Maharjan' });
  const everest = await prisma.shop.upsert({
    where: { slug: 'everest-pharmacy' },
    update: {},
    create: {
      slug: 'everest-pharmacy',
      name: 'Everest Pharmacy',
      nameNp: 'सगरमाथा फार्मेसी',
      description: 'Trusted medicines and wellness essentials in Patan.',
      categoryId: categories.get('pharmacy'),
      ownerId: anjana.id,
      status: 'ACTIVE',
      verified: true,
      approvedAt: new Date(),
      phone: '9822222221',
      area: 'Patan, Lalitpur',
      fullAddress: 'Mangal Bazaar, Patan, Lalitpur 44700',
      lat: 27.6766,
      lng: 85.325,
      deliveryRadiusKm: 5,
      hours: '8am – 10pm',
      minOrder: 100,
      emoji: '💊',
    },
  });
  const everestOwnerRole = await ensureRole({
    scope: 'SHOP', shopId: everest.id, name: 'Owner', description: 'Full control of the shop',
    isSystem: true, isPrivileged: true, permissions: SHOP_PERMISSIONS.map((p) => p.key),
  });
  await ensureShopMembership(anjana.id, everest.id, everestOwnerRole.id);
  await ensureProduct(everest.id, categories.get('pharmacy')!, {
    name: 'Paracetamol 500mg (Strip of 10)', nameNp: 'प्यारासिटामोल', price: 25, unit: 'strip of 10',
    tags: ['medicine', 'fever'], trackStock: true, stock: 400,
  });
  await ensureProduct(everest.id, categories.get('pharmacy')!, {
    name: 'Hand Sanitizer 200ml', nameNp: 'ह्यान्ड स्यानिटाइजर', price: 150, mrp: 180, unit: '200 ml',
    tags: ['hygiene'], trackStock: true, stock: 120,
  });
  await ensureProduct(everest.id, categories.get('pharmacy')!, {
    name: 'Surgical Face Masks (Box of 50)', nameNp: 'मास्क', price: 300, mrp: 400, unit: 'box of 50',
    tags: ['hygiene', 'mask'], trackStock: true, stock: 90,
  });
  await ensureProduct(everest.id, categories.get('pharmacy')!, {
    name: 'Vitamin C Tablets', nameNp: 'भिटामिन सी', price: 210, unit: 'bottle of 60',
    tags: ['supplement'], trackStock: true, stock: 60,
  });

  // Shop 3 — Fresh Valley Veggies (Thamel) — PENDING approval (for admin demo)
  const deepak = await ensureUser('9833333331', { phone: '9833333331', name: 'Deepak Thapa' });
  const freshValley = await prisma.shop.upsert({
    where: { slug: 'fresh-valley' },
    update: {},
    create: {
      slug: 'fresh-valley',
      name: 'Fresh Valley Veggies',
      nameNp: 'फ्रेस भ्याली तरकारी',
      description: 'Farm-fresh vegetables and fruits from the Kathmandu valley.',
      categoryId: categories.get('vegetables'),
      ownerId: deepak.id,
      status: 'PENDING', // awaiting admin approval — demoes the approvals queue
      verified: false,
      phone: '9833333331',
      area: 'Thamel, Kathmandu',
      fullAddress: 'Thamel Marg, Kathmandu 44600',
      lat: 27.7154,
      lng: 85.3123,
      deliveryRadiusKm: 3,
      hours: '6am – 8pm',
      minOrder: 150,
      emoji: '🥬',
    },
  });
  const freshOwnerRole = await ensureRole({
    scope: 'SHOP', shopId: freshValley.id, name: 'Owner', description: 'Full control of the shop',
    isSystem: true, isPrivileged: true, permissions: SHOP_PERMISSIONS.map((p) => p.key),
  });
  await ensureShopMembership(deepak.id, freshValley.id, freshOwnerRole.id);
  await ensureProduct(freshValley.id, categories.get('vegetables')!, {
    name: 'Tomato', nameNp: 'गोलभेडा', price: 80, unit: '1 kg', tags: ['vegetable'], trackStock: true, stock: 100,
  });
  await ensureProduct(freshValley.id, categories.get('vegetables')!, {
    name: 'Potato', nameNp: 'आलु', price: 60, unit: '1 kg', tags: ['vegetable'], trackStock: true, stock: 250,
  }, [
    { productId: '', name: '1 kg', price: 60, stock: 250 },
    { productId: '', name: '5 kg', price: 280, stock: 60 },
  ]);
  await ensureProduct(freshValley.id, categories.get('vegetables')!, {
    name: 'Apple (Fuji)', nameNp: 'स्याउ', price: 260, mrp: 300, unit: '1 kg', tags: ['fruit'], trackStock: true, stock: 70,
  });
  console.log('   • 3 shops (2 active, 1 pending), staff, riders and products');

  // ── 6. Customers + addresses ─────────────────────────────────────────────────
  const rina = await ensureUser('9840000001', { phone: '9840000001', name: 'Rina Shakya' });
  const rinaAddr = await prisma.address.upsert({
    where: { id: `seed-addr-rina` },
    update: {},
    create: {
      id: 'seed-addr-rina', userId: rina.id, label: 'Home', recipientName: 'Rina Shakya',
      phone: '9840000001', area: 'New Baneshwor', landmark: 'Near Everest Hotel',
      fullAddress: 'New Baneshwor, Kathmandu 44600', lat: 27.698, lng: 85.3455, isDefault: true,
    },
  });
  const kiran = await ensureUser('9840000002', { phone: '9840000002', name: 'Kiran Karki' });
  const kiranAddr = await prisma.address.upsert({
    where: { id: 'seed-addr-kiran' },
    update: {},
    create: {
      id: 'seed-addr-kiran', userId: kiran.id, label: 'Home', recipientName: 'Kiran Karki',
      phone: '9840000002', area: 'Patan', landmark: 'Near Patan Durbar Square',
      fullAddress: 'Kupondole, Lalitpur 44700', lat: 27.6789, lng: 85.317, isDefault: true,
    },
  });
  const maya = await ensureUser('9840000003', { phone: '9840000003', name: 'Maya Gurung' });
  await prisma.address.upsert({
    where: { id: 'seed-addr-maya' },
    update: {},
    create: {
      id: 'seed-addr-maya', userId: maya.id, label: 'Home', recipientName: 'Maya Gurung',
      phone: '9840000003', area: 'Thamel', landmark: 'Near Thamel Chowk',
      fullAddress: 'Thamel, Kathmandu 44600', lat: 27.7149, lng: 85.3115, isDefault: true,
    },
  });
  console.log('   • 3 customers with default addresses');

  // ── 7. Platform coupon ───────────────────────────────────────────────────────
  await prisma.coupon.upsert({
    where: { code: 'WELCOME100' },
    update: {},
    create: {
      code: 'WELCOME100', type: 'FLAT', value: 100, minOrder: 500, perUserLimit: 1, isActive: true,
    },
  });
  console.log('   • coupon WELCOME100');

  // ── 8. Orders (incl. a LIVE OUT_FOR_DELIVERY order with rider tracking) ───────
  const riceNamaste = await prisma.product.findFirst({ where: { shopId: namaste.id, name: 'Basmati Rice' } });
  const oilNamaste = await prisma.product.findFirst({ where: { shopId: namaste.id, name: 'Sunflower Cooking Oil' } });
  const eggsNamaste = await prisma.product.findFirst({ where: { shopId: namaste.id, name: 'Fresh Farm Eggs' } });
  const paracetamol = await prisma.product.findFirst({ where: { shopId: everest.id, name: 'Paracetamol 500mg (Strip of 10)' } });
  const masks = await prisma.product.findFirst({ where: { shopId: everest.id, name: 'Surgical Face Masks (Box of 50)' } });

  // Order A — LIVE: out for delivery, rider en route (this drives the map demo)
  if (!(await prisma.order.findUnique({ where: { code: 'GP-100001' } }))) {
    const now = new Date();
    const subtotal = 180 + 320 + 220; // rice 1kg + oil 1L + eggs
    const deliveryFee = 40;
    const total = subtotal + deliveryFee;
    const order = await prisma.order.create({
      data: {
        code: 'GP-100001',
        customerId: rina.id,
        shopId: namaste.id,
        status: 'OUT_FOR_DELIVERY',
        addressId: rinaAddr.id,
        recipientName: 'Rina Shakya',
        recipientPhone: '9840000001',
        area: 'New Baneshwor',
        landmark: 'Near Everest Hotel',
        fullAddress: 'New Baneshwor, Kathmandu 44600',
        lat: 27.698,
        lng: 85.3455,
        subtotal,
        deliveryFee,
        total,
        paymentMethod: 'COD',
        paymentStatus: 'PENDING',
        placedAt: new Date(now.getTime() - 40 * 60000),
        acceptedAt: new Date(now.getTime() - 35 * 60000),
        packedAt: new Date(now.getTime() - 20 * 60000),
        dispatchedAt: new Date(now.getTime() - 8 * 60000),
        items: {
          create: [
            { productId: riceNamaste?.id, nameSnapshot: 'Basmati Rice', unitSnapshot: '1 kg', price: 180, qty: 1 },
            { productId: oilNamaste?.id, nameSnapshot: 'Sunflower Cooking Oil', unitSnapshot: '1 L', price: 320, qty: 1 },
            { productId: eggsNamaste?.id, nameSnapshot: 'Fresh Farm Eggs', unitSnapshot: '1 dozen', price: 220, qty: 1 },
          ],
        },
        events: {
          create: [
            { status: 'PLACED', note: 'Order placed', createdAt: new Date(now.getTime() - 40 * 60000) },
            { status: 'ACCEPTED', note: 'Accepted by shop', createdAt: new Date(now.getTime() - 35 * 60000) },
            { status: 'PACKED', note: 'Packed', createdAt: new Date(now.getTime() - 20 * 60000) },
            { status: 'OUT_FOR_DELIVERY', note: 'Hari is on the way', createdAt: new Date(now.getTime() - 8 * 60000) },
          ],
        },
      },
    });
    // Delivery + rider mid-route location (between shop 27.6935,85.342 and dest 27.698,85.3455)
    await prisma.delivery.create({
      data: {
        orderId: order.id,
        riderId: hariRider.id,
        status: 'EN_ROUTE',
        destLat: 27.698,
        destLng: 85.3455,
        distanceMeters: 1400,
        assignedAt: new Date(now.getTime() - 10 * 60000),
        pickedUpAt: new Date(now.getTime() - 8 * 60000),
        codAmount: total,
      },
    });
    await prisma.rider.update({
      where: { id: hariRider.id },
      data: { lat: 27.6958, lng: 85.3438, heading: 42, speed: 6.5, accuracy: 8, lastPingAt: new Date() },
    });
  }

  // Order B — DELIVERED (drives loyalty + a review)
  if (!(await prisma.order.findUnique({ where: { code: 'GP-100002' } }))) {
    const d = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const subtotal = 25 * 2 + 300; // 2 strips paracetamol + masks
    const deliveryFee = 30;
    const total = subtotal + deliveryFee;
    const order = await prisma.order.create({
      data: {
        code: 'GP-100002',
        customerId: kiran.id,
        shopId: everest.id,
        status: 'DELIVERED',
        addressId: kiranAddr.id,
        recipientName: 'Kiran Karki',
        recipientPhone: '9840000002',
        area: 'Patan',
        fullAddress: 'Kupondole, Lalitpur 44700',
        lat: 27.6789,
        lng: 85.317,
        subtotal,
        deliveryFee,
        total,
        paymentMethod: 'COD',
        paymentStatus: 'PAID',
        placedAt: d,
        acceptedAt: d,
        packedAt: d,
        dispatchedAt: d,
        deliveredAt: d,
        items: {
          create: [
            { productId: paracetamol?.id, nameSnapshot: 'Paracetamol 500mg (Strip of 10)', unitSnapshot: 'strip of 10', price: 25, qty: 2 },
            { productId: masks?.id, nameSnapshot: 'Surgical Face Masks (Box of 50)', unitSnapshot: 'box of 50', price: 300, qty: 1 },
          ],
        },
        events: {
          create: [
            { status: 'PLACED', createdAt: d },
            { status: 'DELIVERED', note: 'Delivered', createdAt: d },
          ],
        },
        delivery: {
          create: { status: 'DELIVERED', destLat: 27.6789, destLng: 85.317, deliveredAt: d, codCollected: true, codAmount: total },
        },
      },
    });
    // Loyalty: 1 point per NPR 100 spent
    await prisma.loyaltyAccount.upsert({
      where: { userId: kiran.id },
      create: { userId: kiran.id, points: Math.floor(total / 100), tier: 'Bronze' },
      update: { points: Math.floor(total / 100) },
    });
    await prisma.loyaltyTransaction.create({
      data: { userId: kiran.id, delta: Math.floor(total / 100), reason: 'Order delivered', orderId: order.id },
    });
    // Review on the delivered order
    await prisma.review.create({
      data: {
        orderId: order.id, shopId: everest.id, customerId: kiran.id, rating: 5,
        comment: 'Super fast delivery and genuine medicines. Thank you!',
        sellerReply: 'Thank you Kiran! Get well soon. — Everest Pharmacy',
      },
    });
    await prisma.shop.update({ where: { id: everest.id }, data: { ratingAvg: 5, ratingCount: 1 } });
  }

  // Order C — PLACED (fresh incoming order for the seller queue demo)
  if (!(await prisma.order.findUnique({ where: { code: 'GP-100003' } }))) {
    const subtotal = 180 + 110; // rice + noodles
    const total = subtotal + 40;
    await prisma.order.create({
      data: {
        code: 'GP-100003',
        customerId: rina.id,
        shopId: namaste.id,
        status: 'PLACED',
        recipientName: 'Rina Shakya',
        recipientPhone: '9840000001',
        area: 'New Baneshwor',
        fullAddress: 'New Baneshwor, Kathmandu 44600',
        lat: 27.698,
        lng: 85.3455,
        subtotal,
        deliveryFee: 40,
        total,
        paymentMethod: 'COD',
        items: {
          create: [
            { productId: riceNamaste?.id, nameSnapshot: 'Basmati Rice', unitSnapshot: '1 kg', price: 180, qty: 1 },
            { nameSnapshot: 'Wai Wai Noodles (Pack of 5)', unitSnapshot: 'pack of 5', price: 110, qty: 1 },
          ],
        },
        events: { create: [{ status: 'PLACED', note: 'Order placed' }] },
        delivery: { create: { status: 'UNASSIGNED', destLat: 27.698, destLng: 85.3455 } },
      },
    });
  }
  console.log('   • 3 demo orders (1 live/out-for-delivery, 1 delivered, 1 new)');

  // ── 9. Policy documents (published) ──────────────────────────────────────────
  const policyDefs: { key: string; title: string; content: string }[] = [
    { key: 'terms', title: 'Terms of Service', content: 'These Terms govern your use of GoPasal, operated by Velayon Dynamics Pvt. Ltd. …' },
    { key: 'privacy', title: 'Privacy Policy', content: 'This Privacy Policy explains how GoPasal collects, uses and protects your data …' },
    { key: 'refund', title: 'Refund & Returns Policy', content: 'GoPasal supports Cash on Delivery. Refunds and returns are handled per shop policy …' },
    { key: 'delivery', title: 'Delivery Policy', content: 'Orders are delivered by the shop’s own riders within its delivery radius …' },
    { key: 'cookies', title: 'Cookie Policy', content: 'GoPasal uses cookies to keep you signed in and to improve the experience …' },
  ];
  for (const p of policyDefs) {
    const existing = await prisma.policyDocument.findUnique({ where: { key_version: { key: p.key, version: '1.0' } } });
    if (!existing) {
      await prisma.policyDocument.create({
        data: { key: p.key, version: '1.0', title: p.title, content: p.content, isPublished: true, effectiveAt: new Date() },
      });
    }
  }
  console.log(`   • ${policyDefs.length} published policy documents`);

  // ── 10. GoPasal Gold + referral for a customer ───────────────────────────────
  await prisma.subscription.upsert({
    where: { userId: rina.id },
    create: { userId: rina.id, plan: 'gold', status: 'ACTIVE', renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    update: {},
  });
  const existingReferral = await prisma.referral.findFirst({ where: { referrerId: rina.id, refereeId: null } });
  if (!existingReferral) {
    await prisma.referral.create({ data: { referrerId: rina.id, code: 'RINA2026', status: 'PENDING' } });
  }
  console.log('   • Gold subscription + referral code');

  console.log('✅  Seed complete.\n');
  console.log('   Demo logins (OTP is printed to the API log in dev):');
  console.log('     Super Admin      9800000001');
  console.log('     Ops Admin        9800000002');
  console.log('     Shop Owner       9811111111  (Namaste Kirana)');
  console.log('     Shop Manager     9811111112');
  console.log('     Rider            9811111120');
  console.log('     Customer         9840000001  (Rina — has a live order GP-100001)');
}

main()
  .catch((e) => {
    console.error('❌  Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

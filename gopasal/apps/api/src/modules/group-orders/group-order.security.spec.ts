/* eslint-disable @typescript-eslint/require-await -- Prisma-shaped in-memory fakes preserve async contracts. */
import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { APP_GUARD } from "@nestjs/core";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { OrdersService } from "../orders/orders.service";
import { IS_PUBLIC_KEY } from "../../auth/decorators/public.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { AppModule } from "../../app.module";
import { RequestValidationPipe } from "../../common/pipes/request-validation.pipe";
import { GroupOrderController } from "./group-order.controller";
import { GroupOrderService, type DraftItem } from "./group-order.service";
import { SetGroupItemsDto } from "./dto/group-order.dto";

const GROUP_ID = "group-one";
const OTHER_GROUP_ID = "group-two";
const HOST_ID = "host-one";
const PARTICIPANT_ID = "participant-one";
const OUTSIDER_ID = "outsider-one";

type GroupRow = {
  id: string;
  code: string;
  hostId: string;
  shopId: string;
  status: "OPEN" | "LOCKED" | "PLACED" | "CANCELLED";
  expiresAt: Date | null;
  createdAt: Date;
  participants: Array<{
    id: string;
    groupOrderId: string;
    userId: string;
    items: DraftItem[];
    joinedAt: Date;
    user: { name: string };
  }>;
  shop: { id: string; name: string; slug: string; minOrder: number };
};

function group(id: string, participantIds = [HOST_ID, PARTICIPANT_ID]): GroupRow {
  return {
    id,
    code: id === GROUP_ID ? "GRP-ONE111" : "GRP-TWO222",
    hostId: HOST_ID,
    shopId: "shop-one",
    status: "OPEN",
    expiresAt: null,
    createdAt: new Date("2026-09-07T00:00:00.000Z"),
    participants: participantIds.map((userId, index) => ({
      id: `${id}-participant-${index}`,
      groupOrderId: id,
      userId,
      items: [{ productId: "product-one", variantId: null, qty: index + 1 }],
      joinedAt: new Date("2026-09-07T00:00:00.000Z"),
      user: { name: userId },
    })),
    shop: { id: "shop-one", name: "Shop One", slug: "shop-one", minOrder: 100 },
  };
}

function userFromMemberWhere(where: Record<string, unknown>): string | undefined {
  if (typeof where.hostId === "string") return where.hostId;
  const clauses = where.OR as Array<Record<string, unknown>> | undefined;
  const hostId = clauses?.find((clause) => typeof clause.hostId === "string")?.hostId;
  if (typeof hostId === "string") return hostId;
  const participantClause = clauses?.find((clause) => "participants" in clause)?.participants as
    { some?: { userId?: string } } | undefined;
  return participantClause?.some?.userId;
}

type ProductRow = {
  id: string;
  name: string;
  trackStock: boolean;
  stock: number;
  variants: Array<{ id: string; isActive: boolean; stock: number }>;
};

function serviceHarness(options?: {
  groups?: GroupRow[];
  checkout?: () => Promise<Record<string, unknown>>;
  products?: ProductRow[];
}) {
  const groups = new Map(
    (options?.groups ?? [group(GROUP_ID), group(OTHER_GROUP_ID, [HOST_ID, OUTSIDER_ID])]).map(
      (g) => [g.id, g],
    ),
  );
  let participantUpdates = 0;
  let participantDeletes = 0;

  const prisma = {
    groupOrder: {
      findUnique: async (args: { where: { id?: string; code?: string }; select?: unknown }) => {
        const row = args.where.id
          ? groups.get(args.where.id)
          : [...groups.values()].find((candidate) => candidate.code === args.where.code);
        if (!row) return null;
        if (args.select) {
          return {
            id: row.id,
            code: row.code,
            status: row.status,
            expiresAt: row.expiresAt,
            shop: row.shop,
            _count: { participants: row.participants.length },
          };
        }
        return row;
      },
      findFirst: async (args: { where: Record<string, unknown> }) => {
        const id = args.where.id as string;
        const row = groups.get(id);
        const userId = userFromMemberWhere(args.where);
        if (!row || !userId) return null;
        return row.hostId === userId ||
          row.participants.some((participant) => participant.userId === userId)
          ? row
          : null;
      },
      update: async (args: { where: { id: string }; data: { status: GroupRow["status"] } }) => {
        const row = groups.get(args.where.id);
        if (!row) throw new Error("missing group");
        row.status = args.data.status;
        return row;
      },
      updateMany: async (args: {
        where: { id: string; status?: unknown };
        data: { status: GroupRow["status"] };
      }) => {
        const row = groups.get(args.where.id);
        if (!row) return { count: 0 };
        row.status = args.data.status;
        return { count: 1 };
      },
    },
    groupOrderParticipant: {
      findUnique: async (args: {
        where: { groupOrderId_userId: { groupOrderId: string; userId: string } };
      }) => {
        const key = args.where.groupOrderId_userId;
        return (
          groups
            .get(key.groupOrderId)
            ?.participants.find((participant) => participant.userId === key.userId) ?? null
        );
      },
      update: async () => {
        participantUpdates += 1;
        return {};
      },
      deleteMany: async (args: { where: { groupOrderId: string; userId: string } }) => {
        const row = groups.get(args.where.groupOrderId);
        const before = row?.participants.length ?? 0;
        if (row)
          row.participants = row.participants.filter(
            (participant) => participant.userId !== args.where.userId,
          );
        participantDeletes += before - (row?.participants.length ?? 0);
        return { count: before - (row?.participants.length ?? 0) };
      },
      delete: async (args: {
        where: { groupOrderId_userId: { groupOrderId: string; userId: string } };
      }) => {
        const key = args.where.groupOrderId_userId;
        const row = groups.get(key.groupOrderId);
        const participant = row?.participants.find((candidate) => candidate.userId === key.userId);
        if (!participant) throw new Error("missing participant");
        if (row)
          row.participants = row.participants.filter(
            (candidate) => candidate.userId !== key.userId,
          );
        participantDeletes += 1;
        return participant;
      },
    },
    product: {
      findMany: async (args: { where: { id: { in: string[] } } }) => {
        const products = options?.products ?? [
          {
            id: "product-one",
            name: "Rice",
            trackStock: true,
            stock: 50,
            variants: [],
          },
        ];
        return products.filter((product) => args.where.id.in.includes(product.id));
      },
    },
    order: { update: async () => ({}) },
    $transaction: async (input: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) =>
      typeof input === "function" ? input(prisma) : Promise.all(input),
  };

  const orders = {
    checkoutGroup: options?.checkout ?? (async () => ({ id: "order-one" })),
  };

  return {
    service: new GroupOrderService(
      prisma as unknown as PrismaService,
      orders as unknown as OrdersService,
    ),
    calls: {
      get participantUpdates() {
        return participantUpdates;
      },
      get participantDeletes() {
        return participantDeletes;
      },
    },
  };
}

/** Call the desired user-scoped signature while this regression test is red on the old one-argument implementation. */
function getAs(service: GroupOrderService, userId: string, groupOrderId: string): Promise<unknown> {
  return (service.get as unknown as (userId: string, groupOrderId: string) => Promise<unknown>)(
    userId,
    groupOrderId,
  );
}

describe("group-order HTTP authentication boundary", () => {
  it("keeps the controller private and the global JWT guard installed", () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule) as Array<{
      provide?: unknown;
      useClass?: unknown;
    }>;
    assert.ok(
      providers.some(
        (provider) => provider.provide === APP_GUARD && provider.useClass === JwtAuthGuard,
      ),
    );
    assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, GroupOrderController), true);
    // Metadata reflection reads the method value without calling it; no receiver can be lost.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    assert.notEqual(Reflect.getMetadata(IS_PUBLIC_KEY, GroupOrderController.prototype.get), true);
  });
});

describe("full group-order detail is a member resource", () => {
  it("threads caller identity through both the controller and service boundary", () => {
    assert.equal(GroupOrderController.prototype.get.length, 2);
    assert.equal(GroupOrderService.prototype.get.length, 2);
  });

  it("rejects an authenticated outsider with the same 404 used for a missing resource", async () => {
    const { service } = serviceHarness();
    await assert.rejects(() => getAs(service, OUTSIDER_ID, GROUP_ID), NotFoundException);
  });

  it("allows the host to retrieve full detail", async () => {
    const { service } = serviceHarness();
    const result = (await getAs(service, HOST_ID, GROUP_ID)) as GroupRow;
    assert.equal(result.id, GROUP_ID);
    assert.ok(result.participants.length > 0);
  });

  it("allows a joined participant to retrieve full detail", async () => {
    const { service } = serviceHarness();
    const result = (await getAs(service, PARTICIPANT_ID, GROUP_ID)) as GroupRow;
    assert.equal(result.id, GROUP_ID);
  });

  it("does not let membership in another group confer access", async () => {
    const { service } = serviceHarness();
    await assert.rejects(() => getAs(service, OUTSIDER_ID, GROUP_ID), NotFoundException);
    const permitted = (await getAs(service, OUTSIDER_ID, OTHER_GROUP_ID)) as GroupRow;
    assert.equal(permitted.id, OTHER_GROUP_ID);
  });

  it("does not let an outsider use leave as an alternate full-detail read", async () => {
    const { service, calls } = serviceHarness();
    await assert.rejects(() => service.leave(OUTSIDER_ID, GROUP_ID), NotFoundException);
    assert.equal(calls.participantDeletes, 0);
  });
});

describe("share-code lookup is a join-safe preview", () => {
  it("returns shop and join state without participant identities, items, or private ids", async () => {
    const { service } = serviceHarness();
    const preview = (await service.getByCode("GRP-ONE111")) as Record<string, unknown>;
    assert.deepEqual(Object.keys(preview).sort(), [
      "expiresAt",
      "participantCount",
      "shop",
      "status",
    ]);
    assert.equal(preview.participantCount, 2);
    assert.ok(!("participants" in preview));
    assert.ok(!("id" in preview));
    assert.ok(!("code" in preview));
    assert.ok(!("hostId" in preview));
    assert.ok(!("shopId" in preview));
    assert.ok(!("createdAt" in preview));
  });
});

describe("group draft item bounds", () => {
  const pipe = new RequestValidationPipe();

  async function body(value: unknown) {
    return pipe.transform(value, { type: "body", metatype: SetGroupItemsDto, data: "" });
  }

  it("keeps the established per-line cart maximum of 99", async () => {
    await assert.rejects(
      () => body({ items: [{ productId: "product-one", qty: 100 }] }),
      BadRequestException,
    );
  });

  it("caps the array at 100 draft lines as a transport safety limit", async () => {
    const items = Array.from({ length: 101 }, (_, index) => ({
      productId: `product-${index}`,
      qty: 1,
    }));
    await assert.rejects(() => body({ items }), BadRequestException);
  });

  it("rejects duplicate product/variant keys instead of letting them evade the line maximum", async () => {
    const { service, calls } = serviceHarness();
    await assert.rejects(
      () =>
        service.setItems(PARTICIPANT_ID, GROUP_ID, [
          { productId: "product-one", variantId: null, qty: 60 },
          { productId: "product-one", variantId: null, qty: 60 },
        ]),
      BadRequestException,
    );
    assert.equal(calls.participantUpdates, 0);
  });

  it("rejects a combined participant quantity above 99 before checkout", async () => {
    let checkoutCalls = 0;
    const crowded = group(GROUP_ID);
    const [host, participant] = crowded.participants;
    assert.ok(host && participant);
    host.items = [{ productId: "product-one", qty: 60 }];
    participant.items = [{ productId: "product-one", qty: 60 }];
    const { service } = serviceHarness({
      groups: [crowded],
      checkout: async () => {
        checkoutCalls += 1;
        return { id: "order-one" };
      },
    });

    await assert.rejects(
      () => service.place(HOST_ID, GROUP_ID, { addressId: "address-one", paymentMethod: "COD" }),
      BadRequestException,
    );
    assert.equal(checkoutCalls, 0);
  });

  it("rejects a missing product option before persisting the participant draft", async () => {
    const { service, calls } = serviceHarness({
      products: [
        {
          id: "product-one",
          name: "Rice",
          trackStock: false,
          stock: 0,
          variants: [{ id: "large", isActive: true, stock: 5 }],
        },
      ],
    });
    await assert.rejects(
      () => service.setItems(PARTICIPANT_ID, GROUP_ID, [{ productId: "product-one", qty: 1 }]),
      /choose an option/,
    );
    assert.equal(calls.participantUpdates, 0);
  });

  it("rejects insufficient option stock before persisting the participant draft", async () => {
    const { service, calls } = serviceHarness({
      products: [
        {
          id: "product-one",
          name: "Rice",
          trackStock: false,
          stock: 0,
          variants: [{ id: "large", isActive: true, stock: 1 }],
        },
      ],
    });
    await assert.rejects(
      () =>
        service.setItems(PARTICIPANT_ID, GROUP_ID, [
          { productId: "product-one", variantId: "large", qty: 2 },
        ]),
      /only 1 left in stock/,
    );
    assert.equal(calls.participantUpdates, 0);
  });

  it("does not allow the host to lock an empty group", async () => {
    const empty = group(GROUP_ID);
    empty.participants.forEach((participant) => {
      participant.items = [];
    });
    const { service } = serviceHarness({ groups: [empty] });
    await assert.rejects(() => service.lock(HOST_ID, GROUP_ID), /Add at least one item/);
    assert.equal(empty.status, "OPEN");
  });
});

describe("placement retry boundary", () => {
  it("forwards an already-placed host retry to the idempotent checkout boundary", async () => {
    const placed = group(GROUP_ID);
    placed.status = "PLACED";
    let checkoutCalls = 0;
    const { service } = serviceHarness({
      groups: [placed],
      checkout: async () => {
        checkoutCalls += 1;
        return { id: "order-one" };
      },
    });

    const result = await service.place(HOST_ID, GROUP_ID, {
      addressId: "address-one",
      paymentMethod: "COD",
    });
    assert.equal(result.id, "order-one");
    assert.equal(checkoutCalls, 1);
  });
});

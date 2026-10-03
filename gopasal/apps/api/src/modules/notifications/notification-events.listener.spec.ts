import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NotificationEventsListener } from "./notification-events.listener";

type Job = { userId: string; type: string; title: string; body: string; data?: Record<string, unknown>; push?: boolean };

function listener(opts: { rider?: { userId: string } | null; order?: Record<string, unknown> | null }) {
  const jobs: Job[] = [];
  const prisma = {
    rider: {
      findUnique: () =>
        Promise.resolve(opts.rider === undefined ? { userId: "user_rider" } : opts.rider),
    },
    order: {
      findUnique: () =>
        Promise.resolve(
          opts.order === undefined
            ? {
                code: "GP-1",
                area: "Baneshwor",
                total: 360,
                paymentMethod: "COD",
                shop: { name: "Ram Kirana" },
              }
            : opts.order,
        ),
    },
  };
  const queue = {
    enqueue: (job: Job) => {
      jobs.push(job);
      return Promise.resolve();
    },
    enqueueMany: () => Promise.resolve(),
  };
  const l = new NotificationEventsListener(prisma as never, queue as never, {} as never);
  return { l, jobs };
}

const event = { orderId: "o1", deliveryId: "d1", riderId: "r1", shopId: "s1", customerId: "c1" };

describe("delivery assigned notifications", () => {
  it("tells the rider, with a push that opens the job", async () => {
    const { l, jobs } = listener({});
    await l.onDeliveryAssigned(event);
    const riderJob = jobs.find((j) => j.userId === "user_rider");
    assert.ok(riderJob, "the rider was not notified");
    assert.equal(riderJob.push, true);
    assert.equal(riderJob.type, "rider.job.assigned");
    assert.equal(riderJob.data?.orderId, "o1");
    assert.match(riderJob.title, /Ram Kirana/);
    assert.match(riderJob.body, /GP-1 to Baneshwor · collect Rs 360/);
  });

  it("says nothing about cash on a prepaid order", async () => {
    const { l, jobs } = listener({
      order: { code: "GP-2", area: "Patan", total: 500, paymentMethod: "ESEWA", shop: { name: "Ram Kirana" } },
    });
    await l.onDeliveryAssigned(event);
    const riderJob = jobs.find((j) => j.userId === "user_rider");
    assert.equal(riderJob?.body, "Order GP-2 to Patan.");
  });

  it("still tells the customer, quietly", async () => {
    const { l, jobs } = listener({});
    await l.onDeliveryAssigned(event);
    const customer = jobs.find((j) => j.userId === "c1");
    assert.equal(customer?.push, false);
  });

  it("skips the rider push when the rider has gone", async () => {
    const { l, jobs } = listener({ rider: null });
    await l.onDeliveryAssigned(event);
    assert.deepEqual(jobs.map((j) => j.userId), ["c1"]);
  });
});

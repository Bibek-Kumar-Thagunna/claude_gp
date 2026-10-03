"use client";

import * as React from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers";
import { customerApi } from "@/lib/api/customer";
import { orderView } from "@/lib/orders";
import type { TrackedOrder } from "@/lib/tracking";
import { OrderTracking } from "./OrderTracking";
import { continuePayment } from "@/lib/payment-action";

export function OrderScreen({ id }: { id: string }) {
  const auth = useAuth();
  const [order, setOrder] = React.useState<TrackedOrder | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [paymentBusy, setPaymentBusy] = React.useState(false);
  const [paymentError, setPaymentError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (auth.status !== "authenticated") return;
    void customerApi
      .order(id)
      .then((row) => setOrder(orderView(row)))
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Could not load order"),
      );
  }, [auth.status, id]);
  if (auth.status === "anonymous")
    return (
      <div className="gp-container py-16">
        <h1 className="text-2xl font-bold">Sign in to view this order</h1>
        <Link
          className="mt-4 inline-block font-semibold text-crimson-600"
          href="/login?next=/orders"
        >
          Sign in
        </Link>
      </div>
    );
  if (error)
    return (
      <div className="gp-container py-16">
        <h1 className="text-2xl font-bold">Order unavailable</h1>
        <p className="mt-2 text-ink-600">{error}</p>
      </div>
    );
  if (!order)
    return <div className="gp-container py-16 text-ink-500">Loading persisted order…</div>;
  const onlinePending =
    (order.payment === "ESEWA" || order.payment === "KHALTI") &&
    (order.paymentStatus === "PENDING" || order.paymentStatus === "FAILED") &&
    !["CANCELLED", "REJECTED", "DELIVERED"].includes(order.status);
  async function retryPayment() {
    setPaymentBusy(true);
    setPaymentError(null);
    try {
      const result = await customerApi.retryGatewayPayment(id);
      if (!continuePayment(result.payment)) {
        throw new Error("The payment gateway did not return a checkout action");
      }
    } catch (cause) {
      setPaymentError(cause instanceof Error ? cause.message : "Could not restart payment");
      setPaymentBusy(false);
    }
  }
  return (
    <>
      {onlinePending && (
        <div className="gp-container pt-6">
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <strong className="text-ink-900">Payment is not complete</strong>
              <p className="mt-0.5 text-sm text-ink-600">
                Your order is saved. Continue securely with{" "}
                {order.payment === "ESEWA" ? "eSewa" : "Khalti"}.
              </p>
              {paymentError && <p className="mt-1 text-sm text-crimson-700">{paymentError}</p>}
            </div>
            <button
              type="button"
              disabled={paymentBusy}
              onClick={() => void retryPayment()}
              className="gp-btn gp-btn-primary shrink-0 px-5 py-2.5 text-sm"
            >
              {paymentBusy ? "Opening gateway…" : "Continue payment"}
            </button>
          </div>
        </div>
      )}
      <OrderTracking order={order} />
    </>
  );
}

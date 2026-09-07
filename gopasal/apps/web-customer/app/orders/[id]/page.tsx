import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ORDERS, orderByCode } from "@/lib/orders";
import { OrderTracking } from "@/components/orders/OrderTracking";

/** Pre-render the sample orders; real orders resolve on demand once the API is wired. */
export function generateStaticParams() {
  return ORDERS.map((o) => ({ id: o.code }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const order = orderByCode(id);
  if (!order) return { title: "Order not found" };
  return {
    title: `Order #${order.code} · ${order.storeName}`,
    description: `Track order #${order.code} from ${order.storeName}, ${order.storeArea}. See where the runner is on the map — GoPasal shows distance, never a promised delivery time.`,
    robots: { index: false, follow: false },
  };
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = orderByCode(id);
  if (!order) notFound();
  return <OrderTracking order={order} />;
}

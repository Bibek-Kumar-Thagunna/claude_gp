import type { Metadata } from "next";
import { OrderScreen } from "@/components/orders/OrderScreen";

export const metadata: Metadata = { title: "Order tracking", robots: { index: false, follow: false } };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderScreen id={id} />;
}

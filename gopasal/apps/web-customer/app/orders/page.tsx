import type { Metadata } from "next";
import { OrdersView } from "@/components/orders/OrdersView";

export const metadata: Metadata = { title: "Your orders" };

export default function OrdersPage() {
  return <OrdersView />;
}

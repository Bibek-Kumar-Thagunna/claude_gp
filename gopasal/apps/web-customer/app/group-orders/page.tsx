import type { Metadata } from "next";
import { GroupOrdersView } from "@/components/group-orders/GroupOrdersView";

export const metadata: Metadata = {
  title: "Order together",
  description: "Build one neighbourhood-shop order with family, friends or coworkers.",
};

export default function GroupOrdersPage() {
  return <GroupOrdersView />;
}

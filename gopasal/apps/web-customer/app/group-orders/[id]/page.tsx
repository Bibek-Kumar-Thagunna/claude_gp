import type { Metadata } from "next";
import { GroupOrderRoom } from "@/components/group-orders/GroupOrderRoom";

export const metadata: Metadata = {
  title: "Group order",
  robots: { index: false, follow: false },
};

export default async function GroupOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GroupOrderRoom id={id} />;
}

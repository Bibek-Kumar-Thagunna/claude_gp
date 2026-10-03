import type { Metadata } from "next";
import { RewardsView } from "@/components/rewards/RewardsView";

export const metadata: Metadata = {
  title: "GoPasal Rewards",
  description: "Earn and use GoCoins, and invite friends to shop locally.",
};

export default function RewardsPage() {
  return <RewardsView />;
}

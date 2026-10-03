import * as React from "react";
import { Tabs } from "expo-router";
import {
  useSelectedShop,
  useShopOrders,
  useUnreadConversations,
} from "@gopasal/native-data/seller";
import { FloatingTabBar, theme, useT } from "@gopasal/native-ui";

/**
 * The tab bar, shared in shape with the customer app and different in what it
 * counts.
 *
 * Written by hand rather than styled through `screenOptions` because the
 * selected icon needs to *move*: a tab that only changes colour is the
 * difference between an app that feels built and one that feels assembled, and
 * the lift has to run on the UI thread or it stutters exactly when a screen is
 * mounting underneath it.
 *
 * **Queue is first and it is the only tab with a badge that matters.** The
 * number on it is orders waiting to be accepted — not all open orders, which
 * would sit at six all afternoon and stop meaning anything. A badge a
 * shopkeeper learns to ignore is worse than no badge, because the one morning
 * it says something urgent they will ignore that too.
 *
 * The count reads the same cached query the queue screen renders, so it is
 * right offline and clears the instant an order is accepted — no separate
 * count endpoint, no second source of truth to fall out of step.
 */
// `label` is a translation key: the tab bar is the first thing anybody reads,
// and in Nepali it must read in Nepali. The English is the fallback the
// dictionary carries, not a second copy kept here.
const TABS = [
  { name: "queue", label: "tab.queue", icon: "receipt-outline", activeIcon: "receipt" },
  { name: "shelf", label: "tab.catalogue", icon: "cube-outline", activeIcon: "cube" },
  { name: "messages", label: "tab.messages", icon: "chatbubble-outline", activeIcon: "chatbubble" },
  { name: "money", label: "tab.money", icon: "cash-outline", activeIcon: "cash" },
  { name: "shop", label: "tab.shop", icon: "storefront-outline", activeIcon: "storefront" },
] as const;

export default function TabsLayout() {
  const t = useT();
  const { shopId } = useSelectedShop();
  // Only the orders nobody has accepted yet. See the note above the tab list:
  // a badge that counts everything open is a badge nobody reads.
  //
  // The count comes from the server's `summary`, which is shop-wide, rather
  // than from the rows on this page — a queue past one page would otherwise
  // report a badge that quietly stops climbing at twenty.
  const queue = useShopOrders(shopId, {});
  const needsAction = queue.data?.summary.needsAction ?? 0;
  // Read from the same cached conversation list the Messages tab renders, so the
  // badge is right offline and clears the moment a thread is opened.
  const unread = useUnreadConversations(shopId);

  const items = TABS.map((tab) => ({
    name: tab.name,
    label: t(tab.label, undefined, "en" in tab ? (tab as { en: string }).en : undefined),
    icon: tab.icon,
    activeIcon: tab.activeIcon,
    badge: tab.name === "queue" ? needsAction : tab.name === "messages" ? unread : undefined,
  }));

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} items={items} tone="dark" />}
      screenOptions={{
        headerShown: false,
        // A tab change is a lateral move, not a push. Sliding it would imply a
        // hierarchy that is not there.
        animation: "fade",
        sceneStyle: { backgroundColor: theme.color.background },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{ title: t(tab.label, undefined, "en" in tab ? (tab as { en: string }).en : undefined) }}
        />
      ))}
    </Tabs>
  );
}

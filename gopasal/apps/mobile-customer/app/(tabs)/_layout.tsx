import * as React from "react";
import { Tabs } from "expo-router";
import { useCart, useUnreadConversations } from "@gopasal/native-data";
import { FloatingTabBar, theme, useT } from "@gopasal/native-ui";

/**
 * The tab bar is the shared floating dock (`FloatingTabBar` in native-ui):
 * the open tab's pill grows and shows its label, the rest stay icons. Badges
 * read the same cached queries their screens do, so they are right offline.
 */

/**
 * Five tabs, with the cart in the middle.
 *
 * Messages earns a tab rather than a row inside Account because a shopkeeper's
 * reply is time-sensitive — "we're out of eggs, is Amul fine?" is worth nothing
 * an hour later — and a reply nobody can see is the same as no reply. It is also
 * the thing this app has that ordering over a phone call does not.
 *
 * Saved moves into Account. It is a list people visit deliberately, not one they
 * need a badge for.
 */
// `label` is a translation key: the tab bar is the first thing anybody reads,
// and in Nepali it must read in Nepali. The English is the fallback the
// dictionary carries, not a second copy kept here.
const TABS = [
  { name: "home", label: "tab.home", en: "Home", icon: "home-outline", activeIcon: "home" },
  { name: "messages", label: "tab.messages", en: "Chats", icon: "chatbubble-outline", activeIcon: "chatbubble" },
  { name: "cart", label: "tab.cart", en: "Cart", icon: "bag-outline", activeIcon: "bag" },
  { name: "orders", label: "tab.orders", en: "Orders", icon: "receipt-outline", activeIcon: "receipt" },
  { name: "account", label: "tab.account", en: "Account", icon: "person-outline", activeIcon: "person" },
] as const;

export default function TabsLayout() {
  const t = useT();
  const { data: cart } = useCart();
  const count = (cart?.items ?? []).reduce((sum, line) => sum + line.qty, 0);
  // Read from the same cached conversation list the Messages tab renders, so the
  // badge is right offline and clears the moment a thread is opened.
  const unread = useUnreadConversations();

  const items = TABS.map((tab) => ({
    name: tab.name,
    label: t(tab.label, undefined, "en" in tab ? (tab as { en: string }).en : undefined),
    icon: tab.icon,
    activeIcon: tab.activeIcon,
    badge: tab.name === "cart" ? count : tab.name === "messages" ? unread : undefined,
  }));

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} items={items} tone="light" />}
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

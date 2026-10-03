import * as React from "react";
import { Tabs } from "expo-router";
import { useRiderJobs } from "@gopasal/native-data/rider";
import { FloatingTabBar, theme, useT } from "@gopasal/native-ui";

/**
 * Three tabs, because a rider's day has three questions: what am I carrying
 * now, what have I done today, and am I set up right. The dock is the shared
 * floating one in the rider's colours — ink with a marigold pill.
 */
const TABS = [
  { name: "jobs", label: "tab.jobs", icon: "bicycle-outline", activeIcon: "bicycle" },
  { name: "history", label: "tab.history", icon: "time-outline", activeIcon: "time" },
  { name: "profile", label: "tab.profile", icon: "person-outline", activeIcon: "person" },
] as const;

export default function TabsLayout() {
  const t = useT();
  const jobs = useRiderJobs({ poll: true });
  const count = (jobs.data ?? []).length;

  const items = TABS.map((tab) => ({
    name: tab.name,
    label: t(tab.label),
    icon: tab.icon,
    activeIcon: tab.activeIcon,
    badge: tab.name === "jobs" ? count : undefined,
  }));

  return (
    <>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} items={items} tone="amber" />}
        screenOptions={{
          headerShown: false,
          animation: "fade",
          sceneStyle: { backgroundColor: theme.color.background },
        }}
      >
        {TABS.map((tab) => (
          <Tabs.Screen key={tab.name} name={tab.name} options={{ title: t(tab.label) }} />
        ))}
      </Tabs>
    </>
  );
}

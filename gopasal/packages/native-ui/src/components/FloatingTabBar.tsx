import * as React from "react";
import { Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { palette, theme } from "../theme/theme";
import { haptic } from "./Pressable";
import { Text } from "./Text";

/**
 * The bottom navigation, as a floating dock.
 *
 * A flat full-width bar with five grey icons is what every template ships; it
 * reads as scaffolding. This is a rounded dock that sits a little above the
 * bottom edge, and the tab you are on *opens* — its pill grows and the label
 * slides out beside the icon — while the other four stay compact icons. The
 * growth is a spring on `flex`, so neighbours make room rather than the pill
 * appearing on top of them.
 *
 * Two tones, one per app: the customer app's dock is paper-white with a
 * crimson-tinted pill; the seller app's is ink with a solid crimson pill. A
 * shopkeeper with both apps on one phone can tell at a glance which one is in
 * their hand.
 *
 * It is a normal child of the tab navigator, not an overlay: screens do not
 * need to pad for it, and nothing scrolls under a dock a thumb is resting on.
 */
export type DockItem = {
  /** The route name inside `(tabs)`. */
  name: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
  badge?: number;
};

type Route = { key: string; name: string };
type BarProps = {
  state: { index: number; routes: Route[] };
  // Typed loosely on purpose: react-navigation's own types differ between
  // versions, and this component only needs `emit` and `navigate`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigation: { emit: (e: any) => any; navigate: (...args: any[]) => void };
};

const TONES = {
  light: {
    dock: theme.color.surface,
    border: palette.ink[100],
    pill: theme.color.brandSoft,
    active: theme.color.brand,
    idle: palette.ink[500],
    badgeRing: theme.color.surface,
  },
  dark: {
    dock: palette.ink[900],
    border: palette.ink[800],
    pill: theme.color.brand,
    active: palette.white,
    idle: palette.ink[400],
    badgeRing: palette.ink[900],
  },
  /** The rider app: ink dock, marigold pill — road-sign colours. */
  amber: {
    dock: palette.ink[900],
    border: palette.ink[800],
    pill: palette.marigold[500],
    active: palette.ink[900],
    idle: palette.ink[400],
    badgeRing: palette.ink[900],
  },
} as const;

const dockShadow = Platform.select({
  ios: {
    shadowColor: palette.ink[900],
    shadowOpacity: 0.14,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  android: { elevation: 14, shadowColor: palette.ink[900] },
  default: { boxShadow: "0 12px 30px rgba(27, 18, 32, 0.16)" },
}) as object;

export function FloatingTabBar({
  state,
  navigation,
  items,
  tone = "light",
}: BarProps & { items: DockItem[]; tone?: "light" | "dark" | "amber" }) {
  const insets = useSafeAreaInsets();
  const colors = TONES[tone];

  return (
    <View
      style={{
        backgroundColor: theme.color.background,
        paddingHorizontal: theme.spacing[3],
        paddingTop: theme.spacing[2],
        paddingBottom: Math.max(insets.bottom, theme.spacing[3]) + 2,
      }}
    >
      <View
        accessibilityRole="tablist"
        style={[
          {
            flexDirection: "row",
            height: 62,
            padding: 6,
            gap: 4,
            borderRadius: 26,
            backgroundColor: colors.dock,
            borderWidth: tone === "light" ? 1 : 0,
            borderColor: colors.border,
          },
          dockShadow,
        ]}
      >
        {state.routes.map((route, index) => {
          const item = items.find((i) => i.name === route.name);
          if (!item) return null;
          const focused = state.index === index;
          return (
            <DockTab
              key={route.key}
              item={item}
              focused={focused}
              colors={colors}
              onPress={() => {
                const event: { defaultPrevented?: boolean } = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  haptic("selection");
                  navigation.navigate(route.name);
                }
              }}
              onLongPress={() => navigation.emit({ type: "tabLongPress", target: route.key })}
            />
          );
        })}
      </View>
    </View>
  );
}

function DockTab({
  item,
  focused,
  colors,
  onPress,
  onLongPress,
}: {
  item: DockItem;
  focused: boolean;
  colors: (typeof TONES)[keyof typeof TONES];
  onPress: () => void;
  onLongPress: () => void;
}) {
  const open = useSharedValue(focused ? 1 : 0);
  const pressed = useSharedValue(0);

  React.useEffect(() => {
    open.value = withSpring(focused ? 1 : 0, { damping: 18, stiffness: 190, mass: 0.8 });
  }, [focused, open]);

  const slot = useAnimatedStyle(() => ({
    flexGrow: 1 + 1.25 * open.value,
    transform: [{ scale: 1 - 0.05 * pressed.value }],
  }));
  const pill = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(open.value, [0, 1], ["rgba(0,0,0,0)", colors.pill]),
  }));
  const label = useAnimatedStyle(() => ({
    opacity: open.value,
    maxWidth: 96 * open.value,
    marginLeft: 6 * open.value,
    transform: [{ translateX: -6 * (1 - open.value) }],
  }));

  // Not on the open tab: its screen is already showing what the number counts,
  // and on the grown pill the badge would sit on top of the icon.
  const badge = focused ? 0 : (item.badge ?? 0);

  return (
    <Animated.View style={[{ flexBasis: 0, flexShrink: 1 }, slot]}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={() => (pressed.value = withTiming(1, { duration: 90 }))}
        onPressOut={() => (pressed.value = withTiming(0, { duration: 160 }))}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={item.badge ? `${item.label}, ${item.badge}` : item.label}
        style={{ flex: 1 }}
      >
        <Animated.View
          style={[
            {
              flex: 1,
              borderRadius: 20,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 8,
              overflow: "hidden",
            },
            pill,
          ]}
        >
          <View>
            <Ionicons
              name={focused ? item.activeIcon : item.icon}
              size={22}
              color={focused ? colors.active : colors.idle}
            />
            {badge > 0 ? (
              <View
                style={{
                  position: "absolute",
                  top: -7,
                  right: -12,
                  minWidth: 18,
                  height: 18,
                  paddingHorizontal: 4,
                  borderRadius: 9,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: focused && colors.pill === theme.color.brand ? palette.marigold[500] : theme.color.brand,
                  borderWidth: 2,
                  borderColor: colors.badgeRing,
                }}
              >
                <Text
                  variant="overline"
                  tabular
                  style={{ color: palette.white, fontSize: 10, lineHeight: 12, letterSpacing: 0 }}
                >
                  {badge > 9 ? "9+" : String(badge)}
                </Text>
              </View>
            ) : null}
          </View>
          <Animated.View style={[{ overflow: "hidden" }, label]}>
            <Text
              variant="caption"
              numberOfLines={1}
              style={{ color: colors.active, fontSize: 13, fontWeight: "700", letterSpacing: 0 }}
            >
              {item.label}
            </Text>
          </Animated.View>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

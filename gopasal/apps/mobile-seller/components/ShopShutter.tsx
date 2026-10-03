import * as React from "react";
import { View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { Button, Text, theme, useT } from "@gopasal/native-ui";

/**
 * The shutter: open for orders, or closed.
 *
 * This is the second most consequential control in the app after Accept, and it
 * is the one that gets used with a customer halfway out the door. Three
 * decisions follow from that:
 *
 *  - **It is a panel, not a switch.** A shopkeeper looking at the phone from
 *    the other side of the counter has to know the answer without walking over,
 *    so the state is a filled block with one word in display type and a colour
 *    that carries across a room. A 50×30 toggle cannot do that, and a toggle's
 *    state is also the thing people misread most often.
 *  - **The state and the action are separate things.** The panel says where the
 *    shop stands; the button underneath says what pressing it will do, in a
 *    verb. A single tappable card would mean a mis-tap on the most expensive
 *    control on the screen, and it would force the reader to work out which way
 *    a tap moves it.
 *  - **Closing is confirmed, opening is not.** A shop closed by accident is
 *    invisible and has no way to find out why the afternoon went quiet; a shop
 *    opened by accident takes an order it can probably fill. The confirmation
 *    is the screen's to show — this component only asks for it.
 *
 * Nothing here holds its own copy of `isOpen`. `useShopSettings` is already
 * optimistic and rolls back on failure, and a second source of truth would
 * flicker between the two the moment the network was slow.
 */
export function ShopShutter({
  isOpen,
  busy,
  error,
  onOpen,
  onRequestClose,
}: {
  isOpen: boolean;
  busy: boolean;
  /** Shown under the button when the last change was refused. */
  error?: string | null;
  onOpen: () => void;
  /** The screen answers this by confirming, then closing. */
  onRequestClose: () => void;
}) {
  const t = useT();

  const title = isOpen ? t("shop.open") : t("shop.closed");
  const detail = isOpen ? t("shop.openDetail") : t("shop.closedDetail");

  return (
    <View style={{ gap: theme.spacing[3] }}>
      <View
        accessible
        accessibilityRole="summary"
        accessibilityLabel={`${title}. ${detail}`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing[4],
          padding: theme.spacing[5],
          borderRadius: theme.radii.xl,
          borderWidth: 1,
          borderColor: isOpen ? theme.color.success : theme.color.danger,
          backgroundColor: isOpen ? theme.color.successSoft : theme.color.dangerSoft,
        }}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: theme.radii.full,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: isOpen ? theme.color.success : theme.color.danger,
          }}
        >
          <Ionicons
            name={isOpen ? "storefront" : "lock-closed"}
            size={27}
            color={theme.color.onDark}
          />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          {/* `title1`, not `body`: this is the line that has to be legible from
              the far side of the counter. */}
          <Text variant="title1" color={isOpen ? "success" : "danger"}>
            {title}
          </Text>
          <Text variant="footnote" color="textSecondary" style={{ marginTop: theme.spacing[1] }}>
            {detail}
          </Text>
        </View>
      </View>

      <Button
        label={isOpen ? t("shop.closeAction") : t("shop.openAction")}
        variant={isOpen ? "danger" : "primary"}
        size="lg"
        loading={busy}
        haptic={isOpen ? "warning" : "success"}
        onPress={isOpen ? onRequestClose : onOpen}
      />

      {error ? (
        <Animated.View entering={FadeIn.duration(140)}>
          <Text variant="footnote" color="danger" align="center">
            {error}
          </Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

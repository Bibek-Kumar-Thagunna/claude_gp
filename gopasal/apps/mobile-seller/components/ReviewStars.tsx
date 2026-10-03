import * as React from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text, theme, useT } from "@gopasal/native-ui";

/**
 * A rating, as five stars rather than a number out of five.
 *
 * Five drawn stars — the empty ones included — is what makes "3" legible from
 * arm's length without reading anything: the missing two are the shape that
 * says how far off full marks it is. A bare "3★" makes the eye do the division.
 *
 * Half stars are not drawn. The rating a customer leaves is `1–5`, a whole
 * number; the shop's *average* is fractional and is rendered as a figure beside
 * its own word, because a half-lit star is a precision the review itself does
 * not have.
 */
export function ReviewStars({
  rating,
  size = 15,
  label = true,
}: {
  /** 1–5 as the customer left it. */
  rating: number;
  size?: number;
  /** Whether the number is spelt out beside the stars. */
  label?: boolean;
}) {
  const t = useT();
  const filled = Math.max(0, Math.min(5, Math.round(rating)));

  return (
    <View
      accessible
      accessibilityLabel={t("reviews.a11y.rating", { rating: filled })}
      style={{ flexDirection: "row", alignItems: "center", gap: 2 }}
    >
      {[1, 2, 3, 4, 5].map((step) => (
        <Ionicons
          key={step}
          name={step <= filled ? "star" : "star-outline"}
          size={size}
          // The marigold is the brand's second colour and the one a star is
          // expected to be; the empty ones step back to a hairline grey rather
          // than a pale gold, which would read as a half mark.
          color={step <= filled ? theme.color.accent : theme.color.border}
        />
      ))}
      {label ? (
        <Text variant="caption" color="textMuted" tabular style={{ marginLeft: 4 }}>
          {filled}
        </Text>
      ) : null}
    </View>
  );
}

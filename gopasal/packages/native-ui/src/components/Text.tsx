import * as React from "react";
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from "react-native";
import { fontFamily, theme, type TypeRole } from "../theme/theme";

/**
 * Every piece of text in the product goes through here.
 *
 * Not for tidiness — for three things that are invisible until they are wrong:
 *
 *  - **One type scale.** A screen picks `variant="title2"`, never a font size.
 *    Sizes chosen per screen drift within a week and the app starts to look like
 *    several apps.
 *  - **The right face for the script.** Shops and products carry `nameNp`, and
 *    Devanagari set in a Latin face loses its matras. `script="np"` picks Hind.
 *  - **A font-scaling ceiling.** A customer with large text enabled is entitled
 *    to bigger type; a 310% system scale that pushes the price out of the button
 *    is not accessibility, it is a broken checkout. Capping keeps the layout
 *    intact while still honouring most of the preference.
 */

export type TextVariant = TypeRole;

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  /** A colour role, not a hex value. */
  color?: keyof typeof theme.color;
  script?: "latin" | "np";
  align?: TextStyle["textAlign"];
  /** Digits that keep their column as values change — prices, totals, counts. */
  tabular?: boolean;
};

const FAMILY_FOR_WEIGHT: Record<string, string> = {
  "800": fontFamily.display,
  "700": fontFamily.bodyBold,
  "600": fontFamily.displayMedium,
  "500": fontFamily.body,
};

export function Text({
  variant = "body",
  color = "text",
  script = "latin",
  align,
  tabular,
  style,
  ...rest
}: TextProps) {
  const spec = theme.type[variant];
  const weight = String(spec.fontWeight);

  // Display sizes take the display face; body sizes take Inter. Devanagari
  // overrides both, because Hind is the only face here that sets the script
  // correctly and a missing glyph is worse than a slight weight mismatch.
  const family =
    script === "np"
      ? fontFamily.devanagari
      : (FAMILY_FOR_WEIGHT[weight] ?? fontFamily.body);

  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={1.4}
      style={[
        {
          fontSize: spec.fontSize,
          lineHeight: spec.lineHeight,
          letterSpacing: spec.letterSpacing,
          color: theme.color[color],
          fontFamily: family,
          // The family already carries the weight. Leaving `fontWeight` on as
          // well makes Android synthesise a faux-bold on top of a real bold,
          // which is the smeared look that says "not a designed app".
          textAlign: align,
          ...(tabular ? { fontVariant: ["tabular-nums" as const] } : null),
        },
        style,
      ]}
      {...rest}
    />
  );
}

/** Money, formatted the way the rest of GoPasal writes it. */
export function Price({
  value,
  variant = "numeric",
  color = "text",
  style,
  ...rest
}: Omit<TextProps, "children"> & { value: number }) {
  return (
    <Text variant={variant} color={color} tabular style={style} {...rest}>
      {`रु ${Math.round(value).toLocaleString("en-IN")}`}
    </Text>
  );
}

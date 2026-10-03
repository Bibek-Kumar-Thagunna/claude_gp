import * as React from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, G, Line, Polygon, Polyline, Text as SvgText } from "react-native-svg";
import type { LatLng } from "@gopasal/native-data/seller-delivery";
import { Text, fontFamily, theme, useT } from "@gopasal/native-ui";
import { fitToBox } from "./DeliveryGeometry";

/**
 * A zone drawn as a shape, with no map under it.
 *
 * There is no map SDK in this app, and pulling one in for a preview would cost
 * more than a zone screen is worth. What the shopkeeper needs to see is not
 * streets — they just walked them — but the *shape*: that the corners are in
 * the order they meant, that the outline does not fold over itself, and that the
 * last corner joins back to the first without them having to walk there.
 *
 * So: the corners, numbered in the order they were taken; solid edges between
 * them; a dashed edge for the one the server closes on its own. North is up.
 * When the shop has a pin, it and the delivery radius are drawn too, because a
 * zone only matters *outside* that circle and a zone drawn inside it does
 * nothing — the picture should make that visible without a paragraph.
 */
export function DeliveryZoneOutline({
  points,
  height = 220,
  compact = false,
  shop,
  probe,
  accessibilityLabel,
}: {
  points: readonly LatLng[];
  height?: number;
  /** A list thumbnail: no numbers, no pin, thinner strokes. */
  compact?: boolean;
  shop?: { lat: number; lng: number; radiusKm: number } | null;
  /** A checked point, with whether it fell inside. */
  probe?: { point: LatLng; inside: boolean } | null;
  accessibilityLabel?: string;
}) {
  const t = useT();
  const [width, setWidth] = React.useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };

  const fitted = React.useMemo(() => {
    if (width === 0) return null;
    // Fitted to the zone and the probe only. Fitting the shop's radius in as
    // well would shrink a small zone across the river to a dot beside a 5 km
    // circle; the circle is drawn anyway and simply runs off the edge.
    const fitPoints = probe ? [...points, probe.point] : [...points];
    if (fitPoints.length === 0 && shop) fitPoints.push({ lat: shop.lat, lng: shop.lng });
    return fitToBox(fitPoints, width, height, compact ? 10 : 26);
  }, [points, probe, shop, width, height, compact]);

  const projected = fitted ? points.map((p) => fitted.project(p)) : [];
  const closed = projected.length >= 3;
  const first = projected[0];
  const last = projected[projected.length - 1];
  const shopXY = fitted && shop && !compact ? fitted.project(shop) : null;
  const radiusPx = fitted && shop ? (shop.radiusKm * 1000) / fitted.metresPerPixel : 0;
  const probeXY = fitted && probe ? fitted.project(probe.point) : null;

  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        accessibilityLabel ?? t("delivery.outline.a11y", { count: points.length })
      }
      style={{
        height,
        borderRadius: theme.radii.md,
        backgroundColor: theme.color.surfaceSunken,
        overflow: "hidden",
      }}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {shopXY ? (
            <G>
              <Circle
                cx={shopXY.x}
                cy={shopXY.y}
                r={radiusPx}
                stroke={theme.color.info}
                strokeWidth={1}
                strokeDasharray="4 4"
                fill={theme.color.infoSoft}
                fillOpacity={0.5}
              />
              <Circle cx={shopXY.x} cy={shopXY.y} r={5} fill={theme.color.info} />
            </G>
          ) : null}

          {closed ? (
            <Polygon
              points={projected.map((p) => `${p.x},${p.y}`).join(" ")}
              fill={theme.color.brandSoft}
              fillOpacity={0.8}
              stroke="none"
            />
          ) : null}

          {projected.length >= 2 ? (
            <Polyline
              points={projected.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={theme.color.brand}
              strokeWidth={compact ? 1.5 : 2.5}
              strokeLinejoin="round"
            />
          ) : null}

          {closed && first && last ? (
            <Line
              x1={last.x}
              y1={last.y}
              x2={first.x}
              y2={first.y}
              stroke={theme.color.brand}
              strokeWidth={compact ? 1.5 : 2}
              strokeDasharray="5 5"
            />
          ) : null}

          {projected.map((p, i) => (
            <G key={i}>
              <Circle
                cx={p.x}
                cy={p.y}
                r={compact ? 2.5 : 9}
                fill={
                  i === projected.length - 1 && !compact ? theme.color.brand : theme.color.surface
                }
                stroke={theme.color.brand}
                strokeWidth={compact ? 1 : 1.5}
              />
              {compact ? null : (
                <SvgText
                  x={p.x}
                  y={p.y + 3.5}
                  fontSize={10}
                  fontFamily={fontFamily.body}
                  fontWeight="700"
                  textAnchor="middle"
                  fill={i === projected.length - 1 ? theme.color.onBrand : theme.color.brand}
                >
                  {String(i + 1)}
                </SvgText>
              )}
            </G>
          ))}

          {probeXY && probe ? (
            <G>
              <Circle
                cx={probeXY.x}
                cy={probeXY.y}
                r={8}
                fill={probe.inside ? theme.color.successSoft : theme.color.dangerSoft}
                stroke={probe.inside ? theme.color.success : theme.color.danger}
                strokeWidth={2}
              />
              <Circle
                cx={probeXY.x}
                cy={probeXY.y}
                r={3}
                fill={probe.inside ? theme.color.success : theme.color.danger}
              />
            </G>
          ) : null}
        </Svg>
      ) : null}

      {points.length === 0 && !compact ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            alignItems: "center",
            // At the foot, not the centre: the centre is where the shop's dot
            // is drawn, and the sentence used to run straight through it.
            justifyContent: "flex-end",
            padding: theme.spacing[3],
          }}
        >
          <Text variant="caption" color="textMuted" align="center">
            {t("delivery.outline.empty")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

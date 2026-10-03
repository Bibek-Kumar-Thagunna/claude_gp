import * as React from "react";
import { useWindowDimensions, View } from "react-native";
import Svg, { Circle, Defs, G, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import type { OrderTracking } from "@gopasal/native-data";
import { RiderMark, Text, palette, theme, useT } from "@gopasal/native-ui";

/**
 * Live tracking, drawn rather than tiled.
 *
 * This is the default tracking view and it costs **nothing**. The server has
 * already routed the journey once and cached it for twelve hours, so the road
 * geometry is in hand; this projects that polyline into a box and draws it in
 * GoPasal's own colours. No tiles are fetched, no map SDK initialises, and the
 * whole thing works with the phone in aeroplane mode on a cached order.
 *
 * Which is not a compromise. The question a waiting customer actually has is
 * "where is it and how far", and a route line between two named ends answers it
 * more directly than a street map they have to read. Street context is one tap
 * away for the minority who want it, and only then does a tile get bought.
 *
 * Two honesty rules carried over from the policy:
 *
 *  - **Distance remaining, never a countdown.** An ETA on a Kathmandu street at
 *    six in the evening is a guess presented as a promise.
 *  - **Nothing is drawn that is not known.** With no rider fix yet the scooter
 *    is not placed at a guessed point — the route is drawn dimmed and the
 *    caption says the rider has not set off.
 */

type Point = { lat: number; lng: number };

const HEIGHT = 210;
const PAD = 26;

/**
 * Web-Mercator-ish projection, which for a few kilometres is indistinguishable
 * from the real thing and needs no library: longitude is linear, latitude is
 * scaled by cos(lat) so the shape does not stretch north–south.
 */
function project(points: Point[], width: number, height: number) {
  if (points.length === 0) return { toXY: () => ({ x: 0, y: 0 }) };

  const latRef = (points.reduce((sum, p) => sum + p.lat, 0) / points.length) * (Math.PI / 180);
  const k = Math.cos(latRef);

  const xs = points.map((p) => p.lng * k);
  const ys = points.map((p) => -p.lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);
  // One scale for both axes, so the route keeps its real shape instead of being
  // squashed to fill the box.
  const scale = Math.min((width - PAD * 2) / spanX, (height - PAD * 2) / spanY);

  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;

  return {
    toXY: (p: Point) => ({
      x: (p.lng * k - minX) * scale + offsetX,
      y: (-p.lat - minY) * scale + offsetY,
    }),
  };
}

function bearing(from: Point, to: Point): number {
  const φ1 = (from.lat * Math.PI) / 180;
  const φ2 = (to.lat * Math.PI) / 180;
  const Δλ = ((to.lng - from.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** The endpoint pins: the shop it came from, and the door it is going to. */
function Pin({
  x,
  y,
  tone,
  icon,
}: {
  x: number;
  y: number;
  tone: string;
  icon: "storefront" | "home";
}) {
  return (
    <View
      style={{
        position: "absolute",
        left: x - 15,
        top: y - 34,
        alignItems: "center",
      }}
      pointerEvents="none"
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: tone,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 2.5,
          borderColor: palette.white,
          ...theme.shadows.sm,
        }}
      >
        <Ionicons name={icon} size={14} color={palette.white} />
      </View>
      {/* the pin's stem */}
      <View
        style={{
          width: 2,
          height: 7,
          backgroundColor: tone,
          opacity: 0.55,
        }}
      />
    </View>
  );
}

export function RouteCanvas({
  tracking,
  shopName,
}: {
  tracking: OrderTracking;
  shopName: string;
}) {
  const t = useT();
  const { width: screen } = useWindowDimensions();
  const width = screen - theme.spacing[4] * 2;

  const origin = tracking.origin;
  const destination = tracking.destination;
  const rider = tracking.rider;
  const geometry = tracking.route?.geometry ?? null;
  const remaining = tracking.route?.distanceMeters ?? null;

  // A gentle pulse under the rider, so a stationary bike still reads as live.
  const pulse = useSharedValue(0);
  React.useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 1400 }), withTiming(0, { duration: 1400 })),
      -1,
      false,
    );
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.28 - pulse.value * 0.24,
    transform: [{ scale: 0.55 + pulse.value * 0.6 }],
  }));

  const path = React.useMemo<Point[]>(() => {
    // The server sends GeoJSON order — [lng, lat] — which is the single easiest
    // thing to get backwards on a map, and it puts Kathmandu in the Indian
    // Ocean when you do.
    if (geometry && geometry.length > 1) {
      return geometry.map(([lng, lat]) => ({ lat, lng }));
    }
    // No routed line: fall back to the straight segment between the two ends,
    // which is honest about being a straight line rather than pretending to
    // know roads.
    return [origin, destination].filter(Boolean) as Point[];
  }, [geometry, origin, destination]);

  const all = React.useMemo<Point[]>(
    () => [...path, ...(rider ? [{ lat: rider.lat, lng: rider.lng }] : [])],
    [path, rider],
  );

  if (all.length < 2) return null;

  const { toXY } = project(all, width, HEIGHT);
  const pts = path.map(toXY);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

  const riderXY = rider ? toXY({ lat: rider.lat, lng: rider.lng }) : null;
  const originXY = origin ? toXY(origin) : null;
  const destXY = destination ? toXY(destination) : null;

  // Heading: the rider's own if the device reported one, otherwise the bearing
  // along the next bit of route — better than leaving the scooter facing north
  // while it travels west.
  const heading =
    rider?.heading ??
    (rider && destination ? bearing({ lat: rider.lat, lng: rider.lng }, destination) : 0);

  const degraded = tracking.route?.degraded ?? !geometry;

  return (
    <View
      style={{
        height: HEIGHT,
        borderRadius: theme.radii.xl,
        overflow: "hidden",
        backgroundColor: theme.color.surfaceSunken,
        borderWidth: 1,
        borderColor: theme.color.border,
      }}
    >
      <Svg width={width} height={HEIGHT}>
        <Defs>
          <RadialGradient id="ground" cx="50%" cy="45%" r="70%">
            <Stop offset="0%" stopColor={palette.crimson[50]} stopOpacity="0.9" />
            <Stop offset="100%" stopColor={theme.color.surfaceSunken} stopOpacity="1" />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={HEIGHT} fill="url(#ground)" />

        {/* A faint grid, so the drawing reads as a plan rather than as a doodle. */}
        <G opacity={0.35}>
          {Array.from({ length: Math.ceil(width / 28) }, (_, i) => (
            <Path
              key={`v${i}`}
              d={`M${i * 28} 0 V${HEIGHT}`}
              stroke={theme.color.border}
              strokeWidth={1}
            />
          ))}
          {Array.from({ length: Math.ceil(HEIGHT / 28) }, (_, i) => (
            <Path
              key={`h${i}`}
              d={`M0 ${i * 28} H${width}`}
              stroke={theme.color.border}
              strokeWidth={1}
            />
          ))}
        </G>

        {/* the route: a soft casing under a solid line, the way a road is drawn */}
        <Path d={d} stroke={palette.crimson[100]} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <Path
          d={d}
          stroke={palette.crimson[500]}
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={degraded ? "9 7" : undefined}
          fill="none"
          opacity={rider ? 1 : 0.45}
        />

        {/* end caps */}
        {originXY && <Circle cx={originXY.x} cy={originXY.y} r={4} fill={palette.crimson[500]} />}
        {destXY && <Circle cx={destXY.x} cy={destXY.y} r={4} fill={theme.color.success} />}
      </Svg>

      {originXY && <Pin x={originXY.x} y={originXY.y} tone={palette.crimson[500]} icon="storefront" />}
      {destXY && <Pin x={destXY.x} y={destXY.y} tone={theme.color.success} icon="home" />}

      {riderXY && (
        <>
          <Animated.View
            style={[
              {
                position: "absolute",
                left: riderXY.x - 32,
                top: riderXY.y - 32,
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: palette.crimson[500],
              },
              pulseStyle,
            ]}
            pointerEvents="none"
          />
          <View
            style={{ position: "absolute", left: riderXY.x - 31, top: riderXY.y - 33 }}
            pointerEvents="none"
          >
            <RiderMark size={62} heading={heading} stale={rider?.stale} />
          </View>
        </>
      )}

      {/* the one number that matters */}
      <View
        style={{
          position: "absolute",
          left: theme.spacing[3],
          bottom: theme.spacing[3],
          // Capped, because the caption and the provenance chip share this edge
          // and a long shop name was running straight underneath it.
          maxWidth: width - (degraded ? 132 : 0) - theme.spacing[3] * 2,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: theme.spacing[3],
          paddingVertical: 6,
          borderRadius: theme.radii.full,
          backgroundColor: theme.color.surface,
          ...theme.shadows.sm,
        }}
      >
        <Ionicons name="navigate" size={12} color={theme.color.brand} />
        <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
          {rider
            ? remaining != null
              ? t("track.toGo", {
                  distance: t("route.km", { value: (remaining / 1000).toFixed(1) }),
                })
              : t("status.OUT_FOR_DELIVERY")
            : t("route.waitingRider", { shop: shopName })}
        </Text>
      </View>

      {degraded && (
        <View
          style={{
            position: "absolute",
            right: theme.spacing[3],
            bottom: theme.spacing[3],
            paddingHorizontal: theme.spacing[2],
            paddingVertical: 4,
            borderRadius: theme.radii.sm,
            backgroundColor: theme.color.surface,
          }}
        >
          {/* Said plainly rather than hidden: a dashed straight line is not a
              road route, and the distance beside it is as-the-crow-flies. */}
          <Text variant="overline" color="textFaint">
            {t("route.directLine")}
          </Text>
        </View>
      )}
    </View>
  );
}

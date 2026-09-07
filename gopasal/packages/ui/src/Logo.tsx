import * as React from "react";

export type LogoVariant = "mark" | "full" | "wordmark";
export type LogoTone = "brand" | "mono" | "onDark";

export interface LogoProps extends React.SVGProps<SVGSVGElement> {
  /** "mark" = glyph only, "full" = glyph + wordmark, "wordmark" = text only. */
  variant?: LogoVariant;
  /** "brand" = crimson + marigold, "mono" = single currentColor, "onDark" = light for dark bg. */
  tone?: LogoTone;
  /** Pixel height of the logo; width scales automatically. */
  height?: number;
  title?: string;
}

/**
 * GoPasal logo.
 *
 * The glyph is an "Aankhijhyal" — the carved lattice eye-window of the
 * Kathmandu valley — abstracted into a geometric temple-window mark with a
 * marigold "eye" at its heart. It reads as a shopfront/window into the
 * neighbourhood, which is exactly what GoPasal is.
 */
export function Logo({
  variant = "full",
  tone = "brand",
  height = 32,
  title = "GoPasal",
  ...rest
}: LogoProps) {
  const crimson = tone === "onDark" ? "#FFFFFF" : tone === "mono" ? "currentColor" : "#E11945";
  const accent = tone === "brand" ? "#F6A609" : crimson;
  const text = tone === "onDark" ? "#FFFFFF" : tone === "mono" ? "currentColor" : "#1B1220";
  const brandText = tone === "brand" ? "#E11945" : text;

  const Mark = (
    <g>
      {/* base sill */}
      <rect x="3" y="51" width="42" height="5" rx="2" fill={crimson} />
      {/* window frame — temple/ogee top */}
      <path
        d="M8 51 L8 22 Q8 19.6 9.6 18 L22.4 5.2 Q24 3.6 25.6 5.2 L38.4 18 Q40 19.6 40 22 L40 51 Z"
        fill="none"
        stroke={crimson}
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
      {/* lattice — mullion + transom */}
      <path
        d="M24 9 L24 51 M11 31 L37 31"
        stroke={crimson}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* the eye — central diamond */}
      <path d="M24 22 L31 31 L24 40 L17 31 Z" fill={accent} />
      <circle cx="24" cy="31" r="2.4" fill={crimson} />
    </g>
  );

  const width =
    variant === "mark"
      ? height * (48 / 56)
      : variant === "wordmark"
        ? height * (150 / 56)
        : height * (190 / 56);

  return (
    <svg
      role="img"
      aria-label={title}
      height={height}
      width={width}
      viewBox={
        variant === "mark" ? "0 0 48 56" : variant === "wordmark" ? "0 0 150 56" : "0 0 190 56"
      }
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      <title>{title}</title>
      {variant !== "wordmark" && Mark}
      {variant !== "mark" && (
        <text
          x={variant === "wordmark" ? 0 : 54}
          y="38"
          fontFamily='"Baloo 2","Poppins",system-ui,sans-serif'
          fontSize="30"
          fontWeight={700}
          letterSpacing="-0.5"
        >
          <tspan fill={brandText}>Go</tspan>
          <tspan fill={text}>Pasal</tspan>
        </text>
      )}
    </svg>
  );
}

export default Logo;

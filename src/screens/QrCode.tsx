import { useMemo } from "react";
import { QUIET_ZONE, qrMatrix } from "../lib/qr";

/**
 * The pairing link, drawn as one SVG path.
 *
 * `shape-rendering: crispEdges` keeps the modules square at any scale, which is
 * what a phone camera needs; the white plate behind the path is the symbol's
 * own background and must not be left to the page, which might be pink.
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { path, size } = useMemo(() => qrMatrix(value), [value]);
  const origin = -QUIET_ZONE;
  return (
    <svg className="pair-qr" viewBox={`${origin} ${origin} ${size} ${size}`} role="img" aria-label={label}>
      <rect x={origin} y={origin} width={size} height={size} fill="#fff" />
      <path d={path} fill="#302a32" shapeRendering="crispEdges" />
    </svg>
  );
}

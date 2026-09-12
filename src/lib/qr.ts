import qrcode from "qrcode-generator";

/**
 * The pairing link as a QR matrix, ready to draw.
 *
 * The encoder itself is `qrcode-generator` — the reference JavaScript
 * implementation, MIT, no dependencies — because a hand-rolled one that is
 * subtly wrong is worse than no QR at all. What lives here is only the part
 * worth testing: turning its module grid into a single SVG path, with the quiet
 * zone the symbol needs.
 *
 * Error correction is M, the middle setting: this is read off a screen held by
 * someone standing next to you, not off a printed label that might be scuffed.
 */
const ERROR_CORRECTION = "M" as const;

/**
 * Four modules of clear space on every side. It is part of the symbol, not
 * decoration — without it a reader cannot separate the finder patterns from
 * whatever the page puts next to them.
 */
export const QUIET_ZONE = 4;

export type QrMatrix = {
  /** One SVG path for every dark module; 841 rects would be a lot of DOM. */
  path: string;
  /** Side length including both quiet zones, for the viewBox. */
  size: number;
  /** Side length in modules, excluding the quiet zone. */
  count: number;
};

export function qrMatrix(value: string): QrMatrix {
  // Type 0 picks the smallest version the data fits in.
  const qr = qrcode(0, ERROR_CORRECTION);
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const parts: string[] = [];
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      // x is the column and y is the row: transposing this produces a symbol
      // that still looks like a QR code and does not scan.
      if (qr.isDark(row, column)) parts.push(`M${column} ${row}h1v1h-1z`);
    }
  }
  return { path: parts.join(""), size: count + QUIET_ZONE * 2, count };
}

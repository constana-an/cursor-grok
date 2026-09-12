import assert from "node:assert/strict";
import test from "node:test";

import qrcode from "qrcode-generator";
const { QUIET_ZONE, qrMatrix } = await import("../src/lib/qr.ts");

/** Reads the rendered path back into the set of cells it actually paints. */
const cellsOf = (path) => new Set(
  [...path.matchAll(/M(-?\d+) (-?\d+)h1v1h-1z/g)].map((match) => `${match[1]},${match[2]}`),
);

const link = "https://shop.example.com/?join=024719";

test("the rendered path paints exactly the modules the encoder marked dark", () => {
  const { path, count } = qrMatrix(link);
  const painted = cellsOf(path);

  // Compared against a fresh encode rather than against the same object, so a
  // transposed loop — which still looks like a QR code and does not scan —
  // cannot agree with itself.
  const reference = qrcode(0, "M");
  reference.addData(link);
  reference.make();
  assert.equal(reference.getModuleCount(), count);

  let dark = 0;
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      // x is the column, y is the row.
      const expected = reference.isDark(row, column);
      assert.equal(painted.has(`${column},${row}`), expected, `module ${row},${column}`);
      if (expected) dark += 1;
    }
  }
  assert.equal(painted.size, dark);
});

test("the three finder patterns are where a reader looks for them", () => {
  const { path, count } = qrMatrix(link);
  const painted = cellsOf(path);
  const corners = [[0, 0], [count - 7, 0], [0, count - 7]];
  for (const [x, y] of corners) {
    // A finder is a 7×7 dark ring with a 3×3 dark core and a 1-module gap.
    assert.ok(painted.has(`${x},${y}`), `finder at ${x},${y} is missing its corner`);
    assert.ok(painted.has(`${x + 3},${y + 3}`), `finder at ${x},${y} is missing its core`);
    assert.ok(!painted.has(`${x + 1},${y + 1}`), `finder at ${x},${y} has no gap`);
  }
});

test("the symbol carries a four-module quiet zone on every side", () => {
  const { size, count } = qrMatrix(link);
  assert.equal(QUIET_ZONE, 4);
  assert.equal(size, count + 8);
});

test("a longer link grows the symbol instead of failing", () => {
  const short = qrMatrix("https://a.co/?join=000001");
  const long = qrMatrix(`https://a-rather-longer-domain-name.example.com/shop/?join=999999`);
  assert.ok(long.count >= short.count);
  assert.ok(short.count >= 21 && long.count <= 177);
});

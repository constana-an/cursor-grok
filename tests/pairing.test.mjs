import assert from "node:assert/strict";
import test from "node:test";

const { cleanCodeInput, isCoupleCode, joinLink, parseJoinCode, syncAge, syncAgeValue } = await import("../src/lib/pairing.ts");

test("a couple code is six digits and nothing else", () => {
  assert.equal(isCoupleCode("024719"), true);
  assert.equal(isCoupleCode("24719"), false);
  assert.equal(isCoupleCode("0247190"), false);
  assert.equal(isCoupleCode("02471a"), false);
  assert.equal(cleanCodeInput("024 719"), "024719");
  assert.equal(cleanCodeInput("code: 024719!!"), "024719");
  assert.equal(cleanCodeInput("0247199999"), "024719");
});

test("a mangled invitation is ignored rather than half-accepted", () => {
  assert.equal(parseJoinCode("?join=024719"), "024719");
  assert.equal(parseJoinCode("?view=orders&join=024719"), "024719");
  // A partly filled field looks like it came from the invitation, which is
  // worse than an empty one.
  assert.equal(parseJoinCode("?join=0247"), null);
  assert.equal(parseJoinCode("?join="), null);
  assert.equal(parseJoinCode("?order=abc"), null);
  assert.equal(parseJoinCode(""), null);
});

test("the invitation keeps whatever path the app is served under", () => {
  assert.equal(joinLink("https://shop.example.com", "/", "024719"), "https://shop.example.com/?join=024719");
  assert.equal(joinLink("https://example.com", "/shop/", "024719"), "https://example.com/shop/?join=024719");
  // A deep link the couple happens to be on must not end up in the invitation.
  assert.equal(joinLink("https://example.com", "/shop/index.html", "024719"), "https://example.com/shop/?join=024719");
});

test("staleness is reported in buckets, not in seconds", () => {
  const now = Date.parse("2026-09-12T12:00:00.000Z");
  const ago = (minutes) => new Date(now - minutes * 60_000).toISOString();
  assert.equal(syncAge(ago(0), now), "now");
  assert.equal(syncAge(ago(1), now), "now");
  assert.equal(syncAge(ago(5), now), "minutes");
  assert.equal(syncAge(ago(59), now), "minutes");
  assert.equal(syncAge(ago(60), now), "hours");
  assert.equal(syncAge(ago(23 * 60), now), "hours");
  assert.equal(syncAge(ago(48 * 60), now), "stale");

  // Nothing read yet is a different thing from read a long time ago.
  assert.equal(syncAge(null, now), null);
  assert.equal(syncAge("not a date", now), null);

  assert.equal(syncAgeValue(ago(5), now), 5);
  assert.equal(syncAgeValue(ago(150), now), 2);
  // Never zero: "synced 0 minutes ago" reads as broken.
  assert.equal(syncAgeValue(ago(0), now), 1);
});

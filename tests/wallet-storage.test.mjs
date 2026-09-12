import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

// storage.ts talks to the browser's localStorage; a Map-backed stand-in is
// enough to exercise the wallet rules without a browser.
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
  // pruneReminders walks the keyspace by index, so the stand-in needs both.
  get length() { return store.size; },
  key: (index) => [...store.keys()][index] ?? null,
};

const {
  OPENING_BALANCE,
  checkinsKey,
  claimsKey,
  loadCheckinDays,
  loadEconomyCoins,
  loadLocalAnniversaries,
  loadTaskClaims,
  pruneReminders,
  remindedKey,
  walletKey,
} = await import("../src/lib/storage.ts");
const { shiftDay, todayKey } = await import("../src/lib/date.ts");

beforeEach(() => store.clear());

test("a brand new wallet opens at the opening balance, not zero", () => {
  // Regression: Number(localStorage.getItem(missing)) is 0, not NaN.
  assert.equal(loadEconomyCoins("大宝"), OPENING_BALANCE);
  assert.equal(loadEconomyCoins("二宝"), OPENING_BALANCE);
});

test("each identity reads and keeps its own balance", () => {
  store.set("couple-shop-economy-version", "4");
  store.set(walletKey("大宝"), "120");
  store.set(walletKey("二宝"), "9");
  assert.equal(loadEconomyCoins("大宝"), 120);
  assert.equal(loadEconomyCoins("二宝"), 9);
});

test("each identity reads its own task claims", () => {
  store.set("couple-shop-economy-version", "4");
  store.set(claimsKey("大宝"), JSON.stringify(["2026-09-17:morning"]));
  assert.deepEqual(loadTaskClaims("大宝"), ["2026-09-17:morning"]);
  assert.deepEqual(loadTaskClaims("二宝"), []);
});

test("corrupt or negative balances fall back to the opening balance", () => {
  store.set("couple-shop-economy-version", "4");
  store.set(walletKey("大宝"), "not-a-number");
  assert.equal(loadEconomyCoins("大宝"), OPENING_BALANCE);
  store.set(walletKey("大宝"), "-5");
  assert.equal(loadEconomyCoins("大宝"), OPENING_BALANCE);
});

test("corrupt claim storage degrades to an empty list", () => {
  store.set("couple-shop-economy-version", "4");
  store.set(claimsKey("大宝"), "{not json");
  assert.deepEqual(loadTaskClaims("大宝"), []);
  store.set(claimsKey("大宝"), JSON.stringify(["ok", 7, null]));
  assert.deepEqual(loadTaskClaims("大宝"), ["ok"]);
});

test("the shared-wallet migration clears both wallets and the legacy keys", () => {
  store.set("couple-shop-economy-version", "3");
  store.set("couple-shop-coins", "203");
  store.set("couple-shop-task-claims", JSON.stringify(["2026-09-17:morning"]));
  store.set(walletKey("大宝"), "77");

  assert.equal(loadEconomyCoins("大宝"), OPENING_BALANCE);
  assert.equal(store.get("couple-shop-economy-version"), "4");
  assert.equal(store.has("couple-shop-coins"), false);
  assert.equal(store.has("couple-shop-task-claims"), false);
  assert.equal(loadEconomyCoins("二宝"), OPENING_BALANCE);
});

test("an identity-less first launch reports the opening balance and no claims", () => {
  assert.equal(loadEconomyCoins(null), OPENING_BALANCE);
  assert.deepEqual(loadTaskClaims(null), []);
});

test("check-in days are per identity and defended against junk", () => {
  const today = todayKey();
  const tomorrow = shiftDay(today, 1);
  store.set(checkinsKey("大宝"), JSON.stringify([today, today, "not-a-day", tomorrow, shiftDay(today, -1)]));
  store.set(checkinsKey("二宝"), JSON.stringify([shiftDay(today, -5)]));

  // Duplicates collapse, invalid keys drop, and a day the calendar has not
  // reached — a wound-forward clock — cannot anchor the streak.
  assert.deepEqual(loadCheckinDays("大宝"), [today, shiftDay(today, -1)]);
  assert.deepEqual(loadCheckinDays("二宝"), [shiftDay(today, -5)]);
  assert.deepEqual(loadCheckinDays(null), []);

  store.set(checkinsKey("大宝"), "{not json");
  assert.deepEqual(loadCheckinDays("大宝"), []);
});

test("check-in history is capped at a year and a day", () => {
  const today = todayKey();
  const days = Array.from({ length: 400 }, (_, index) => shiftDay(today, -index));
  store.set(checkinsKey("大宝"), JSON.stringify(days));
  const loaded = loadCheckinDays("大宝");
  assert.equal(loaded.length, 366);
  assert.equal(loaded[0], today);
});

test("local anniversaries are filtered by the same rules the server enforces", () => {
  store.set("couple-shop-anniversaries", JSON.stringify([
    { id: "ok", title: "第一次见面", eventDate: "2024-05-20", repeatsYearly: true, reminderDays: 3 },
    { id: "no-date", title: "坏日期", eventDate: "2024-13-40", repeatsYearly: true, reminderDays: 3 },
    { id: "long", title: "x".repeat(41), eventDate: "2024-05-20", repeatsYearly: true, reminderDays: 3 },
    { id: "far", title: "提醒太早", eventDate: "2024-05-20", repeatsYearly: true, reminderDays: 99 },
    { id: "loose", title: "类型不对", eventDate: "2024-05-20", repeatsYearly: "yes", reminderDays: 3 },
    null,
  ]));
  assert.deepEqual(loadLocalAnniversaries().map((item) => item.id), ["ok"]);

  store.set("couple-shop-anniversaries", "[[[");
  assert.deepEqual(loadLocalAnniversaries(), []);
});

test("reminder keys from other days are swept, and nothing else is touched", () => {
  const today = todayKey();
  store.set(remindedKey("a", today), "1");
  store.set(remindedKey("a", shiftDay(today, -1)), "1");
  store.set(remindedKey("b", "2024-01-01"), "1");
  store.set(walletKey("大宝"), "42");

  pruneReminders(today);

  assert.equal(store.has(remindedKey("a", today)), true);
  assert.equal(store.has(remindedKey("a", shiftDay(today, -1))), false);
  assert.equal(store.has(remindedKey("b", "2024-01-01")), false);
  assert.equal(store.get(walletKey("大宝")), "42");
});

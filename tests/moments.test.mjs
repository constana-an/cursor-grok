import assert from "node:assert/strict";
import test from "node:test";

const { MENU } = await import("../src/lib/catalog.ts");
const { daysSinceOrdered, frequentItemIds, orderHistory, pinnedItems } = await import("../src/lib/history.ts");
const { SLOT_ITEMS, WAITING_HOURS, buildMoments, slotOfHour } = await import("../src/lib/moments.ts");
const { shiftDay, todayKey } = await import("../src/lib/date.ts");

/** Noon in the shop timezone, so the day key is the same under any TZ. */
const at = (day, hourUtc = 4) => `${day}T${String(hourUtc).padStart(2, "0")}:00:00.000Z`;

const order = (overrides) => ({
  id: "o1",
  itemId: "milk-tea",
  itemName: "奶茶投喂",
  price: 36,
  note: "",
  createdAt: at("2026-01-05"),
  desiredTime: "今晚",
  status: "pending",
  from: "二宝",
  to: "大宝",
  ...overrides,
});

test("history counts what this person ordered, not what they were asked for", () => {
  const history = orderHistory([
    order({ id: "a", from: "大宝", to: "二宝", itemId: "milk-tea", createdAt: at("2026-01-01") }),
    order({ id: "b", from: "大宝", to: "二宝", itemId: "milk-tea", createdAt: at("2026-01-04") }),
    // Sent to them, not by them: their partner's taste, not theirs.
    order({ id: "c", from: "二宝", to: "大宝", itemId: "hotpot" }),
    // Taken back — it was never really wanted.
    order({ id: "d", from: "大宝", to: "二宝", itemId: "cake", status: "cancelled" }),
    // Declined still counts: wanting it was real.
    order({ id: "e", from: "大宝", to: "二宝", itemId: "bbq", status: "rejected", createdAt: at("2026-01-02") }),
  ], "大宝");

  assert.equal(history.get("milk-tea").count, 2);
  assert.equal(history.get("milk-tea").lastOn, "2026-01-04");
  assert.equal(history.get("hotpot"), undefined);
  assert.equal(history.get("cake"), undefined);
  assert.equal(history.get("bbq").count, 1);
});

test("one order is a try, two is a habit", () => {
  const history = new Map([
    ["milk-tea", { count: 3, lastOn: "2026-01-02" }],
    ["hotpot", { count: 3, lastOn: "2026-01-09" }],
    ["cake", { count: 2, lastOn: "2026-01-01" }],
    ["bbq", { count: 1, lastOn: "2026-01-10" }],
  ]);
  // Most ordered first, most recent as the tie-break, the single try left out.
  assert.deepEqual(frequentItemIds(history), ["hotpot", "milk-tea", "cake"]);
  assert.equal(daysSinceOrdered(history, "cake", "2026-01-08"), 7);
  assert.equal(daysSinceOrdered(history, "cake", "2026-01-01"), 0);
  assert.equal(daysSinceOrdered(history, "sushi", "2026-01-08"), null);
});

test("the pinned rail is starred wishes first, then habits, each once", () => {
  const history = new Map([
    ["hotpot", { count: 4, lastOn: "2026-01-09" }],
    ["cake", { count: 2, lastOn: "2026-01-01" }],
  ]);
  const picked = pinnedItems({
    menu: MENU,
    customItems: [{ id: "custom-1", category: "care", name: "陪我去菜市场", description: "", price: 30, tint: "#fff", custom: true }],
    favouriteIds: ["custom-1", "hotpot"],
    history,
    usedLimitedIds: [],
  });
  assert.deepEqual(picked.map((item) => item.id), ["custom-1", "hotpot", "cake"]);

  // A coupon that has been spent is dropped, not pinned as a dead card.
  const spent = pinnedItems({
    menu: MENU,
    customItems: [],
    favouriteIds: ["forgive", "hotpot"],
    history: new Map(),
    usedLimitedIds: ["forgive"],
  });
  assert.deepEqual(spent.map((item) => item.id), ["hotpot"]);
});

test("every item a time slot points at is still on the menu", () => {
  for (const [slot, ids] of Object.entries(SLOT_ITEMS)) {
    for (const id of ids) {
      assert.ok(MENU.some((item) => item.id === id), `${slot} points at a retired item: ${id}`);
    }
  }
});

test("the hour picks the slot", () => {
  assert.equal(slotOfHour(7), "morning");
  assert.equal(slotOfHour(12), "midday");
  assert.equal(slotOfHour(15), "afternoon");
  assert.equal(slotOfHour(20), "evening");
  assert.equal(slotOfHour(23), "night");
  assert.equal(slotOfHour(3), "night");
});

test("an unanswered wish is the moment, and it says how long it waited", () => {
  const now = new Date(2026, 0, 5, 21, 0, 0);
  const created = new Date(now.getTime() - (WAITING_HOURS + 2) * 3_600_000).toISOString();
  const moments = buildMoments({
    orders: [
      order({ id: "a", createdAt: created }),
      order({ id: "b", createdAt: new Date(now.getTime() - 3_600_000).toISOString() }),
    ],
    anniversaries: [],
    currentName: "大宝",
    coins: 500,
    history: new Map(),
    now,
    today: "2026-01-05",
  });
  assert.equal(moments[0].kind, "answer");
  // Oldest first: the one that has waited longest is the one to answer.
  assert.equal(moments[0].order.id, "a");
  assert.equal(moments[0].count, 2);
  assert.equal(moments[0].waitedHours, WAITING_HOURS + 2);
});

test("something said yes to and not finished is still owed", () => {
  const now = new Date(2026, 0, 5, 21, 0, 0);
  const moments = buildMoments({
    orders: [order({ id: "a", status: "accepted" }), order({ id: "b", status: "doing" })],
    anniversaries: [],
    currentName: "大宝",
    coins: 500,
    history: new Map(),
    now,
    today: "2026-01-05",
  });
  assert.equal(moments[0].kind, "promised");
  assert.equal(moments[0].count, 2);
});

test("nothing owed, so: one thing that suits the hour", () => {
  const now = new Date(2026, 0, 5, 8, 0, 0);
  const base = {
    orders: [order({ id: "a", from: "大宝", to: "二宝", status: "done" })],
    anniversaries: [],
    currentName: "大宝",
    history: new Map(),
    now,
    today: "2026-01-05",
  };
  const rich = buildMoments({ ...base, coins: 500 });
  assert.equal(rich[0].kind, "timely");
  assert.equal(rich[0].slot, "morning");
  assert.ok(SLOT_ITEMS.morning.includes(rich[0].item.id));
  assert.equal(rich[0].affordable, true);
  assert.equal(rich[0].short, 0);

  // Out of reach says so rather than pretending it is available.
  const broke = buildMoments({ ...base, coins: 0 });
  assert.equal(broke[0].affordable, false);
  assert.equal(broke[0].short, broke[0].item.price);
});

test("a first run is left to the opening checklist alone", () => {
  const moments = buildMoments({
    orders: [],
    anniversaries: [],
    currentName: "大宝",
    coins: 500,
    history: new Map(),
    now: new Date(2026, 0, 5, 8, 0, 0),
    today: "2026-01-05",
  });
  assert.deepEqual(moments, []);
});

test("an anniversary joins the list, and the list never grows past two", () => {
  const now = new Date(2026, 0, 5, 21, 0, 0);
  // Anchored to the real today: `dueAnniversary` reads the calendar itself,
  // because a reminder window is about the day it actually is.
  const anniversaries = [{ id: "an1", title: "在一起一周年", eventDate: shiftDay(todayKey(), 2), repeatsYearly: false, reminderDays: 7 }];
  const withOne = buildMoments({
    orders: [order({ id: "a", status: "done", from: "大宝", to: "二宝" })],
    anniversaries,
    currentName: "大宝",
    coins: 500,
    history: new Map(),
    now,
    today: "2026-01-05",
  });
  assert.equal(withOne[0].kind, "anniversary");
  assert.equal(withOne[0].days, 2);

  const crowded = buildMoments({
    orders: [order({ id: "a" }), order({ id: "b", status: "accepted" })],
    anniversaries,
    currentName: "大宝",
    coins: 500,
    history: new Map(),
    now,
    today: "2026-01-05",
  });
  assert.equal(crowded.length, 2);
  assert.deepEqual(crowded.map((moment) => moment.kind), ["answer", "promised"]);
});

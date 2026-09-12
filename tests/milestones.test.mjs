import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

// storage.ts talks to the browser's localStorage; a Map-backed stand-in is
// enough to exercise the celebration bookkeeping without a browser.
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
  get length() { return store.size; },
  key: (index) => [...store.keys()][index] ?? null,
};

const { MILESTONES, earnedInWeek, milestoneUnit, nextMilestone, reachedMilestones } = await import("../src/lib/catalog.ts");
const { loadCelebratedMilestones, milestonesKey } = await import("../src/lib/storage.ts");
const { weekKey, shiftDay, todayKey } = await import("../src/lib/date.ts");

beforeEach(() => store.clear());

test("every milestone has copy of its own and a positive threshold", () => {
  const ids = new Set();
  const bodies = new Set();
  for (const milestone of MILESTONES) {
    assert.ok(milestone.threshold > 0, `${milestone.id} needs a positive threshold`);
    assert.ok(milestone.title.length > 0 && milestone.body.length > 0);
    assert.ok(!ids.has(milestone.id), `duplicate id ${milestone.id}`);
    // A templated body would read as "恭喜达成 X"; each moment gets its own line.
    assert.ok(!bodies.has(milestone.body), `duplicate body on ${milestone.id}`);
    assert.ok(milestoneUnit[milestone.kind], `${milestone.kind} needs a unit`);
    ids.add(milestone.id);
    bodies.add(milestone.body);
  }
});

test("a counter reaching a threshold exactly counts as reached", () => {
  const none = reachedMilestones({ days: 99, wishes: 0, streak: 0 });
  assert.deepEqual(none, []);
  const reached = reachedMilestones({ days: 100, wishes: 0, streak: 0 });
  assert.deepEqual(reached.map((item) => item.id), ["days-100"]);
});

test("each counter only unlocks its own kind", () => {
  const reached = reachedMilestones({ days: 0, wishes: 50, streak: 0 }).map((item) => item.id);
  assert.deepEqual(reached, ["wishes-1", "wishes-10", "wishes-50"]);
});

test("the next milestone is the nearest one, not the next one listed", () => {
  // 相爱 1000 天 is listed before 第 10 个心愿; the closer target must win.
  const next = nextMilestone({ days: 990, wishes: 9, streak: 0 });
  assert.equal(next.milestone.id, "wishes-10");
  assert.equal(next.remaining, 1);
});

test("nothing is upcoming once every milestone is passed", () => {
  assert.equal(nextMilestone({ days: 99_999, wishes: 99_999, streak: 99_999 }), null);
});

test("celebrated milestones are remembered per identity", () => {
  store.set(milestonesKey("大宝"), JSON.stringify(["days-100", "wishes-1"]));
  assert.deepEqual(loadCelebratedMilestones("大宝"), ["days-100", "wishes-1"]);
  // 二宝 has not seen their own celebration yet, even on a shared device.
  assert.deepEqual(loadCelebratedMilestones("二宝"), []);
  assert.deepEqual(loadCelebratedMilestones(null), []);
});

test("celebration storage survives junk and collapses duplicates", () => {
  store.set(milestonesKey("大宝"), "{not json");
  assert.deepEqual(loadCelebratedMilestones("大宝"), []);
  store.set(milestonesKey("大宝"), JSON.stringify(["days-100", "days-100", 7, null]));
  assert.deepEqual(loadCelebratedMilestones("大宝"), ["days-100"]);
});

test("weekly earnings count this week's claims only", () => {
  const monday = weekKey();
  const today = todayKey();
  const claims = [
    `${today}:morning`,           // +1, this week
    `${today}:focus`,             // +3, this week
    `${monday}:date-task`,        // +10, the weekly slot
    `${shiftDay(monday, -7)}:focus`, // last week, ignored
    `${shiftDay(today, 3)}:focus`,   // a wound-forward clock, ignored
    `${today}:no-such-task`,      // unknown id contributes nothing
  ];
  assert.equal(earnedInWeek(claims), 14);
  assert.equal(earnedInWeek([]), 0);
});

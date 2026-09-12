import assert from "node:assert/strict";
import { test } from "node:test";
import { TASKS, WISH_TEMPLATES, promptOfDay, taskRequirementMet } from "../src/lib/catalog.ts";
import { todayKey, weekKey } from "../src/lib/date.ts";

const taskFor = (id) => TASKS.find((task) => task.id === id);
const shiftDays = (days) => new Date(Date.now() + days * 86_400_000).toISOString();
/** Safely inside the previous period, whatever day of the week it is today. */
const lastWeek = new Date(`${weekKey()}T00:00:00Z`);
const beforeThisWeek = new Date(lastWeek.getTime() - 86_400_000).toISOString();

const doneOrder = (overrides = {}) => ({
  id: "o1",
  itemId: "fruit-tea",
  itemName: "缤纷水果茶",
  price: 28,
  note: "",
  createdAt: shiftDays(0),
  desiredTime: "尽快",
  status: "done",
  from: "二宝",
  to: "大宝",
  ...overrides,
});

const context = (overrides = {}) => ({
  orders: [],
  memories: [],
  currentName: "大宝",
  currentUserId: "user-1",
  memoriesTracked: true,
  ...overrides,
});

test("tasks nothing can witness stay claimable by hand", () => {
  for (const id of ["morning", "compliment", "mood", "focus", "walk-task"]) {
    assert.equal(taskFor(id).requires, undefined);
    assert.equal(taskRequirementMet(taskFor(id), context()), true);
  }
});

test("the photo task waits for a photo this person uploaded this week", () => {
  const task = taskFor("photo");
  assert.equal(taskRequirementMet(task, context()), false);
  assert.equal(
    taskRequirementMet(task, context({ memories: [{ id: "m", caption: "", happenedOn: todayKey(), createdAt: shiftDays(0), createdBy: "user-1" }] })),
    true,
  );
  // The partner's upload earns the partner's copy of the task, not mine.
  assert.equal(
    taskRequirementMet(task, context({ memories: [{ id: "m", caption: "", happenedOn: todayKey(), createdAt: shiftDays(0), createdBy: "user-2" }] })),
    false,
  );
  // Last week's photo does not pay for this week.
  assert.equal(
    taskRequirementMet(task, context({ memories: [{ id: "m", caption: "", happenedOn: todayKey(), createdAt: beforeThisWeek, createdBy: "user-1" }] })),
    false,
  );
});

test("local mode has no album, so the photo task stays on the honour system", () => {
  assert.equal(taskRequirementMet(taskFor("photo"), context({ memoriesTracked: false })), true);
});

test("the order task belongs to whoever did the thing, not whoever asked", () => {
  const task = taskFor("order-task");
  assert.equal(taskRequirementMet(task, context()), false);
  assert.equal(taskRequirementMet(task, context({ orders: [doneOrder()] })), true);
  // 大宝 sent this one, so finishing it is 二宝's task, not 大宝's.
  assert.equal(taskRequirementMet(task, context({ orders: [doneOrder({ from: "大宝", to: "二宝" })] })), false);
  assert.equal(taskRequirementMet(task, context({ orders: [doneOrder({ status: "doing" })] })), false);
});

test("completion time decides the period, not the time the wish was ordered", () => {
  const task = taskFor("order-task");
  const oldWish = { createdAt: "2024-01-05T10:00:00.000Z" };
  assert.equal(taskRequirementMet(task, context({ orders: [doneOrder(oldWish)] })), false);
  assert.equal(
    taskRequirementMet(task, context({ orders: [doneOrder({ ...oldWish, completedAt: shiftDays(0) })] })),
    true,
  );
  assert.equal(
    taskRequirementMet(task, context({ orders: [doneOrder({ createdAt: shiftDays(0), completedAt: beforeThisWeek })] })),
    false,
  );
});

test("the date task additionally requires a 去约会 wish", () => {
  const task = taskFor("date-task");
  assert.equal(taskRequirementMet(task, context({ orders: [doneOrder()] })), false);
  assert.equal(taskRequirementMet(task, context({ orders: [doneOrder({ itemId: "movie", itemName: "电影之夜" })] })), true);
});

test("both phones get the same daily prompt, and it changes with the day", () => {
  // Derived from the calendar day alone: if it depended on the identity or the
  // wallet, "今天聊这个" would mean two different things on the two phones.
  assert.deepEqual(promptOfDay("2026-09-17"), promptOfDay("2026-09-17"));
  const week = ["2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21"]
    .map((day) => promptOfDay(day).topic);
  assert.equal(new Set(week).size, week.length, "a week should not repeat itself");
  for (const prompt of week) assert.ok(prompt.length > 0);
});

test("every wish template fits the rules the server enforces", () => {
  for (const template of WISH_TEMPLATES) {
    assert.ok(template.name.length >= 1 && template.name.length <= 20, template.name);
    assert.ok(template.description.length <= 40, template.name);
    assert.ok(template.price >= 8 && template.price <= 400, template.name);
    // 限定券 is a curated set; a template must never point there.
    assert.notEqual(template.category, "limited");
  }
});

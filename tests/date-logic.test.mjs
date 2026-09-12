import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APP_TIME_ZONE,
  dateKey,
  daysBetween,
  checkinStatusFrom,
  checkinStreak,
  daysUntilAnniversary,
  dueAnniversaries,
  dueAnniversary,
  formatStartedOn,
  isPastOneOff,
  isValidDateKey,
  shiftDay,
  normalizeDateInput,
  relationshipDays,
  todayKey,
  weekKey,
} from "../src/lib/date.ts";

// 2026-09-16T19:00:00Z is 03:00 on Thursday 2026-09-17 in Asia/Shanghai.
const earlyMorning = new Date("2026-09-16T19:00:00Z");
// 2026-09-17T04:00:00Z is 12:00 on the same Thursday.
const midday = new Date("2026-09-17T04:00:00Z");

test("day keys follow the shop timezone, not UTC", () => {
  assert.equal(APP_TIME_ZONE, "Asia/Shanghai");
  assert.equal(dateKey(earlyMorning), "2026-09-17");
  assert.equal(dateKey(midday), "2026-09-17");
});

test("the day key is stable across the whole shop day", () => {
  assert.equal(dateKey(earlyMorning), dateKey(midday));
});

test("week keys resolve to Monday at every hour of the day", () => {
  // Regression: deriving the key from toISOString() returned the *Sunday*
  // before 08:00 local, so a claimed weekly task rendered as unclaimed and
  // could be claimed a second time in the same week.
  assert.equal(weekKey(earlyMorning), "2026-09-14");
  assert.equal(weekKey(midday), "2026-09-14");
});

test("week keys agree with Postgres date_trunc('week') at week edges", () => {
  // Monday 2026-09-14 00:30 Shanghai is still 2026-09-13 in UTC.
  assert.equal(weekKey(new Date("2026-09-13T16:30:00Z")), "2026-09-14");
  // Sunday 2026-09-13 23:30 Shanghai belongs to the previous week.
  assert.equal(weekKey(new Date("2026-09-13T15:30:00Z")), "2026-09-07");
});

test("date keys are validated strictly", () => {
  assert.equal(isValidDateKey("2024-05-20"), true);
  assert.equal(isValidDateKey("2024-02-30"), false);
  assert.equal(isValidDateKey("2024-5-20"), false);
  assert.equal(isValidDateKey(""), false);
  assert.equal(isValidDateKey("not-a-date"), false);
});

test("daysBetween counts whole calendar days across a month boundary", () => {
  assert.equal(daysBetween("2026-09-14", "2026-09-17"), 3);
  assert.equal(daysBetween("2026-09-30", "2026-10-01"), 1);
  assert.equal(daysBetween("2026-09-17", "2026-09-14"), -3);
});

test("the first day together counts as day 1", () => {
  assert.equal(relationshipDays(todayKey()), 1);
  assert.equal(relationshipDays("not-a-date"), 1);
  const yesterday = dateKey(new Date(Date.now() - 86_400_000));
  assert.equal(relationshipDays(yesterday), 2);
});

test("anniversary countdown is measured in shop-timezone days", () => {
  const today = todayKey();
  const tomorrow = dateKey(new Date(Date.now() + 86_400_000));
  assert.equal(daysUntilAnniversary(today, true), 0);
  assert.equal(daysUntilAnniversary(tomorrow, true), 1);
  assert.equal(daysUntilAnniversary("not-a-date", true), 0);
});

test("a past one-off anniversary never reports a negative countdown", () => {
  assert.equal(daysUntilAnniversary("2020-01-01", false), 0);
});

test("a one-off date is only 'past' once it has actually happened", () => {
  assert.equal(isPastOneOff("2020-01-01", false), true);
  // Repeating dates come round again, so they are never past.
  assert.equal(isPastOneOff("2020-01-01", true), false);
  assert.equal(isPastOneOff(todayKey(), false), false);
  assert.equal(isPastOneOff("not-a-date", false), false);
});

test("reminders skip one-off dates that have already happened", () => {
  // Regression: daysUntilAnniversary clamps a past one-off to 0, which sits
  // inside every reminder window — the shop re-announced "今天是「领证日」"
  // every single day, forever, for a date years gone.
  assert.equal(dueAnniversary([{ eventDate: "2020-01-01", repeatsYearly: false, reminderDays: 3 }]), null);
  assert.equal(dueAnniversary([]), null);
});

test("the soonest anniversary inside its own reminder window wins", () => {
  const today = todayKey();
  const inThreeDays = dateKey(new Date(Date.now() + 3 * 86_400_000));
  const soon = { eventDate: inThreeDays, repeatsYearly: true, reminderDays: 7 };
  const now = { eventDate: today, repeatsYearly: false, reminderDays: 0 };

  assert.equal(dueAnniversary([soon]).days, 3);
  // Each entry is judged against its own window, not a shared one.
  assert.equal(dueAnniversary([{ ...soon, reminderDays: 1 }]), null);
  assert.equal(dueAnniversary([soon, now]).item, now);
});

test("every anniversary inside its window is due, soonest first", () => {
  const today = todayKey();
  const inTwoDays = dateKey(new Date(Date.now() + 2 * 86_400_000));
  const due = dueAnniversaries([
    { eventDate: inTwoDays, repeatsYearly: true, reminderDays: 7 },
    { eventDate: today, repeatsYearly: true, reminderDays: 0 },
    { eventDate: "2020-01-01", repeatsYearly: false, reminderDays: 3 },
  ]);
  // Regression: only the soonest one was ever announced, so a second
  // anniversary in the same window was silently skipped for good.
  assert.deepEqual(due.map((entry) => entry.days), [0, 2]);
});

test("a check-in streak is anchored to today, or to yesterday when today is unclaimed", () => {
  const today = todayKey();
  const yesterday = shiftDay(today, -1);
  const dayBefore = shiftDay(today, -2);

  assert.equal(checkinStreak([], today), 0);
  assert.equal(checkinStreak([today], today), 1);
  assert.equal(checkinStreak([today, yesterday], today), 2);
  // Not claimed yet today: the streak survives rather than reading 0 all morning.
  assert.deepEqual(checkinStatusFrom([yesterday], today), { streak: 1, checkedToday: false });
  assert.deepEqual(checkinStatusFrom([today, yesterday], today), { streak: 2, checkedToday: true });
  // A gap ends the run; nothing behind it can re-align.
  assert.equal(checkinStreak([today, dayBefore], today), 1);
  assert.equal(checkinStreak([dayBefore], today), 0);
  // Unsorted and duplicated input is tolerated, and junk is ignored.
  assert.equal(checkinStreak([yesterday, today, today, "nope"], today), 2);
});

test("check-in streaks cross month and year boundaries", () => {
  assert.equal(checkinStreak(["2026-03-01", "2026-02-28", "2026-02-27"], "2026-03-01"), 3);
  assert.equal(checkinStreak(["2026-01-01", "2025-12-31"], "2026-01-01"), 2);
  assert.equal(shiftDay("2026-01-01", -1), "2025-12-31");
});

test("typed digits become a YYYY-MM-DD draft", () => {
  assert.equal(normalizeDateInput("2024"), "2024");
  assert.equal(normalizeDateInput("202405"), "2024-05");
  assert.equal(normalizeDateInput("20240520"), "2024-05-20");
  assert.equal(normalizeDateInput("2024/05/20"), "2024-05-20");
  assert.equal(normalizeDateInput("2024052099"), "2024-05-20");
});

test("start dates render as Chinese copy", () => {
  assert.equal(formatStartedOn("2024-05-20"), "2024 年 5 月 20 日");
  assert.equal(formatStartedOn(""), "尚未设置");
});


import type { Lang } from "./i18n.ts";

/**
 * All period keys (daily task refresh, weekly task refresh, check-in day) are
 * anchored to a single shop timezone instead of the device timezone or UTC.
 *
 * Why: the server grants rewards with `(now() at time zone APP_TIME_ZONE)::date`.
 * If the client derived its keys from `toISOString()` (UTC) or from the raw
 * device timezone, the two sides would disagree for part of every day and a
 * claimed task would render as unclaimed — or, in local mode, a weekly task
 * could be claimed twice in one week.
 */
export const APP_TIME_ZONE = "Asia/Shanghai";

/**
 * Month names are spelled out rather than taken from `Intl` so a date key is
 * formatted from its own digits, with no chance of a timezone shifting it a day
 * either way. The default stays Chinese: every caller that has not been taught
 * about the language switch keeps the wording it always had.
 */
const EN_MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The `YYYY-MM-DD` calendar day of `value` in the shop timezone. */
export function dateKey(value: Date = new Date()): string {
  return dayKeyFormatter.format(value);
}

export function todayKey(): string {
  return dateKey();
}

/** The `YYYY-MM-DD` day of an ISO timestamp, or null if unparseable. */
export function dayKeyOf(value: string): string | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : dateKey(parsed);
}

/** The `YYYY-MM` calendar month of an ISO timestamp, or null if unparseable. */
export function monthKeyOf(value: string): string | null {
  return dayKeyOf(value)?.slice(0, 7) ?? null;
}

export function thisMonthKey(): string {
  return dateKey().slice(0, 7);
}

/** "2026-08" as the couple would read it, with this year's month left bare. */
export function formatMonthKey(monthKey: string, today: string = dateKey(), lang: Lang = "zh"): string {
  const [year, month] = monthKey.split("-");
  const thisYear = year === today.slice(0, 4);
  if (lang === "en") {
    const label = EN_MONTHS[Number(month) - 1] ?? monthKey;
    return thisYear ? label : `${label} ${year}`;
  }
  const label = `${Number(month)} 月`;
  return thisYear ? label : `${year} 年 ${label}`;
}

/** Parses `YYYY-MM-DD` into a UTC-midnight anchor for calendar-only math. */
function anchorOf(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const anchor = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(anchor.getTime()) ? null : anchor;
}

/** The Monday of `value`'s week, as `YYYY-MM-DD` in the shop timezone. */
export function weekKey(value: Date = new Date()): string {
  const anchor = anchorOf(dateKey(value))!;
  const weekday = anchor.getUTCDay() || 7;
  anchor.setUTCDate(anchor.getUTCDate() - weekday + 1);
  return anchor.toISOString().slice(0, 10);
}

/** `key` moved by `delta` calendar days, still as `YYYY-MM-DD`. */
export function shiftDay(key: string, delta: number): string {
  const anchor = anchorOf(key);
  if (!anchor) return key;
  anchor.setUTCDate(anchor.getUTCDate() + delta);
  return anchor.toISOString().slice(0, 10);
}

export function isValidDateKey(key: string): boolean {
  const anchor = anchorOf(key);
  return anchor !== null && anchor.toISOString().slice(0, 10) === key;
}

/** Whole days between two `YYYY-MM-DD` keys (`to - from`). */
export function daysBetween(fromKey: string, toKey: string): number {
  const from = anchorOf(fromKey);
  const to = anchorOf(toKey);
  if (!from || !to) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** Day 1 is the start date itself, so a couple is never on "day 0". */
export function relationshipDays(startedOn: string): number {
  if (!isValidDateKey(startedOn)) return 1;
  return Math.max(1, daysBetween(startedOn, todayKey()) + 1);
}

export function formatStartedOn(startedOn: string, lang: Lang = "zh"): string {
  const [year, month, day] = startedOn.split("-");
  if (!year || !month || !day) return lang === "en" ? "Not set yet" : "尚未设置";
  if (lang === "en") return `${EN_MONTHS[Number(month) - 1] ?? month} ${Number(day)}, ${year}`;
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

/** Progressively formats digits typed into a date field as `YYYY-MM-DD`. */
export function normalizeDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export function daysUntilAnniversary(eventDate: string, repeatsYearly: boolean): number {
  const source = anchorOf(eventDate);
  const today = anchorOf(todayKey());
  if (!source || !today) return 0;
  let target = source;
  if (repeatsYearly) {
    target = new Date(Date.UTC(today.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
    if (target < today) target = new Date(Date.UTC(today.getUTCFullYear() + 1, source.getUTCMonth(), source.getUTCDate()));
  }
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86_400_000));
}

type AnniversaryLike = { eventDate: string; repeatsYearly: boolean; reminderDays: number };

/** A date that happens once and has already happened never comes round again. */
export function isPastOneOff(eventDate: string, repeatsYearly: boolean): boolean {
  return !repeatsYearly && isValidDateKey(eventDate) && eventDate < todayKey();
}

/**
 * The anniversary whose reminder window is open today, soonest first.
 *
 * Past one-off dates are dropped rather than counted: `daysUntilAnniversary`
 * clamps them to 0, so they would otherwise sit permanently inside every
 * reminder window and announce themselves as "今天" every single day.
 */
export function dueAnniversaries<T extends AnniversaryLike>(items: readonly T[]): Array<{ item: T; days: number }> {
  return items
    .filter((item) => !isPastOneOff(item.eventDate, item.repeatsYearly))
    .map((item) => ({ item, days: daysUntilAnniversary(item.eventDate, item.repeatsYearly) }))
    .filter(({ item, days }) => days <= item.reminderDays)
    .sort((a, b) => a.days - b.days);
}

export function dueAnniversary<T extends AnniversaryLike>(items: readonly T[]): { item: T; days: number } | null {
  return dueAnniversaries(items)[0] ?? null;
}

/**
 * Mirrors `public.checkin_streak`: the run is anchored to today when today has
 * been checked in, and to yesterday otherwise — so a streak survives a day that
 * has not been claimed *yet* instead of reading 0 every morning. Drifting from
 * this would make the number jump the moment a local couple pairs with the cloud.
 */
export function checkinStreak(days: readonly string[], today: string = todayKey()): number {
  const checked = new Set(days.filter(isValidDateKey));
  let cursor = checked.has(today) ? today : shiftDay(today, -1);
  let streak = 0;
  while (checked.has(cursor)) {
    streak += 1;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

export function checkinStatusFrom(days: readonly string[], today: string = todayKey()): { streak: number; checkedToday: boolean } {
  return { streak: checkinStreak(days, today), checkedToday: days.includes(today) };
}

export function relativeTime(value: string, lang: Lang = "zh"): string {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return lang === "en" ? `${minutes} min ago` : `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (minutes < 1440) return lang === "en" ? `${hours} h ago` : `${hours} 小时前`;
  const days = Math.floor(minutes / 1440);
  return lang === "en" ? `${days} d ago` : `${days} 天前`;
}

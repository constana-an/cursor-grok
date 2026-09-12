import { MENU } from "./catalog.ts";
import { dueAnniversary, todayKey } from "./date.ts";
import { daysSinceOrdered, type ItemHistory } from "./history.ts";
import type { Anniversary, MenuItem, Order } from "./types.ts";

/**
 * 此刻 — what actually deserves a response right now.
 *
 * The shop page used to open on a category rail and forty cards, which asks the
 * same question every single time: *pick something*. But most of the time the
 * thing that matters is not a purchase at all. It is that the other person sent
 * a wish an hour ago and nobody has answered it; or that something was promised
 * on Tuesday and it is Thursday; or that an anniversary is in three days.
 *
 * Everything on this page is derived from the order list, the anniversary list
 * and the clock. Nothing here is stored, so there is nothing to keep in sync
 * and nothing that can go stale.
 *
 * The copy lives in the screen, not here. This file decides *what* is worth
 * saying and in what order; how it reads in Chinese or English is the
 * dictionary's business.
 */

export type TimeSlot = "morning" | "midday" | "afternoon" | "evening" | "night";

export type Moment =
  /** They asked for something and it has not been answered. */
  | { kind: "answer"; id: string; order: Order; count: number; waitedHours: number }
  /** This person said yes and has not finished it yet. */
  | { kind: "promised"; id: string; order: Order; count: number }
  /** Something the two of them are both heading towards. */
  | { kind: "anniversary"; id: string; anniversary: Anniversary; days: number }
  /** Nothing is owed, so: one small thing that suits the hour. */
  | { kind: "timely"; id: string; item: MenuItem; slot: TimeSlot; affordable: boolean; short: number };

/**
 * A wish that has waited this long stops reading as "just arrived" and starts
 * reading as unanswered. Half a day is deliberately generous: people sleep,
 * work, and are allowed to not be holding their phone.
 */
export const WAITING_HOURS = 12;

/**
 * What suits an hour of the day. These are suggestions, not rules, so each slot
 * lists several and the first one this person can afford and has not ordered
 * recently is the one that gets offered.
 *
 * `tests/moments.test.mjs` checks every id here is still on the menu, so
 * retiring an item cannot leave this table pointing at nothing.
 */
export const SLOT_ITEMS: Record<TimeSlot, readonly string[]> = {
  morning: ["breakfast", "wake-up", "fruit-tea"],
  midday: ["milk-tea", "sushi", "fried-chicken"],
  afternoon: ["ice-cream", "coffee", "walk"],
  evening: ["hotpot", "movie", "bbq"],
  night: ["sleep", "hug", "no-phone"],
};

/** What a weekend afternoon is for, when the couple has the coins for it. */
const WEEKEND_ITEMS: readonly string[] = ["walk", "sunset", "picnic", "movie", "coffee"];

export function slotOfHour(hour: number): TimeSlot {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "midday";
  if (hour >= 14 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

/** Ordered oldest first: the one that has waited longest is the one to answer. */
const byOldest = (a: Order, b: Order) => (a.createdAt < b.createdAt ? -1 : 1);

const hoursSince = (value: string, now: Date): number => {
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.floor((now.getTime() - parsed) / 3_600_000));
};

/**
 * The wish to offer for this hour.
 *
 * Preference order: something affordable that has not been ordered in the last
 * week, then anything affordable, then the cheapest in the slot — which will
 * say "还差 N 币" on the card rather than pretending it is available. A weekend
 * daytime looks at the date wishes first, because that is when they are
 * possible at all.
 */
function timelyItem(input: {
  slot: TimeSlot;
  weekend: boolean;
  coins: number;
  history: Map<string, ItemHistory>;
  today: string;
}): MenuItem | null {
  const { slot, weekend, coins, history, today } = input;
  const daytime = slot === "morning" || slot === "midday" || slot === "afternoon";
  const ids = weekend && daytime ? [...WEEKEND_ITEMS, ...SLOT_ITEMS[slot]] : SLOT_ITEMS[slot];
  const candidates = ids
    .map((id) => MENU.find((item) => item.id === id))
    .filter((item): item is MenuItem => Boolean(item));
  if (candidates.length === 0) return null;
  const affordable = candidates.filter((item) => item.price <= coins);
  const fresh = affordable.filter((item) => {
    const days = daysSinceOrdered(history, item.id, today);
    return days === null || days >= 7;
  });
  if (fresh.length > 0) return fresh[0];
  if (affordable.length > 0) return affordable[0];
  return candidates.reduce((cheapest, item) => (item.price < cheapest.price ? item : cheapest));
}

/**
 * At most two cards. 此刻 is supposed to be the shortest part of the page: a
 * third card would turn "the thing to do now" back into a list to choose from.
 */
const LIMIT = 2;

export function buildMoments(input: {
  orders: readonly Order[];
  anniversaries: readonly Anniversary[];
  /** Display name of this device's identity — the recipient of what it must answer. */
  currentName: string;
  coins: number;
  history: Map<string, ItemHistory>;
  /** The clock, for the hour and the weekday. Injected by the tests. */
  now?: Date;
  /** Today's shop-timezone day key, used for "how long since we ordered this".
      An anniversary's reminder window reads the calendar itself. */
  today?: string;
}): Moment[] {
  const { orders, anniversaries, currentName, coins, history } = input;
  const now = input.now ?? new Date();
  const today = input.today ?? todayKey();

  const waiting = orders.filter((order) => order.to === currentName && order.status === "pending").sort(byOldest);
  const promised = orders
    .filter((order) => order.to === currentName && (order.status === "accepted" || order.status === "doing"))
    .sort(byOldest);

  const moments: Moment[] = [];
  if (waiting.length > 0) {
    moments.push({
      kind: "answer",
      id: `answer-${waiting[0].id}`,
      order: waiting[0],
      count: waiting.length,
      waitedHours: hoursSince(waiting[0].createdAt, now),
    });
  }
  if (promised.length > 0) {
    moments.push({ kind: "promised", id: `promised-${promised[0].id}`, order: promised[0], count: promised.length });
  }

  const due = dueAnniversary(anniversaries);
  if (due && moments.length < LIMIT) {
    moments.push({ kind: "anniversary", id: `anniversary-${due.item.id}`, anniversary: due.item, days: due.days });
  }

  // The suggestion only appears once the shop has actually been used. On a
  // first run the opening checklist is already saying what to do next, and two
  // things competing to be the first instruction is how people end up doing
  // neither.
  if (moments.length === 0 && orders.length > 0) {
    const slot = slotOfHour(now.getHours());
    const weekend = now.getDay() === 0 || now.getDay() === 6;
    const item = timelyItem({ slot, weekend, coins, history, today });
    if (item) {
      moments.push({
        kind: "timely",
        id: `timely-${item.id}`,
        item,
        slot,
        affordable: item.price <= coins,
        short: Math.max(0, item.price - coins),
      });
    }
  }

  return moments.slice(0, LIMIT);
}

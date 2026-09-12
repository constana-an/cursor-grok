import { dayKeyOf, daysBetween, todayKey } from "./date.ts";
import type { MenuItem, Order } from "./types.ts";

/**
 * What this couple actually orders.
 *
 * The shipped menu is 40 items long and it is the same 40 for everybody. After
 * a fortnight that stops being a menu and starts being a wall: the three or
 * four things they really ask for are somewhere in the middle of it, and
 * finding them again costs the same scroll every time.
 *
 * Everything here is derived from the order list that is already on screen —
 * no new table, no new column, nothing to synchronise. Two people who use the
 * shop differently end up looking at two differently ordered shops, which is
 * the whole point.
 */

export type ItemHistory = {
  /** How many times this person has ordered it. */
  count: number;
  /** The `YYYY-MM-DD` of the most recent time, for "上次是什么时候". */
  lastOn: string;
};

/**
 * Counts and last-ordered dates per item id, for the orders this person sent.
 *
 * Only their own orders count: the menu is being personalised for the person
 * choosing from it, and what their partner asks for is their partner's taste.
 * A withdrawn order is dropped — a wish taken back was never really wanted —
 * but a declined one is kept, because wanting it was still real.
 */
export function orderHistory(orders: readonly Order[], currentName: string): Map<string, ItemHistory> {
  const history = new Map<string, ItemHistory>();
  for (const order of orders) {
    if (order.from !== currentName) continue;
    if (order.status === "cancelled") continue;
    const day = dayKeyOf(order.createdAt);
    if (!day) continue;
    const previous = history.get(order.itemId);
    history.set(order.itemId, {
      count: (previous?.count ?? 0) + 1,
      lastOn: previous && previous.lastOn > day ? previous.lastOn : day,
    });
  }
  return history;
}

/**
 * Item ids this person orders most, most-ordered first and most-recent as the
 * tie-break. Anything ordered exactly once is left out: one order is a try, not
 * a habit, and promoting it would fill the rail with things nobody repeated.
 */
export function frequentItemIds(history: Map<string, ItemHistory>, limit = 6): string[] {
  return [...history.entries()]
    .filter(([, entry]) => entry.count >= 2)
    .sort((a, b) => b[1].count - a[1].count || (a[1].lastOn > b[1].lastOn ? -1 : 1))
    .slice(0, limit)
    .map(([id]) => id);
}

/** Whole days since this person last ordered it, or null if they never have. */
export function daysSinceOrdered(
  history: Map<string, ItemHistory>,
  itemId: string,
  today: string = todayKey(),
): number | null {
  const entry = history.get(itemId);
  return entry ? Math.max(0, daysBetween(entry.lastOn, today)) : null;
}

/**
 * 我们的固定项目: the wishes worth keeping one tap away.
 *
 * Anything starred by hand comes first and in the order it was starred, then
 * whatever this person orders often enough to count as a habit. A limited
 * coupon that has already been spent is dropped rather than pinned as a
 * permanently disabled card.
 */
export function pinnedItems(input: {
  menu: readonly MenuItem[];
  customItems: readonly MenuItem[];
  favouriteIds: readonly string[];
  history: Map<string, ItemHistory>;
  usedLimitedIds: readonly string[];
  limit?: number;
}): MenuItem[] {
  const { menu, customItems, favouriteIds, history, usedLimitedIds, limit = 8 } = input;
  const byId = new Map<string, MenuItem>();
  for (const item of [...customItems, ...menu]) byId.set(item.id, item);
  const ordered = [...favouriteIds, ...frequentItemIds(history)];
  const seen = new Set<string>();
  const picked: MenuItem[] = [];
  for (const id of ordered) {
    if (seen.has(id)) continue;
    seen.add(id);
    const item = byId.get(id);
    if (!item) continue;
    if (item.limited && usedLimitedIds.includes(item.id)) continue;
    picked.push(item);
    if (picked.length >= limit) break;
  }
  return picked;
}

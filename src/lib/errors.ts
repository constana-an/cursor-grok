import type { TKey } from "./i18n.ts";

/**
 * Server messages are matched here and answered with a translation key rather
 * than finished copy: the caller knows which language this phone is reading in,
 * and this file must not have to.
 */
export function authErrorMessage(message: string): TKey {
  const lower = message.toLowerCase();
  if (lower.includes("invalid login credentials")) return "err.auth.credentials";
  if (lower.includes("already registered") || lower.includes("already been registered")) return "err.auth.registered";
  if (lower.includes("password")) return "err.auth.password";
  if (lower.includes("rate limit")) return "err.auth.rateLimit";
  if (lower.includes("phone provider")) return "err.auth.smsMissing";
  if (lower.includes("provider is not enabled")) return "err.auth.providerOff";
  return "err.generic";
}

/** Maps the exceptions raised by `place_couple_order` to shop copy. */
export function orderErrorMessage(message: string): TKey {
  const lower = message.toLowerCase();
  if (lower.includes("insufficient balance")) return "err.order.balance";
  if (lower.includes("limited item already used")) return "err.order.limitedUsed";
  if (lower.includes("rate limit")) return "err.order.rateLimit";
  if (lower.includes("not paired")) return "err.order.notPaired";
  if (lower.includes("invalid item")) return "err.order.invalidItem";
  return "err.order.failed";
}

/** Maps the exceptions raised by `update_order_status` to order-list copy. */
export function orderStatusErrorMessage(message: string): TKey {
  const lower = message.toLowerCase();
  if (lower.includes("not the recipient")) return "err.status.notRecipient";
  if (lower.includes("invalid transition")) return "err.status.invalidTransition";
  if (lower.includes("rate limit")) return "err.auth.rateLimit";
  return "err.status.failed";
}

/** Maps the exceptions raised by `claim_couple_task` / `daily_checkin`. */
export function rewardErrorMessage(message: string, duplicateKey: TKey): TKey {
  const lower = message.toLowerCase();
  if (lower.includes("duplicate") || lower.includes("unique")) return duplicateKey;
  if (lower.includes("requirement not met: photo")) return "err.reward.photo";
  if (lower.includes("requirement not met: date-done")) return "err.reward.dateDone";
  if (lower.includes("requirement not met")) return "err.reward.orderDone";
  if (lower.includes("rate limit")) return "err.auth.rateLimit";
  if (lower.includes("not paired")) return "err.order.notPaired";
  return "err.generic";
}

/** Maps the exceptions raised when saving a couple's own wish. */
export function wishErrorMessage(message: string): TKey {
  const lower = message.toLowerCase();
  if (lower.includes("custom wish limit reached")) return "err.wish.limit";
  if (lower.includes("check constraint") || lower.includes("violates check")) return "err.wish.constraint";
  return "err.wish.failed";
}

/**
 * Pairing without asking anyone to read out six digits.
 *
 * A couple code typed into the other phone works, but it is the slowest way
 * two people who are already texting each other could possibly do this. A link
 * goes through whatever they already talk in, and a QR works when they are in
 * the same room — so the code stays, and these give it a shorter route.
 *
 * The link is deliberately the app's own origin with one query parameter:
 * opening it lands in the shop with the code already filled in, and an
 * uninstalled phone opens the same page in a browser and can pair there.
 */

/** Codes are the six digits `join_couple_space` expects; nothing else. */
export const CODE_LENGTH = 6;

export const isCoupleCode = (value: string): boolean => new RegExp(`^\\d{${CODE_LENGTH}}$`).test(value);

/** Keeps only digits, capped at a code's length — for a pasted "023 941". */
export const cleanCodeInput = (value: string): string => value.replace(/\D/g, "").slice(0, CODE_LENGTH);

/**
 * The code carried by a `?join=` link, or null.
 *
 * Anything that is not exactly six digits is ignored rather than partially
 * accepted: a half-filled field from a mangled link is worse than an empty one,
 * because it looks like it came from the invitation.
 */
export function parseJoinCode(search: string): string | null {
  const raw = new URLSearchParams(search).get("join");
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  return isCoupleCode(digits) ? digits : null;
}

/** The invitation to send. `origin` keeps whatever path the app is served under. */
export function joinLink(origin: string, pathname: string, code: string): string {
  const base = pathname.endsWith("/") ? pathname : pathname.replace(/[^/]*$/, "");
  return `${origin}${base}?join=${code}`;
}

/**
 * How stale the cloud copy is, in buckets rather than seconds.
 *
 * A timestamp to the second invites watching it. What matters is only whether
 * the last read was now, minutes ago, or long enough that something is wrong.
 */
export type SyncAge = "now" | "minutes" | "hours" | "stale";

export function syncAge(lastSyncedAt: string | null, now: number = Date.now()): SyncAge | null {
  if (!lastSyncedAt) return null;
  const parsed = new Date(lastSyncedAt).getTime();
  if (Number.isNaN(parsed)) return null;
  const minutes = Math.max(0, Math.floor((now - parsed) / 60_000));
  if (minutes < 2) return "now";
  if (minutes < 60) return "minutes";
  if (minutes < 24 * 60) return "hours";
  return "stale";
}

/** Minutes or hours since the last read, for the copy that needs a number. */
export function syncAgeValue(lastSyncedAt: string, now: number = Date.now()): number {
  const minutes = Math.max(1, Math.floor((now - new Date(lastSyncedAt).getTime()) / 60_000));
  return minutes < 60 ? minutes : Math.floor(minutes / 60);
}

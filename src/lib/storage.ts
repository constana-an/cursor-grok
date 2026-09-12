import { isValidDateKey, todayKey } from "./date.ts";
import type { Lang } from "./i18n.ts";
import { IDENTITIES } from "./types.ts";
import type { Anniversary, CoupleProfile, Identity, MenuItem, Order } from "./types.ts";

export const STORAGE_KEYS = {
  profile: "couple-shop-profile",
  identity: "couple-shop-identity",
  orders: "couple-shop-orders",
  coins: "couple-shop-coins",
  taskClaims: "couple-shop-task-claims",
  economyVersion: "couple-shop-economy-version",
  cloudId: "couple-shop-cloud-id",
  inviteCode: "couple-shop-invite-code",
  privacyAccepted: "couple-shop-privacy-accepted",
  onboarded: "couple-shop-onboarded",
  customItems: "couple-shop-custom-items",
  checkins: "couple-shop-checkins",
  anniversaries: "couple-shop-anniversaries",
  reminded: "couple-shop-reminded",
  milestones: "couple-shop-milestones",
  openingDismissed: "couple-shop-opening-dismissed",
  favourites: "couple-shop-favourites",
  lastSync: "couple-shop-last-sync",
} as const;

export const DEFAULT_PROFILE: CoupleProfile = {
  shopName: "我们的小铺",
  firstName: "大宝",
  secondName: "二宝",
  startedOn: todayKey(),
};

/**
 * The same three defaults in English.
 *
 * 大宝 / 二宝 / 我们的小铺 are the *shop's* words, not the couple's: nobody typed
 * them, they are what a brand-new shop is handed. So they are shipped copy like
 * a menu item is, and like a menu item they carry both languages — an English
 * reader should not be introduced to their partner in a script they may not
 * read. The moment either person edits a name it stops being a default and is
 * never restated again, in either direction.
 *
 * What is *stored* stays Chinese, here and in `public.couples`, because an
 * order row records who sent it by name and both phones have to agree on that
 * string whatever language each of them is reading in. This is the display
 * layer only — the same split `localizedItemName` makes for the menu.
 */
export const DEFAULT_PROFILE_EN = {
  shopName: "Our Little Shop",
  firstName: "Sweetie",
  secondName: "Honey",
} as const;

/** A shipped default in the reader's language; a typed name is left alone. */
export function localizedPersonName(name: string, lang: Lang): string {
  if (lang !== "en") return name;
  if (name === DEFAULT_PROFILE.firstName) return DEFAULT_PROFILE_EN.firstName;
  if (name === DEFAULT_PROFILE.secondName) return DEFAULT_PROFILE_EN.secondName;
  return name;
}

export function localizedProfile(profile: CoupleProfile, lang: Lang): CoupleProfile {
  if (lang !== "en") return profile;
  return {
    ...profile,
    shopName: profile.shopName === DEFAULT_PROFILE.shopName ? DEFAULT_PROFILE_EN.shopName : profile.shopName,
    firstName: localizedPersonName(profile.firstName, lang),
    secondName: localizedPersonName(profile.secondName, lang),
  };
}

export function loadCoupleProfile(): CoupleProfile {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.profile) ?? "null") as Partial<CoupleProfile> | null;
    return {
      shopName: saved?.shopName?.trim() || DEFAULT_PROFILE.shopName,
      firstName: saved?.firstName?.trim() || DEFAULT_PROFILE.firstName,
      secondName: saved?.secondName?.trim() || DEFAULT_PROFILE.secondName,
      startedOn: isValidDateKey(saved?.startedOn ?? "") ? saved!.startedOn! : DEFAULT_PROFILE.startedOn,
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function loadIdentity(): Identity | null {
  const saved = localStorage.getItem(STORAGE_KEYS.identity);
  return saved === "大宝" || saved === "二宝" ? saved : null;
}

export function loadLocalOrders(): Order[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.orders);
    return saved ? (JSON.parse(saved) as Order[]) : [];
  } catch {
    return [];
  }
}

/**
 * Wishes the couple wrote themselves. In cloud mode they live in
 * `custom_menu_items`; on a local-only install this is the whole store, and it
 * is shared between the two identities on the device like the order list is.
 */
export function loadCustomItems(): MenuItem[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.customItems) ?? "[]") as unknown;
    if (!Array.isArray(saved)) return [];
    return saved.filter((item): item is MenuItem =>
      Boolean(item) && typeof item === "object"
      && typeof (item as MenuItem).id === "string"
      && typeof (item as MenuItem).name === "string"
      && typeof (item as MenuItem).price === "number");
  } catch {
    return [];
  }
}

/**
 * Anniversaries the couple keeps on this device. Cloud mode replaces these with
 * the server's rows; a local-only shop has nowhere else to put them.
 */
export function loadLocalAnniversaries(): Anniversary[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.anniversaries) ?? "[]") as unknown;
    if (!Array.isArray(saved)) return [];
    // The same constraints the server enforces, so a local shop that later
    // pairs cannot carry a row the database would reject.
    return saved.filter((item): item is Anniversary => {
      const entry = item as Partial<Anniversary> | null;
      return Boolean(entry)
        && typeof entry!.id === "string"
        && typeof entry!.title === "string"
        && entry!.title.trim().length >= 1 && entry!.title.length <= 40
        && typeof entry!.eventDate === "string" && isValidDateKey(entry!.eventDate)
        && typeof entry!.repeatsYearly === "boolean"
        && Number.isInteger(entry!.reminderDays) && entry!.reminderDays! >= 0 && entry!.reminderDays! <= 30;
    });
  } catch {
    return [];
  }
}

export const OPENING_BALANCE = 8;

/** Matches the `reward` a cloud `daily_checkin()` credits. */
export const CHECKIN_REWARD = 1;

/** Wallets are per identity: 大宝 cannot spend 二宝's coins, and vice versa. */
export const walletKey = (identity: Identity) => `${STORAGE_KEYS.coins}:${identity}`;
export const claimsKey = (identity: Identity) => `${STORAGE_KEYS.taskClaims}:${identity}`;
/** Check-ins are personal too: they pay into that identity's own wallet. */
export const checkinsKey = (identity: Identity) => `${STORAGE_KEYS.checkins}:${identity}`;

/** A year and a day is all the history a streak can ever need. */
const CHECKIN_HISTORY_LIMIT = 366;

export function loadCheckinDays(identity: Identity | null): string[] {
  if (!identity) return [];
  try {
    const saved = JSON.parse(localStorage.getItem(checkinsKey(identity)) ?? "[]") as unknown;
    if (!Array.isArray(saved)) return [];
    const today = todayKey();
    // A day in the future can only come from a wound-forward clock, and it
    // would anchor the streak somewhere the calendar has not reached.
    const days = saved.filter((value): value is string =>
      typeof value === "string" && isValidDateKey(value) && value <= today);
    return [...new Set(days)].sort().reverse().slice(0, CHECKIN_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

/**
 * Which milestones this person has already been congratulated for. Per identity
 * like the wallet: switching to the other person on a shared device must not
 * swallow a celebration they have not seen yet.
 */
export const milestonesKey = (identity: Identity) => `${STORAGE_KEYS.milestones}:${identity}`;

export function loadCelebratedMilestones(identity: Identity | null): string[] {
  if (!identity) return [];
  try {
    const saved = JSON.parse(localStorage.getItem(milestonesKey(identity)) ?? "[]") as unknown;
    if (!Array.isArray(saved)) return [];
    return [...new Set(saved.filter((value): value is string => typeof value === "string"))];
  } catch {
    return [];
  }
}

/**
 * Starred wishes, per identity like the wallet.
 *
 * They are personal on purpose: 置顶 is one person saying "this is the one I
 * keep asking for", and two people rarely keep asking for the same thing. They
 * grant nothing and cost nothing, so a device-local list is the honest home for
 * them — there is no couple-wide state here to get out of sync.
 */
export const favouritesKey = (identity: Identity) => `${STORAGE_KEYS.favourites}:${identity}`;

/** A rail, not an archive: past this many the pinned row stops being a shortcut. */
export const FAVOURITE_LIMIT = 8;

export function loadFavourites(identity: Identity | null): string[] {
  if (!identity) return [];
  try {
    const saved = JSON.parse(localStorage.getItem(favouritesKey(identity)) ?? "[]") as unknown;
    if (!Array.isArray(saved)) return [];
    const ids = saved.filter((value): value is string => typeof value === "string" && value.length > 0);
    return [...new Set(ids)].slice(0, FAVOURITE_LIMIT);
  } catch {
    return [];
  }
}

/** Newest star first, so the most recent decision sits at the head of the rail. */
export function toggleFavourite(ids: readonly string[], itemId: string): string[] {
  if (ids.includes(itemId)) return ids.filter((id) => id !== itemId);
  return [itemId, ...ids].slice(0, FAVOURITE_LIMIT);
}

export const remindedKey = (anniversaryId: string, day: string) => `${STORAGE_KEYS.reminded}:${anniversaryId}:${day}`;

/**
 * Anniversary reminders are deduped with one key per anniversary per day. Only
 * today's matter, so everything older is swept on the way past.
 */
export function pruneReminders(today: string = todayKey()): void {
  const stale: string[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    // Collect first: removing inside the walk shifts every later index.
    if (key?.startsWith(`${STORAGE_KEYS.reminded}:`) && !key.endsWith(`:${today}`)) stale.push(key);
  }
  for (const key of stale) localStorage.removeItem(key);
}

/**
 * Economy version 4 split the single shared wallet into one wallet per person.
 * Both sides restart at the opening balance, matching the cloud migration, and
 * the old shared keys are cleared so nothing reads them again.
 */
function migrateEconomy(): void {
  if (localStorage.getItem(STORAGE_KEYS.economyVersion) === "4") return;
  localStorage.setItem(STORAGE_KEYS.economyVersion, "4");
  localStorage.removeItem(STORAGE_KEYS.coins);
  localStorage.removeItem(STORAGE_KEYS.taskClaims);
  for (const identity of IDENTITIES) {
    localStorage.removeItem(walletKey(identity));
    localStorage.removeItem(claimsKey(identity));
  }
}

export function loadEconomyCoins(identity: Identity | null): number {
  migrateEconomy();
  if (!identity) return OPENING_BALANCE;
  // Read the raw string: `Number(null)` is 0, which would silently open a new
  // wallet at zero coins instead of the opening balance.
  const raw = localStorage.getItem(walletKey(identity));
  if (raw === null) return OPENING_BALANCE;
  const saved = Number(raw);
  return Number.isFinite(saved) && saved >= 0 ? saved : OPENING_BALANCE;
}

export function loadTaskClaims(identity: Identity | null): string[] {
  migrateEconomy();
  if (!identity) return [];
  try {
    const saved = JSON.parse(localStorage.getItem(claimsKey(identity)) ?? "[]") as unknown;
    return Array.isArray(saved) ? saved.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

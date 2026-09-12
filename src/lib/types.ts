import type { HomeIcon } from "@radix-ui/react-icons";

export type Category = "food" | "care" | "date" | "limited";
export type MainView = "shop" | "tasks" | "orders" | "memories" | "ours";
export type OrderStatus = "pending" | "accepted" | "doing" | "done" | "rejected" | "cancelled";
export type TaskFrequency = "daily" | "weekly";
export type Identity = "大宝" | "二宝";
export type AuthMode = "signin" | "signup" | "recover" | "new-password" | "phone";

export type CoupleProfile = {
  shopName: string;
  firstName: string;
  secondName: string;
  startedOn: string;
};

export type MenuItem = {
  id: string;
  category: Category;
  name: string;
  description: string;
  price: number;
  image?: string;
  tint: string;
  limited?: boolean;
  /** Written by this couple rather than shipped with the shop; editable. */
  custom?: boolean;
  /**
   * English copy for a shipped item. Absent on a couple's own wish on purpose:
   * their words are theirs, and the shop never restates them in another
   * language.
   */
  en?: { name: string; description: string };
};

/** Prices a couple may put on their own wish, matching the server's check. */
export const CUSTOM_PRICE_RANGE = { min: 8, max: 400 } as const;

/** 限定券 stays a curated set: a self-issued "only once, ever" cannot be kept. */
export const CUSTOM_CATEGORIES: Category[] = ["food", "care", "date"];

export type Order = {
  id: string;
  itemId: string;
  itemName: string;
  /** Recorded at order time so retiring a custom wish never rewrites history. */
  itemCategory?: Category;
  image?: string;
  price: number;
  note: string;
  createdAt: string;
  desiredTime: string;
  status: OrderStatus;
  from: string;
  to: string;
  /** Auth user id of the sender. Absent for local-mode and legacy orders. */
  createdBy?: string;
  /** When the recipient finished it. Absent until an order reaches "done". */
  completedAt?: string;
  /** An optional sentence the recipient left when declining. */
  declineNote?: string;
};

/** The real action a task is paid for, when the shop can actually witness it. */
export type TaskRequirement = "photo" | "order-done" | "date-done";

export type CoupleTask = {
  id: string;
  frequency: TaskFrequency;
  title: string;
  description: string;
  reward: number;
  icon: typeof HomeIcon;
  tone: "pink" | "mint" | "gold" | "lavender";
  /** Absent for the tasks nothing in the data can witness; those stay manual. */
  requires?: TaskRequirement;
  en?: { title: string; description: string };
};

export type MemoryEntry = {
  id: string;
  caption: string;
  happenedOn: string;
  imagePath?: string;
  imageUrl?: string;
  createdAt: string;
  /** Auth user id of the uploader; only they may edit or delete the entry. */
  createdBy?: string;
};

export type Anniversary = {
  id: string;
  title: string;
  eventDate: string;
  repeatsYearly: boolean;
  reminderDays: number;
};

/** Order list tabs. "closed" holds the declined and the withdrawn together. */
export type OrderFilter = "active" | "done" | "closed" | "all";

export type CheckinStatus = {
  streak: number;
  checkedToday: boolean;
};

/**
 * What the other person has been up to. Deliberately does not carry a balance:
 * wallets are private, and this is the one view across the couple boundary.
 */
export type PartnerStatus = {
  displayName: string;
  streak: number;
  /** Task rewards earned this week — the same figure each person sees about themselves. */
  earnedThisWeek: number;
  checkedToday: boolean;
};

/** The counters a milestone can watch. All three already exist on screen. */
export type MilestoneKind = "days" | "wishes" | "streak";

export type Milestone = {
  id: string;
  kind: MilestoneKind;
  threshold: number;
  title: string;
  body: string;
  en?: { title: string; body: string };
};

export type MembershipState = {
  /** The plan's own name from the server; null until one has been read. */
  planName: string | null;
  status: string;
};

/** The two fixed identity slots. Each one owns its own sweet-heart coin wallet. */
export const IDENTITIES: Identity[] = ["大宝", "二宝"];

export const partnerFor = (identity: Identity): Identity => (identity === "大宝" ? "二宝" : "大宝");

export function displayNameFor(profile: CoupleProfile, identity: Identity): string {
  return identity === "大宝" ? profile.firstName : profile.secondName;
}

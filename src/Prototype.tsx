import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  BellIcon,
  CameraIcon,
  CheckCircledIcon,
  CheckIcon,
  DownloadIcon,
  ExitIcon,
  HeartFilledIcon,
  HeartIcon,
  HomeIcon,
  ImageIcon,
  LockClosedIcon,
  PaperPlaneIcon,
  Pencil1Icon,
  PersonIcon,
  ReaderIcon,
  TargetIcon,
  ArchiveIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { BottomSheet, KeyboardInput, MobileScroll, useKeyboard, useKeyboardInsets } from "./shell";
import { STATUS_TEXT, categoryMeta, desiredTimes, earnedInWeek, localizeDesiredTime, localizedCategory, localizedItem, localizedItemName, localizedMilestone, localizedTemplate, MENU, reachedMilestones, WISH_TEMPLATES, taskClaimKey } from "./lib/catalog";
import { dayKeyOf, formatStartedOn, isValidDateKey, normalizeDateInput, relationshipDays, todayKey } from "./lib/date";
import { checkinStatusFrom, checkinStreak, dueAnniversaries } from "./lib/date";
import { authErrorMessage, orderErrorMessage, orderStatusErrorMessage, rewardErrorMessage, wishErrorMessage } from "./lib/errors";
import { cleanCodeInput, joinLink, parseJoinCode, syncAge, syncAgeValue } from "./lib/pairing";
import { orderHistory, pinnedItems } from "./lib/history";
import { buildMoments } from "./lib/moments";
import { LanguageProvider, useI18n } from "./i18n";
import { LANGS, LANG_LABEL } from "./lib/i18n";
import type { TKey } from "./lib/i18n";
import { appleAuthEnabled, cloudEnabled, getSupabase, phoneAuthEnabled, type SupabaseClient } from "./lib/supabase";
import {
  CHECKIN_REWARD,
  DEFAULT_PROFILE,
  STORAGE_KEYS,
  checkinsKey,
  claimsKey,
  loadCelebratedMilestones,
  loadCheckinDays,
  loadCoupleProfile,
  loadEconomyCoins,
  loadCustomItems,
  loadFavourites,
  favouritesKey,
  localizedPersonName,
  localizedProfile,
  toggleFavourite,
  loadIdentity,
  loadLocalAnniversaries,
  loadLocalOrders,
  loadTaskClaims,
  pruneReminders,
  remindedKey,
  milestonesKey,
  walletKey,
} from "./lib/storage";
import { CUSTOM_CATEGORIES, CUSTOM_PRICE_RANGE, IDENTITIES, displayNameFor, partnerFor } from "./lib/types";
import type {
  Anniversary,
  AuthMode,
  Category,
  CheckinStatus,
  CoupleProfile,
  CoupleTask,
  Identity,
  MainView,
  MemoryEntry,
  MembershipState,
  MenuItem,
  Order,
  OrderStatus,
  PartnerStatus,
} from "./lib/types";
import { MemoriesScreen } from "./screens/MemoriesScreen";
import { MenuArt } from "./screens/MenuArt";
import { InviteSheet } from "./screens/InviteSheet";
import { MomentsSection } from "./screens/MomentsSection";
import { MoveSheet } from "./screens/MoveSheet";
import { OnboardingSheet, PAIRING_BONUS } from "./screens/OnboardingSheet";
import { OpeningProgress, type OpeningStep } from "./screens/OpeningProgress";
import { OrdersScreen } from "./screens/OrdersScreen";
import { OursScreen } from "./screens/OursScreen";
import { ShopScreen } from "./screens/ShopScreen";
import { TasksScreen } from "./screens/TasksScreen";

/** iOS only exposes `Notification` in a secure context on 16.4+. */
const notificationsSupported = typeof window !== "undefined" && "Notification" in window;

/**
 * Web Push needs a push service, not just permission. On iPhone Safari
 * `PushManager` does not exist until the site has been added to the Home
 * Screen, which is why "开启通知" has to come after "添加到主屏幕" — and why a
 * browser that will never have it must not be handed the step at all.
 */
const pushCapable = () =>
  notificationsSupported && typeof navigator !== "undefined"
  && "serviceWorker" in navigator && "PushManager" in window;

/** Installed to the Home Screen, where iOS finally allows push. */
const isInstalled = () =>
  typeof window !== "undefined"
  && (window.matchMedia("(display-mode: standalone)").matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true);

/** Signed photo URLs live for an hour; re-sign once they get close to that. */
const SIGNED_URL_TTL_SECONDS = 3600;
const SIGNED_URL_REFRESH_MS = 45 * 60 * 1000;

/**
 * Coins, claims, check-in days and their owner move as one value. Check-in days
 * are personal — they pay into this identity's own wallet — so keeping them in a
 * separate state slot would reintroduce the half-applied identity switch.
 */
type Wallet = { owner: Identity | null; coins: number; claims: string[]; checkins: string[] };

const walletFor = (owner: Identity | null): Wallet => ({
  owner,
  coins: loadEconomyCoins(owner),
  claims: loadTaskClaims(owner),
  checkins: loadCheckinDays(owner),
});

/** Custom wishes carry no artwork, so the card tint is what distinguishes them. */
const CUSTOM_TINTS: Record<Category, string> = {
  food: "#fff0e5",
  care: "#ffe3ef",
  date: "#e5f6ee",
  limited: "#e1f3ff",
};

const customItemFrom = (row: { id: string; category: Category; name: string; description: string; price: number }): MenuItem => ({
  id: row.id,
  category: row.category,
  name: row.name,
  description: row.description,
  price: row.price,
  tint: CUSTOM_TINTS[row.category],
  custom: true,
});

type PushState = { permission: NotificationPermission | "unsupported"; subscribed: boolean };

const vapidPublicKey = () => (import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined) || undefined;

/** VAPID keys travel base64url; `atob` needs plain base64 with its padding. */
function applicationServerKey(key: string): Uint8Array<ArrayBuffer> {
  const padded = key + "=".repeat((4 - (key.length % 4)) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

async function saveSubscription(client: SupabaseClient, subscription: PushSubscription, coupleId: string, userId: string) {
  const json = subscription.toJSON();
  await client.from("push_subscriptions").upsert(
    { user_id: userId, couple_id: coupleId, endpoint: json.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    { onConflict: "endpoint" },
  );
}

/**
 * Picks up a subscription the worker rotated while no page was open: retire the
 * old row, record the new endpoint. The worker cannot do this itself — writing
 * to the couple's table needs a session it does not have.
 */
async function drainPushRotation(client: SupabaseClient, coupleId: string, userId: string) {
  const cache = await caches.open("couple-shop-push");
  const parked = await cache.match("/__push-rotation");
  if (!parked) return;
  const { old, next } = await parked.json() as { old: string | null; next: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } };
  if (old) await client.from("push_subscriptions").delete().eq("endpoint", old);
  if (next?.endpoint) {
    await client.from("push_subscriptions").upsert(
      { user_id: userId, couple_id: coupleId, endpoint: next.endpoint, p256dh: next.keys?.p256dh, auth: next.keys?.auth },
      { onConflict: "endpoint" },
    );
  }
  await cache.delete("/__push-rotation");
}

/** Drops this device's subscription, on the server and in the browser. */
async function dropSubscription(client: SupabaseClient | null) {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  // Delete only this endpoint: the same account may be signed in elsewhere.
  if (client) await client.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
  await subscription.unsubscribe().catch(() => undefined);
}

/**
 * Title, subtitle and primary button for the account sheet, from one place.
 * They used to be three separate ternaries down the JSX, which is how an
 * anonymous upgrade ended up calling itself 升级账户 on the tab, 创建正式账户 in
 * the title and 保护现有数据 on the button — and how 找回账户 kept a subtitle
 * about not relying on anonymous accounts.
 *
 * It hands back keys rather than sentences, so the same table answers for both
 * languages.
 */
function authSheetCopy(mode: AuthMode, upgrading: boolean, otpSent: boolean): { title: TKey; description: TKey; primary: TKey } {
  switch (mode) {
    case "recover":
      return { title: "auth.recoverTitle", description: "auth.recoverDesc", primary: "auth.recoverPrimary" };
    case "new-password":
      return { title: "auth.newPasswordTitle", description: "auth.newPasswordDesc", primary: "auth.newPasswordPrimary" };
    case "phone":
      return {
        title: "auth.phoneTitle",
        description: otpSent ? "auth.phoneDescSent" : "auth.phoneDesc",
        primary: otpSent ? "auth.phonePrimarySent" : "auth.phonePrimary",
      };
    case "signup":
      return upgrading
        ? { title: "auth.upgradeTitle", description: "auth.upgradeDesc", primary: "auth.upgradePrimary" }
        : { title: "auth.signupTitle", description: "auth.signupDesc", primary: "auth.signupPrimary" };
    default:
      // Not just "登录": the tab above it already says that, and two controls
      // with the same word is the kind of thing this table exists to prevent.
      return { title: "auth.signinTitle", description: "auth.signinDesc", primary: "auth.signinPrimary" };
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

/**
 * Reads the hints on an incoming link: the view and order a notification points
 * at, and the couple code an invitation carries.
 */
function readDeepLink(): { view: MainView | null; orderId: string | null; joinCode: string | null } {
  if (typeof window === "undefined") return { view: null, orderId: null, joinCode: null };
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("view");
  const views: MainView[] = ["shop", "tasks", "orders", "memories", "ours"];
  const view = views.find((candidate) => candidate === requested) ?? null;
  const orderId = params.get("order");
  const joinCode = parseJoinCode(window.location.search);
  // An invitation lands on the page that can act on it, whatever else the link
  // asked for — the person who opened it is here to pair, not to browse.
  return { view: joinCode ? "ours" : orderId ? "orders" : view, orderId, joinCode };
}

/**
 * The language provider wraps the whole shop here rather than in `App.tsx`,
 * which is a protected runtime file. Everything below it — screens, sheets,
 * toasts — reads the switch through `useI18n`.
 */
export default function Prototype() {
  return (
    <LanguageProvider>
      <CoupleShop />
    </LanguageProvider>
  );
}

function CoupleShop() {
  const { lang, setLang, t } = useI18n();
  const keyboard = useKeyboard();
  // Fixed bottom chrome has to ride the keyboard, per the runtime contract:
  // pinned to the safe area alone it sits *behind* the keyboard, which left the
  // tab bar unreachable — and with it every way off the page.
  const { bottomInset } = useKeyboardInsets();
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(loadIdentity);
  const [profile, setProfile] = useState<CoupleProfile>(loadCoupleProfile);
  const [profileDraft, setProfileDraft] = useState<CoupleProfile>(loadCoupleProfile);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [view, setView] = useState<MainView>("shop");
  const [category, setCategory] = useState<Category>("food");
  const [orders, setOrders] = useState<Order[]>(loadLocalOrders);
  const [wallet, setWallet] = useState<Wallet>(() => walletFor(loadIdentity()));
  const coins = wallet.coins;
  const claimedTasks = wallet.claims;
  const setCoins = useCallback((next: number | ((current: number) => number)) => {
    setWallet((current) => ({ ...current, coins: typeof next === "function" ? next(current.coins) : next }));
  }, []);
  const setClaimedTasks = useCallback((next: string[] | ((current: string[]) => string[])) => {
    setWallet((current) => ({ ...current, claims: typeof next === "function" ? next(current.claims) : next }));
  }, []);
  const [customItems, setCustomItems] = useState<MenuItem[]>(loadCustomItems);
  const [favourites, setFavourites] = useState<string[]>(() => loadFavourites(loadIdentity()));
  const [wishOpen, setWishOpen] = useState(false);
  const [wishDraft, setWishDraft] = useState<{ name: string; description: string; price: string; category: Category }>(
    { name: "", description: "", price: "48", category: "food" },
  );
  const [editingWishId, setEditingWishId] = useState<string | null>(null);
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [note, setNote] = useState("");
  const [time, setTime] = useState<string>(() => desiredTimes(lang)[0]);
  const [focusOrderId, setFocusOrderId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // `subscribed` means this device really can be pushed to: a browser
  // subscription exists *and* the couple's table has a row for it. Permission
  // alone was what let the settings row claim "订单不会错过" on a device with
  // no subscription at all.
  const [pushState, setPushState] = useState<PushState>(() => ({
    permission: notificationsSupported ? Notification.permission : "unsupported",
    subscribed: false,
  }));
  const [pushRotation, setPushRotation] = useState(0);
  const [installed, setInstalled] = useState(isInstalled);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [cloudCoupleId, setCloudCoupleId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEYS.cloudId));
  const [inviteCode, setInviteCode] = useState<string | null>(() => localStorage.getItem(STORAGE_KEYS.inviteCode));
  const [pairingCode, setPairingCode] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  // "Connected" is not the same as "reading each other's writes". The strip
  // used to claim the first and never check the second, so a dropped realtime
  // channel looked exactly like a working one.
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => localStorage.getItem(STORAGE_KEYS.lastSync));
  const [realtime, setRealtime] = useState<"connecting" | "live" | "dropped">("connecting");
  const [syncNonce, setSyncNonce] = useState(0);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authOtp, setAuthOtp] = useState("");
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  // An anonymous account being upgraded keeps its data; a brand new one has none.
  const upgradingAnonymous = Boolean(authUser?.is_anonymous);
  const protectedAccount = Boolean(authUser && !authUser.is_anonymous);
  const authCopy = authSheetCopy(authMode, upgradingAnonymous, phoneOtpSent);
  const [authBusy, setAuthBusy] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(
    () => localStorage.getItem(STORAGE_KEYS.privacyAccepted) === "1",
  );
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [dangerConfirm, setDangerConfirm] = useState<"leave" | "delete" | null>(null);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [anniversaries, setAnniversaries] = useState<Anniversary[]>(loadLocalAnniversaries);
  const [checkin, setCheckin] = useState<CheckinStatus>({ streak: 0, checkedToday: false });
  const [partner, setPartner] = useState<PartnerStatus | null>(null);
  const [partnerRefresh, setPartnerRefresh] = useState(0);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [memoryCaption, setMemoryCaption] = useState("");
  const [memoryDate, setMemoryDate] = useState(todayKey());
  const [memoryFile, setMemoryFile] = useState<File | null>(null);
  // Set while the memory sheet edits an existing entry instead of adding one.
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [memoryDetail, setMemoryDetail] = useState<MemoryEntry | null>(null);
  const [anniversaryOpen, setAnniversaryOpen] = useState(false);
  const [anniversaryTitle, setAnniversaryTitle] = useState("");
  const [anniversaryDate, setAnniversaryDate] = useState(todayKey());
  const [anniversaryRepeats, setAnniversaryRepeats] = useState(true);
  const [anniversaryReminder, setAnniversaryReminder] = useState(3);
  const [editingAnniversaryId, setEditingAnniversaryId] = useState<string | null>(null);
  // Deleting a memory or an anniversary is not undoable and not synced back, so
  // both ask once inside the sheet that is already open.
  const [confirmDelete, setConfirmDelete] = useState<"memory" | "anniversary" | "wish" | null>(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [openingDismissed, setOpeningDismissed] = useState(
    () => localStorage.getItem(STORAGE_KEYS.openingDismissed) === "1",
  );
  const [membership, setMembership] = useState<MembershipState>({ planName: null, status: "active" });
  const toastTimer = useRef<number | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const broadcastChannel = useRef<BroadcastChannel | null>(null);
  const applyingBroadcast = useRef(false);
  const memoriesSignedAt = useRef(0);
  const previousNames = useRef<{ first: string; second: string } | null>(null);

  const partnerIdentity = identity ? partnerFor(identity) : null;
  // Canonical names: what an order row records, and what "only the recipient
  // may answer" is checked against. Never localised, or the two phones would
  // disagree about who an order belongs to.
  const currentName = identity ? displayNameFor(profile, identity) : null;
  const partnerName = partnerIdentity ? displayNameFor(profile, partnerIdentity) : null;
  // What the reader sees. Identical to the above until a default name meets an
  // English reader, and identical again the moment either person renames.
  const shownProfile = useMemo(() => localizedProfile(profile, lang), [profile, lang]);
  const activeOrders = useMemo(
    () => orders.filter((order) => !["done", "rejected"].includes(order.status)).length,
    [orders],
  );
  const usedLimitedIds = useMemo(() => {
    const limited = new Set(MENU.filter((item) => item.limited).map((item) => item.id));
    // Declining or withdrawing releases the coupon; anything else holds it.
    const released = new Set<OrderStatus>(["rejected", "cancelled"]);
    return [...new Set(orders.filter((order) => !released.has(order.status) && limited.has(order.itemId)).map((order) => order.itemId))];
  }, [orders]);
  // Everything personalised about the shop is derived from the order list that
  // is already on screen: no new table, nothing to synchronise, nothing stale.
  const history = useMemo(() => orderHistory(orders, currentName ?? ""), [orders, currentName]);
  const pinned = useMemo(
    () => pinnedItems({ menu: MENU, customItems, favouriteIds: favourites, history, usedLimitedIds }),
    [customItems, favourites, history, usedLimitedIds],
  );
  // The invitation URL: this app's own origin plus the code, so opening it
  // lands here with the field filled in — and an uninstalled phone opens the
  // same page in a browser and can pair from there.
  const inviteLink = inviteCode && typeof window !== "undefined"
    ? joinLink(window.location.origin, window.location.pathname, inviteCode)
    : null;
  const moments = useMemo(
    () => buildMoments({ orders, anniversaries, currentName: currentName ?? "", coins, history }),
    [orders, anniversaries, currentName, coins, history],
  );

  const identityOptions: Array<{ name: Identity; displayName: string; tone: "pink" | "mint" }> = [
    { name: "大宝", displayName: shownProfile.firstName, tone: "pink" },
    { name: "二宝", displayName: shownProfile.secondName, tone: "mint" },
  ];

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  // Sheets own text inputs, so the simulated keyboard has to come down in the
  // same event that closes them — otherwise it keeps covering the bottom nav.
  const closeOrderSheet = () => { keyboard.hide(); setSelected(null); };
  const closeSettings = () => { keyboard.hide(); setSettingsOpen(false); };
  const closeAuth = () => { keyboard.hide(); setAuthOpen(false); };
  const closeWish = () => { keyboard.hide(); setWishOpen(false); setEditingWishId(null); setConfirmDelete(null); };
  const closeMemory = () => { keyboard.hide(); setMemoryOpen(false); setEditingMemoryId(null); };
  const closeMemoryDetail = () => { setMemoryDetail(null); setConfirmDelete(null); };
  const closeAnniversary = () => { keyboard.hide(); setAnniversaryOpen(false); setEditingAnniversaryId(null); setConfirmDelete(null); };

  const openAddMemory = () => {
    setEditingMemoryId(null);
    setMemoryCaption("");
    setMemoryDate(todayKey());
    setMemoryFile(null);
    setMemoryOpen(true);
  };
  /** Turns a finished wish into the start of a photo memory. */
  const keepOrderAsMemory = (order: Order) => {
    if (!cloudCoupleId) return requirePairedForPhotos();
    setEditingMemoryId(null);
    setMemoryCaption(order.itemName);
    setMemoryDate(dayKeyOf(order.completedAt ?? order.createdAt) ?? todayKey());
    setMemoryFile(null);
    setMemoryOpen(true);
  };

  const openEditMemory = (memory: MemoryEntry) => {
    setEditingMemoryId(memory.id);
    setMemoryCaption(memory.caption);
    setMemoryDate(memory.happenedOn);
    setMemoryFile(null);
    setMemoryDetail(null);
    setMemoryOpen(true);
  };
  const openAddAnniversary = () => {
    setEditingAnniversaryId(null);
    setAnniversaryTitle("");
    setAnniversaryDate(todayKey());
    setAnniversaryRepeats(true);
    setAnniversaryReminder(3);
    setAnniversaryOpen(true);
  };
  const openEditAnniversary = (item: Anniversary) => {
    setEditingAnniversaryId(item.id);
    setAnniversaryTitle(item.title);
    setAnniversaryDate(item.eventDate);
    setAnniversaryRepeats(item.repeatsYearly);
    setAnniversaryReminder(item.reminderDays);
    setAnniversaryOpen(true);
  };

  const finishOnboarding = (goToTasks: boolean) => {
    localStorage.setItem(STORAGE_KEYS.onboarded, "1");
    setOnboardingOpen(false);
    if (goToTasks) setView("tasks");
  };

  const chooseIdentity = useCallback((nextIdentity: Identity) => {
    localStorage.setItem(STORAGE_KEYS.identity, nextIdentity);
    setIdentity(nextIdentity);
  }, []);

  useEffect(() => {
    const pending = getSupabase();
    if (pending) pending.then(setSupabase).catch(() => showToast(t("toast.cloudLoadFailed")));
  }, [showToast, t]);

  /** Invokes the push function and reports what actually happened, or null. */
  const notifyPartner = useCallback(async (client: SupabaseClient, orderId: string, event: string) => {
    const { data, error } = await client.functions.invoke("notify-partner", { body: { orderId, event } });
    if (error || !data) return null;
    return data as { subscribed: number; delivered: number; pruned: number };
  }, []);

  // Keeps `subscribed` honest, and finishes the job when the user allowed
  // notifications before pairing — the subscription needs a couple to belong to,
  // so back then it was silently skipped and never retried.
  useEffect(() => {
    if (pushState.permission !== "granted" || !("serviceWorker" in navigator)) return;
    let active = true;
    void (async () => {
      // Not `.ready`: the worker is only registered in PROD, so that promise
      // never settles in dev or under Playwright.
      const registration = await navigator.serviceWorker.getRegistration();
      const client = cloudCoupleId ? await getSupabase() : null;
      if (!active || !registration) return;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription && client && cloudCoupleId && authUser && vapidPublicKey()) {
        subscription = await registration.pushManager
          .subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(vapidPublicKey()!) })
          .catch(() => null);
      }
      if (!active) return;
      if (!subscription || !client || !cloudCoupleId || !authUser) {
        setPushState((current) => (current.subscribed ? { ...current, subscribed: false } : current));
        return;
      }
      await drainPushRotation(client, cloudCoupleId, authUser.id).catch(() => undefined);
      await saveSubscription(client, subscription, cloudCoupleId, authUser.id);
      if (active) setPushState((current) => (current.subscribed ? current : { ...current, subscribed: true }));
    })();
    return () => { active = false; };
  }, [pushState.permission, cloudCoupleId, authUser, pushRotation]);

  // The worker tells every open page when the push service rotated the endpoint.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "push-subscription-changed") setPushRotation((count) => count + 1);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  // Opening the guide during the first render would portal it outside the phone
  // frame: the screen element a sheet mounts into only exists after that first
  // commit. Waiting for an identity is also what makes the copy addressable.
  useEffect(() => {
    if (!identity || localStorage.getItem(STORAGE_KEYS.onboarded) === "1") return;
    setOnboardingOpen(true);
  }, [identity]);

  /**
   * Local mode keeps both identities on one device, so the partner's week is
   * simply their own storage keys — no server needed, and the card behaves
   * exactly as it does in the cloud. `wallet` is in the dependencies because
   * every local earn writes through it, which is the cue to recount.
   */
  useEffect(() => {
    if (cloudCoupleId) return;
    if (!partnerIdentity || !partnerName) return setPartner(null);
    const days = loadCheckinDays(partnerIdentity);
    setPartner({
      displayName: partnerName,
      streak: checkinStreak(days),
      earnedThisWeek: earnedInWeek(loadTaskClaims(partnerIdentity)),
      checkedToday: days.includes(todayKey()),
    });
  }, [cloudCoupleId, partnerIdentity, partnerName, wallet, partnerRefresh]);

  /**
   * Celebrate a milestone the first time this person crosses it, then remember
   * it so a reload is not another party. Kept per identity like the wallet:
   * on a shared device, 二宝 should still get their own moment.
   *
   * Nothing here grants coins — it is a congratulation, so localStorage is the
   * honest place for it even in cloud mode.
   */
  useEffect(() => {
    if (!identity) return;
    const counts = {
      days: relationshipDays(profile.startedOn),
      wishes: orders.filter((order) => order.status === "done").length,
      streak: cloudCoupleId ? checkin.streak : checkinStatusFrom(wallet.checkins).streak,
    };
    const celebrated = loadCelebratedMilestones(identity);
    const fresh = reachedMilestones(counts).filter((milestone) => !celebrated.includes(milestone.id));
    if (fresh.length === 0) return;
    // Several can land at once on a first run; the newest is the one to show.
    const newest = fresh[fresh.length - 1];
    localStorage.setItem(milestonesKey(identity), JSON.stringify([...celebrated, ...fresh.map((item) => item.id)]));
    showToast(t("toast.milestone", { title: localizedMilestone(newest, lang).title }));
  }, [identity, profile.startedOn, orders, checkin.streak, wallet.checkins, cloudCoupleId, showToast, t, lang]);

  /**
   * The keyboard covers about 40% of the screen, including the bottom
   * navigation, and the runtime only lowers it when something asks. Sheets
   * already do on close; a field that lives on a page — the pairing code — had
   * nothing, so tapping elsewhere left the keyboard up with the nav behind it.
   *
   * Changing page puts it away too, which covers every route in: the tab bar,
   * the bell, deep links and the buttons that jump between screens.
   */
  useEffect(() => {
    keyboard.hide();
    // `hide` is rebuilt on every keyboard state change; depending on it here
    // would re-run this on the keyboard's own updates rather than on the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const dismissKeyboardOnOutsideTap = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (!keyboard.visible) return;
    if ((event.target as HTMLElement).closest("input, textarea")) return;
    keyboard.hide();
  }, [keyboard]);

  useEffect(() => {
    const recheck = () => setInstalled(isInstalled());
    const media = window.matchMedia("(display-mode: standalone)");
    media.addEventListener("change", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      media.removeEventListener("change", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, []);

  useEffect(() => {
    const { view: deepView, orderId, joinCode } = readDeepLink();
    if (!deepView && !orderId && !joinCode) return;
    setView(deepView ?? "orders");
    // The order may not have loaded from the cloud yet, so hold the id until
    // the list can act on it rather than dropping it here.
    if (orderId) setFocusOrderId(orderId);
    // The field is filled in but not submitted: joining needs an account, and
    // pairing someone into a shop without them tapping anything is worse than
    // one extra tap.
    if (joinCode) {
      setPairingCode(joinCode);
      showToast(t("toast.joinCodeReady"));
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  // The "synced N minutes ago" line has to keep counting when nothing else on
  // screen is changing — which is exactly the situation a dropped connection
  // produces, and exactly when the reader needs the number to be true.
  const [, setClock] = useState(0);
  useEffect(() => {
    if (!cloudCoupleId) return;
    const timer = window.setInterval(() => setClock((value) => value + 1), 60_000);
    return () => window.clearInterval(timer);
  }, [cloudCoupleId]);

  // A stale focus must not fire minutes later when the tab comes back. Only on
  // an actual departure: on mount `view` is still "shop" while the deep-link
  // effect above is switching it, which would clear the id before it is used.
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current === "orders" && view !== "orders") setFocusOrderId(null);
    previousView.current = view;
  }, [view]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const applyAuthenticatedUser = async (user: User | null) => {
      if (!active) return;
      setAuthUser(user);
      if (!user) {
        setCloudCoupleId(null);
        setInviteCode(null);
        localStorage.removeItem(STORAGE_KEYS.cloudId);
        localStorage.removeItem(STORAGE_KEYS.inviteCode);
        return;
      }
      const { data: profileRow } = await supabase.from("profiles").select("couple_id, display_name").maybeSingle();
      if (!active || !profileRow?.couple_id) return;
      const { data: coupleRow } = await supabase.from("couples").select("invite_code").eq("id", profileRow.couple_id).maybeSingle();
      if (!active) return;
      localStorage.setItem(STORAGE_KEYS.cloudId, profileRow.couple_id);
      setCloudCoupleId(profileRow.couple_id);
      if (coupleRow?.invite_code) {
        localStorage.setItem(STORAGE_KEYS.inviteCode, coupleRow.invite_code);
        setInviteCode(coupleRow.invite_code);
      }
      if (profileRow.display_name === "大宝" || profileRow.display_name === "二宝") chooseIdentity(profileRow.display_name);
    };
    supabase.auth.getSession().then(({ data }) => applyAuthenticatedUser(data.session?.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("new-password");
        setAuthOpen(true);
      }
      window.setTimeout(() => applyAuthenticatedUser(session?.user ?? null), 0);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase, chooseIdentity]);

  useEffect(() => {
    if (!supabase || !authUser) return;
    const record = (message: string, kind: string) => {
      void supabase
        .rpc("record_client_error", {
          p_message: message.slice(0, 500),
          p_context: { kind, path: window.location.pathname, appVersion: "2026.08.11" },
        })
        .then(undefined, () => undefined); // Monitoring must never create another user-visible failure.
    };
    const onError = (event: ErrorEvent) => record(event.message || "window error", "window.error");
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      record(reason instanceof Error ? reason.message : "unhandled promise rejection", "unhandledrejection");
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, [supabase, authUser]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.profile, JSON.stringify(profile));
  }, [profile]);

  // Local orders keep display names, so renaming a partner has to rewrite the
  // orders that already exist. Cloud mode is skipped: there the server is the
  // source of truth and a blind rename would mislabel the partner's orders.
  useEffect(() => {
    const previous = previousNames.current;
    previousNames.current = { first: profile.firstName, second: profile.secondName };
    if (cloudCoupleId || !previous) return;
    if (previous.first === profile.firstName && previous.second === profile.secondName) return;
    const rename = (name: string) => {
      if (name === previous.first) return profile.firstName;
      if (name === previous.second) return profile.secondName;
      return name;
    };
    setOrders((current) => current.map((order) => ({ ...order, from: rename(order.from), to: rename(order.to) })));
  }, [profile.firstName, profile.secondName, cloudCoupleId]);

  // Switching identity on this device swaps to that person's wallet.
  useEffect(() => {
    if (!identity || cloudCoupleId) return;
    setWallet((current) => (current.owner === identity ? current : walletFor(identity)));
  }, [identity, cloudCoupleId]);

  // Starred wishes are personal too, and unlike the wallet they are local in
  // both modes, so this one is not gated on being unpaired.
  useEffect(() => {
    setFavourites(loadFavourites(identity));
  }, [identity]);

  useEffect(() => {
    const channel = new BroadcastChannel("couple-order-shop");
    broadcastChannel.current = channel;
    channel.onmessage = (event) => {
      if (!cloudCoupleId && event.data?.type === "sync") {
        applyingBroadcast.current = true;
        setOrders(event.data.orders);
        if (event.data.profile) setProfile(event.data.profile);
        if (event.data.customItems) setCustomItems(event.data.customItems);
        // Anniversaries belong to the couple, so both identities take them.
        if (event.data.anniversaries) setAnniversaries(event.data.anniversaries);
        // A wallet only ever accepts an update addressed to its own owner.
        if (event.data.walletOwner && event.data.walletOwner !== identity) setPartnerRefresh((count) => count + 1);
        if (event.data.walletOwner && event.data.walletOwner === identity) {
          setWallet((current) => (current.owner === identity
            ? {
              ...current,
              coins: event.data.coins,
              claims: event.data.claimedTasks ?? current.claims,
              checkins: event.data.checkins ?? current.checkins,
            }
            : current));
        }
      }
    };
    // Only in a real build: the worker caches by URL, and Vite's dev module
    // URLs are unhashed, so registering it in dev serves yesterday's code.
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    return () => {
      broadcastChannel.current = null;
      channel.close();
    };
  }, [cloudCoupleId, identity, setCoins, setClaimedTasks]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(orders));
    // In cloud mode the custom menu belongs to the server; writing it here would
    // leak one couple's wishes into this device's local-only shop.
    if (!cloudCoupleId) {
      localStorage.setItem(STORAGE_KEYS.customItems, JSON.stringify(customItems));
      localStorage.setItem(STORAGE_KEYS.anniversaries, JSON.stringify(anniversaries));
    }
    if (wallet.owner && !cloudCoupleId) {
      localStorage.setItem(walletKey(wallet.owner), String(wallet.coins));
      localStorage.setItem(claimsKey(wallet.owner), JSON.stringify(wallet.claims));
      localStorage.setItem(checkinsKey(wallet.owner), JSON.stringify(wallet.checkins));
    }
    if (applyingBroadcast.current) {
      applyingBroadcast.current = false;
      return;
    }
    if (!cloudCoupleId) {
      broadcastChannel.current?.postMessage({
        type: "sync",
        orders,
        profile,
        customItems,
        anniversaries,
        walletOwner: wallet.owner,
        coins: wallet.coins,
        claimedTasks: wallet.claims,
        checkins: wallet.checkins,
      });
    }
  }, [orders, wallet, profile, customItems, anniversaries, cloudCoupleId]);

  const signMemoryRows = useCallback(async (
    client: SupabaseClient,
    rows: Array<{ id: string; caption: string; happened_on: string; image_path: string | null; created_at: string; created_by: string }>,
  ): Promise<MemoryEntry[]> => {
    const paths = rows.map((row) => row.image_path).filter((path): path is string => Boolean(path));
    const signed = new Map<string, string>();
    if (paths.length > 0) {
      const { data } = await client.storage.from("memory-photos").createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      for (const entry of data ?? []) {
        if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
      }
    }
    memoriesSignedAt.current = Date.now();
    return rows.map((row) => ({
      id: row.id,
      caption: row.caption,
      happenedOn: row.happened_on,
      imagePath: row.image_path ?? undefined,
      imageUrl: row.image_path ? signed.get(row.image_path) : undefined,
      createdAt: row.created_at,
      createdBy: row.created_by,
    }));
  }, []);

  const loadMemories = useCallback(async (client: SupabaseClient, coupleId: string) => {
    const { data } = await client
      .from("memory_entries")
      .select("id, caption, happened_on, image_path, created_at, created_by")
      .eq("couple_id", coupleId)
      .order("happened_on", { ascending: false });
    if (data) setMemories(await signMemoryRows(client, data));
  }, [signMemoryRows]);

  /** Stamped on every successful cloud read, so the strip can say how stale it is. */
  const markSynced = useCallback(() => {
    const now = new Date().toISOString();
    setLastSyncedAt(now);
    try {
      localStorage.setItem(STORAGE_KEYS.lastSync, now);
    } catch {
      // A blocked storage only costs the timestamp across a cold launch.
    }
  }, []);

  const loadOrders = useCallback(async (client: SupabaseClient, coupleId: string) => {
    const { data, error } = await client.from("orders").select("*").eq("couple_id", coupleId).order("created_at", { ascending: false });
    // A failed read used to empty the list: `data` comes back null on error and
    // the map ran anyway, so a dropped connection looked like a shop with no
    // orders in it. Keep what is on screen and let the timestamp go stale.
    if (error || !data) return;
    markSynced();
    setOrders(data.map((row) => ({
      id: row.id,
      itemId: row.item_id,
      itemName: row.item_name,
      itemCategory: row.item_category ?? undefined,
      image: row.image_url ?? undefined,
      price: row.price,
      note: row.note ?? "",
      createdAt: row.created_at,
      desiredTime: row.desired_time,
      status: row.status,
      from: row.from_name,
      to: row.to_name,
      createdBy: row.created_by,
      completedAt: row.completed_at ?? undefined,
      declineNote: row.decline_note ?? undefined,
    })));
  }, [markSynced]);

  /** Wallets are personal, so the balance lives on this user's profile row. */
  const loadMyBalance = useCallback(async (client: SupabaseClient) => {
    const { data } = await client.from("profiles").select("coin_balance").maybeSingle();
    if (typeof data?.coin_balance === "number") setCoins(data.coin_balance);
  }, [setCoins]);

  /**
   * The one view across the couple boundary. It is a function call rather than a
   * `profiles` select on purpose: that table's policy only exposes your own row
   * because the wallet lives there, and this returns no balance.
   */
  const loadPartnerStatus = useCallback(async (client: SupabaseClient) => {
    const { data } = await client.rpc("get_partner_status").maybeSingle();
    if (!data) return setPartner(null);
    const row = data as { display_name: string; streak: number; earned_this_week: number; checked_today: boolean };
    setPartner({
      displayName: row.display_name,
      streak: row.streak,
      earnedThisWeek: row.earned_this_week,
      checkedToday: row.checked_today,
    });
  }, []);

  const loadCouple = useCallback(async (client: SupabaseClient, coupleId: string) => {
    const { data } = await client
      .from("couples")
      .select("name, partner_a_name, partner_b_name, started_on")
      .eq("id", coupleId)
      .maybeSingle();
    if (!data) return;
    setProfile({
      shopName: data.name || DEFAULT_PROFILE.shopName,
      firstName: data.partner_a_name || DEFAULT_PROFILE.firstName,
      secondName: data.partner_b_name || DEFAULT_PROFILE.secondName,
      startedOn: data.started_on || DEFAULT_PROFILE.startedOn,
    });
  }, []);

  const loadCustomWishes = useCallback(async (client: SupabaseClient, coupleId: string) => {
    const { data } = await client
      .from("custom_menu_items")
      .select("id, category, name, description, price")
      .eq("couple_id", coupleId)
      .order("created_at");
    if (data) setCustomItems(data.map(customItemFrom));
  }, []);

  const loadAnniversaries = useCallback(async (client: SupabaseClient, coupleId: string) => {
    const { data } = await client
      .from("anniversaries")
      .select("id, title, event_date, repeats_yearly, reminder_days")
      .eq("couple_id", coupleId)
      .order("event_date");
    if (data) {
      setAnniversaries(data.map((row) => ({
        id: row.id,
        title: row.title,
        eventDate: row.event_date,
        repeatsYearly: row.repeats_yearly,
        reminderDays: row.reminder_days,
      })));
    }
  }, []);

  useEffect(() => {
    if (!supabase || !cloudCoupleId || !authUser) return;
    let active = true;
    const client = supabase;
    const coupleId = cloudCoupleId;
    setRealtime("connecting");

    const loadAll = async () => {
      await Promise.all([
        loadOrders(client, coupleId),
        loadCouple(client, coupleId),
        loadMyBalance(client),
        loadMemories(client, coupleId),
        loadAnniversaries(client, coupleId),
        loadCustomWishes(client, coupleId),
        loadPartnerStatus(client),
      ]);
      if (!active) return;
      // Task claims are per person: each partner earns their own rewards.
      const { data: claims } = await client
        .from("task_claims")
        .select("task_id, period_key")
        .eq("couple_id", coupleId)
        .eq("user_id", authUser.id);
      if (active && claims) setClaimedTasks(claims.map((claim) => `${claim.period_key}:${claim.task_id}`));
      const { data: checkinRow } = await client.rpc("get_checkin_status").single();
      if (active && checkinRow) {
        const status = checkinRow as { streak: number; checked_today: boolean };
        setCheckin({ streak: status.streak, checkedToday: status.checked_today });
      }
      const { data: membershipRow } = await client
        .from("memberships")
        .select("status, membership_plans(name)")
        .eq("couple_id", coupleId)
        .maybeSingle();
      if (active && membershipRow) {
        const plan = membershipRow.membership_plans as unknown as { name?: string } | null;
        setMembership({ planName: plan?.name ?? null, status: membershipRow.status });
      }
    };
    void loadAll();

    // Each table refreshes only what it owns instead of replaying every query.
    const channel = client.channel(`couple:${coupleId}`)
      // An order event is also how a sender learns a decline refunded them.
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `couple_id=eq.${coupleId}` }, () => {
        void loadOrders(client, coupleId);
        void loadMyBalance(client);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "couples", filter: `id=eq.${coupleId}` }, () => {
        void loadCouple(client, coupleId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "memory_entries", filter: `couple_id=eq.${coupleId}` }, () => {
        void loadMemories(client, coupleId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "anniversaries", filter: `couple_id=eq.${coupleId}` }, () => {
        void loadAnniversaries(client, coupleId);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "custom_menu_items", filter: `couple_id=eq.${coupleId}` }, () => {
        void loadCustomWishes(client, coupleId);
      })
      // Either table moving means the other person did something worth showing.
      .on("postgres_changes", { event: "*", schema: "public", table: "task_claims", filter: `couple_id=eq.${coupleId}` }, () => {
        void loadPartnerStatus(client);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_checkins", filter: `couple_id=eq.${coupleId}` }, () => {
        void loadPartnerStatus(client);
      })
      // Realtime is what makes the shop feel like one shop. When it is gone the
      // two phones still work, they just stop hearing each other — and that is
      // worth saying out loud rather than leaving the strip on "实时".
      .subscribe((status) => {
        if (!active) return;
        if (status === "SUBSCRIBED") setRealtime("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtime("dropped");
      });
    return () => {
      active = false;
      client.removeChannel(channel);
    };
  }, [supabase, cloudCoupleId, authUser, syncNonce, loadOrders, loadCouple, loadMyBalance, loadMemories, loadAnniversaries, loadCustomWishes, loadPartnerStatus, setClaimedTasks]);

  // Signed photo links expire after an hour; refresh them when the album is
  // opened again or the app returns to the foreground.
  useEffect(() => {
    if (!supabase || !cloudCoupleId) return;
    const client = supabase;
    const coupleId = cloudCoupleId;
    const refreshIfStale = () => {
      if (memories.every((memory) => !memory.imagePath)) return;
      if (Date.now() - memoriesSignedAt.current < SIGNED_URL_REFRESH_MS) return;
      void loadMemories(client, coupleId);
    };
    if (view === "memories") refreshIfStale();
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => document.removeEventListener("visibilitychange", refreshIfStale);
  }, [supabase, cloudCoupleId, view, memories, loadMemories]);

  // Every anniversary inside its own window is announced, not just the soonest.
  // The dependency is a signature rather than the array: `loadAnniversaries`
  // builds a fresh one on every realtime event, which used to re-arm the timer.
  const dueSignature = dueAnniversaries(anniversaries).map((entry) => `${entry.item.id}:${entry.days}`).join("|");
  const anniversariesRef = useRef(anniversaries);
  anniversariesRef.current = anniversaries;

  useEffect(() => {
    if (!dueSignature) return;
    pruneReminders();
    const today = todayKey();
    const pending = dueAnniversaries(anniversariesRef.current)
      .filter((entry) => !localStorage.getItem(remindedKey(entry.item.id, today)));
    if (pending.length === 0) return;
    const describe = (entry: { item: Anniversary; days: number }) =>
      (entry.days === 0
        ? t("reminder.today", { title: entry.item.title })
        : t("reminder.inDays", { title: entry.item.title, days: entry.days }));
    const timer = window.setTimeout(() => {
      const headline = pending.slice(0, 2).map(describe).join(lang === "zh" ? "；" : "; ");
      showToast(pending.length > 2 ? t("reminder.more", { headline, count: pending.length }) : headline);
      for (const entry of pending) {
        // Marked only once the reminder has actually gone out: writing the key
        // up front meant any re-render inside the delay ate it for the day.
        localStorage.setItem(remindedKey(entry.item.id, today), "1");
        if (notificationsSupported && Notification.permission === "granted" && "serviceWorker" in navigator) {
          void navigator.serviceWorker.getRegistration()
            .then((registration) => registration?.showNotification(t("notif.anniversaryTitle"), {
              body: describe(entry),
              icon: "/assets/app-icon.png",
              tag: `anniversary:${entry.item.id}`,
            }))
            .catch(() => undefined);
        }
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [dueSignature, showToast, t, lang]);

  const clearCloudLocalState = () => {
    localStorage.removeItem(STORAGE_KEYS.cloudId);
    localStorage.removeItem(STORAGE_KEYS.inviteCode);
    localStorage.removeItem(STORAGE_KEYS.orders);
    setCloudCoupleId(null);
    setInviteCode(null);
    setOrders([]);
    // Back to local mode: fall back to this identity's on-device wallet.
    setWallet(walletFor(identity));
    setMemories([]);
    setAnniversaries(loadLocalAnniversaries());
    setCustomItems(loadCustomItems());
    setCheckin({ streak: 0, checkedToday: false });
    setPushState((current) => ({ ...current, subscribed: false }));
  };

  const openAccount = () => {
    setAuthMode(authUser && !authUser.is_anonymous ? "signin" : "signup");
    setAuthOpen(true);
  };

  const submitAuth = async () => {
    const client = await getSupabase();
    if (!client) return showToast(t("toast.cloudNotConfigured"));
    setAuthBusy(true);
    try {
      if (authMode === "recover") {
        if (!authEmail.trim()) throw new Error("email required");
        const { error } = await client.auth.resetPasswordForEmail(authEmail.trim(), { redirectTo: window.location.origin });
        if (error) throw error;
        closeAuth();
        showToast(t("toast.resetSent"));
        return;
      }
      if (authMode === "new-password") {
        if (authPassword.length < 6) throw new Error("password too short");
        const { error } = await client.auth.updateUser({ password: authPassword });
        if (error) throw error;
        setAuthPassword("");
        closeAuth();
        showToast(t("toast.passwordSaved"));
        return;
      }
      if (authMode === "phone") {
        if (!phoneOtpSent) {
          const phone = authPhone.replace(/[\s-]/g, "");
          if (!/^\+\d{7,15}$/.test(phone)) return showToast(t("toast.phoneFormat"));
          const { error } = await client.auth.signInWithOtp({ phone });
          if (error) throw error;
          setPhoneOtpSent(true);
          showToast(t("toast.otpSent"));
        } else {
          const { error } = await client.auth.verifyOtp({ phone: authPhone.replace(/[\s-]/g, ""), token: authOtp.trim(), type: "sms" });
          if (error) throw error;
          closeAuth();
          showToast(t("toast.phoneSignedIn"));
        }
        return;
      }
      if (!/^\S+@\S+\.\S+$/.test(authEmail.trim())) return showToast(t("toast.emailInvalid"));
      if (authPassword.length < 6) return showToast(t("toast.passwordShort"));
      if (authMode === "signup") {
        if (!privacyAccepted) return showToast(t("toast.acceptPrivacy"));
        if (authUser?.is_anonymous) {
          const { error } = await client.auth.updateUser({ email: authEmail.trim(), password: authPassword });
          if (error) throw error;
          showToast(t("toast.upgradeSubmitted"));
        } else {
          const { data, error } = await client.auth.signUp({ email: authEmail.trim(), password: authPassword, options: { emailRedirectTo: window.location.origin } });
          if (error) throw error;
          showToast(t(data.session ? "toast.signupDone" : "toast.signupVerify"));
        }
      } else {
        const { error } = await client.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
        showToast(t("toast.signinDone"));
      }
      setAuthPassword("");
      closeAuth();
    } catch (error) {
      showToast(t(authErrorMessage(error instanceof Error ? error.message : "unknown")));
    } finally {
      setAuthBusy(false);
    }
  };

  const signInWithApple = async () => {
    const client = await getSupabase();
    if (!client) return;
    const { error } = await client.auth.signInWithOAuth({ provider: "apple", options: { redirectTo: window.location.origin } });
    if (error) showToast(t(authErrorMessage(error.message)));
  };

  const signOut = async () => {
    const client = await getSupabase();
    if (!client) return;
    // Before signing out, while the session can still delete the row: otherwise
    // this phone keeps receiving that couple's pushes forever.
    await dropSubscription(client);
    await client.auth.signOut();
    clearCloudLocalState();
    closeAuth();
    showToast(t("toast.signedOut"));
  };

  const exportData = async () => {
    try {
      // Both wallets, not just the one in use: the other identity's balance and
      // claims live on this device too, and the couple's own wishes are the
      // only content a local-only shop has beyond its orders.
      let payload: Record<string, unknown> = {
        exportedAt: new Date().toISOString(),
        formatVersion: 3,
        profile,
        identity,
        orders,
        customItems,
        memories,
        anniversaries,
        wallets: IDENTITIES.map((who) => ({
          identity: who,
          coins: who === wallet.owner ? wallet.coins : loadEconomyCoins(who),
          claimedTasks: who === wallet.owner ? wallet.claims : loadTaskClaims(who),
          checkins: who === wallet.owner ? wallet.checkins : loadCheckinDays(who),
        })),
      };
      const client = cloudCoupleId ? await getSupabase() : null;
      if (client && cloudCoupleId) {
        const [coupleData, walletData, orderData, taskData, memoryData, anniversaryData, checkinData, auditData] = await Promise.all([
          client.from("couples").select("name, partner_a_name, partner_b_name, started_on, created_at").eq("id", cloudCoupleId).maybeSingle(),
          client.from("profiles").select("display_name, coin_balance, created_at").maybeSingle(),
          client.from("orders").select("*").eq("couple_id", cloudCoupleId),
          client.from("task_claims").select("task_id, period_key, reward, created_at").eq("couple_id", cloudCoupleId),
          client.from("memory_entries").select("caption, happened_on, image_path, created_at").eq("couple_id", cloudCoupleId),
          client.from("anniversaries").select("title, event_date, repeats_yearly, reminder_days").eq("couple_id", cloudCoupleId),
          client.from("daily_checkins").select("checked_on, reward, created_at").eq("couple_id", cloudCoupleId),
          client.from("audit_logs").select("action, metadata, created_at").eq("couple_id", cloudCoupleId).order("created_at", { ascending: false }).limit(500),
        ]);
        payload = {
          exportedAt: new Date().toISOString(),
          formatVersion: 3,
          couple: coupleData.data,
          customItems,
          myWallet: walletData.data,
          orders: orderData.data,
          taskClaims: taskData.data,
          memories: memoryData.data,
          anniversaries: anniversaryData.data,
          checkins: checkinData.data,
          auditLog: auditData.data,
        };
      }
      const file = new File([JSON.stringify(payload, null, 2)], `${t("export.fileName")}-${todayKey()}.json`, { type: "application/json" });
      const shareNavigator = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (navigator.share && shareNavigator.canShare?.({ files: [file] })) await navigator.share({ title: t("export.shareTitle"), files: [file] });
      else {
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      showToast(t("toast.exported"));
    } catch {
      showToast(t("toast.exportFailed"));
    }
  };

  const confirmDangerAction = async () => {
    const client = await getSupabase();
    if (!client || !dangerConfirm) return;
    setCloudBusy(true);
    try {
      // The RPCs delete the server rows; the browser subscription is ours to
      // retire, or it would re-attach to whatever couple comes next.
      await dropSubscription(client);
      if (dangerConfirm === "leave") {
        const { error } = await client.rpc("leave_couple_space");
        if (error) throw error;
        clearCloudLocalState();
        showToast(t("toast.unpaired"));
      } else {
        const { error } = await client.rpc("delete_my_account");
        if (error) throw error;
        clearCloudLocalState();
        setAuthUser(null);
        showToast(t("toast.accountDeleted"));
      }
      setDangerConfirm(null);
      setPrivacyOpen(false);
    } catch {
      showToast(t("toast.actionFailed"));
    } finally {
      setCloudBusy(false);
    }
  };

  const dailyCheckin = async () => {
    // A local shop keeps its own streak: the reward is this identity's own coin,
    // and there is no server involved in either mode's arithmetic.
    if (!cloudCoupleId) {
      if (!identity) return;
      const today = todayKey();
      if (wallet.checkins.includes(today)) return showToast(t("toast.alreadyCheckedIn"));
      const days = [today, ...wallet.checkins];
      setWallet((current) => (current.owner === identity
        ? { ...current, coins: current.coins + CHECKIN_REWARD, checkins: days }
        : current));
      return showToast(t("toast.checkinDone", { streak: checkinStreak(days), reward: CHECKIN_REWARD }));
    }
    const client = await getSupabase();
    // cloudCoupleId is read from localStorage synchronously while the session is
    // still being restored, so authUser can legitimately be null for a moment.
    if (!client || !authUser) return showToast(t("toast.restoringSession"));
    const { data, error } = await client.rpc("daily_checkin").single();
    if (error) return showToast(t(rewardErrorMessage(error.message, "toast.alreadyCheckedIn")));
    const result = data as { coin_balance: number; streak: number; reward: number };
    setCoins(result.coin_balance);
    setCheckin({ streak: result.streak, checkedToday: true });
    showToast(t("toast.checkinDone", { streak: result.streak, reward: result.reward }));
  };

  const requirePairedForPhotos = (): boolean => {
    // The album is the one feature a local shop genuinely cannot have; point at
    // the fix instead of at a login form that may not even be configured.
    setMemoryOpen(false);
    setView("ours");
    showToast(t("toast.photosNeedPairing"));
    return false;
  };

  const saveMemory = async () => {
    const client = cloudCoupleId ? await getSupabase() : null;
    if (!client || !cloudCoupleId || !authUser) return requirePairedForPhotos();
    if (!memoryCaption.trim()) return showToast(t("toast.memoryCaptionRequired"));
    if (!isValidDateKey(memoryDate) || memoryDate > todayKey()) return showToast(t("toast.memoryDateFuture"));
    if (editingMemoryId) {
      const caption = memoryCaption.trim();
      setCloudBusy(true);
      // RLS filters rather than fails, so an empty result means the row belongs
      // to the other partner and only they may rewrite it.
      const { data, error } = await client
        .from("memory_entries")
        .update({ caption, happened_on: memoryDate })
        .eq("id", editingMemoryId)
        .select("id");
      setCloudBusy(false);
      if (error) return showToast(t("toast.saveFailed"));
      if (!data?.length) return showToast(t("toast.memoryEditOwn"));
      setMemories((current) => current.map((item) => (item.id === editingMemoryId ? { ...item, caption, happenedOn: memoryDate } : item)));
      closeMemory();
      return showToast(t("toast.memoryUpdated"));
    }
    if (memoryFile && (memoryFile.size > 8 * 1024 * 1024 || !memoryFile.type.startsWith("image/"))) return showToast(t("toast.photoTooLarge"));
    setCloudBusy(true);
    let imagePath: string | undefined;
    try {
      if (memoryFile) {
        const extension = memoryFile.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        imagePath = `${cloudCoupleId}/${newId()}.${extension}`;
        const { error: uploadError } = await client.storage.from("memory-photos").upload(imagePath, memoryFile, { contentType: memoryFile.type, upsert: false });
        if (uploadError) throw uploadError;
      }
      const id = newId();
      const { error } = await client.from("memory_entries").insert({ id, couple_id: cloudCoupleId, created_by: authUser.id, caption: memoryCaption.trim(), happened_on: memoryDate, image_path: imagePath ?? null });
      if (error) throw error;
      let imageUrl: string | undefined;
      if (imagePath) imageUrl = (await client.storage.from("memory-photos").createSignedUrl(imagePath, SIGNED_URL_TTL_SECONDS)).data?.signedUrl;
      setMemories((current) => [{ id, caption: memoryCaption.trim(), happenedOn: memoryDate, imagePath, imageUrl, createdAt: new Date().toISOString(), createdBy: authUser.id }, ...current]);
      setMemoryCaption("");
      setMemoryFile(null);
      closeMemory();
      showToast(t("toast.memorySaved"));
    } catch {
      if (imagePath) await client.storage.from("memory-photos").remove([imagePath]);
      showToast(t("toast.saveFailed"));
    } finally {
      setCloudBusy(false);
    }
  };

  const deleteMemory = async (memory: MemoryEntry) => {
    const client = cloudCoupleId ? await getSupabase() : null;
    if (!client || !authUser) return requirePairedForPhotos();
    setCloudBusy(true);
    const { data, error } = await client.from("memory_entries").delete().eq("id", memory.id).select("id");
    setCloudBusy(false);
    if (error) return showToast(t("toast.deleteFailed"));
    if (!data?.length) return showToast(t("toast.memoryDeleteOwn"));
    // The row is already gone, so a failed object removal must not read as a
    // failed delete; the orphaned file is cleaned up by storage retention.
    if (memory.imagePath) await client.storage.from("memory-photos").remove([memory.imagePath]);
    setMemories((current) => current.filter((item) => item.id !== memory.id));
    closeMemoryDetail();
    showToast(t("toast.memoryDeleted"));
  };

  const anniversaryFields = () => ({
    title: anniversaryTitle.trim(),
    event_date: anniversaryDate,
    repeats_yearly: anniversaryRepeats,
    reminder_days: anniversaryReminder,
  });

  const saveAnniversary = async () => {
    const title = anniversaryTitle.trim();
    if (!title) return showToast(t("toast.annivTitleRequired"));
    if (!isValidDateKey(anniversaryDate)) return showToast(t("toast.dateInvalid"));
    if (cloudCoupleId && !authUser) return showToast(t("toast.restoringSession"));
    const entry: Anniversary = { id: editingAnniversaryId ?? newId(), title, eventDate: anniversaryDate, repeatsYearly: anniversaryRepeats, reminderDays: anniversaryReminder };
    const client = cloudCoupleId ? await getSupabase() : null;
    if (client && cloudCoupleId && authUser) {
      setCloudBusy(true);
      const { error } = editingAnniversaryId
        ? await client.from("anniversaries").update(anniversaryFields()).eq("id", editingAnniversaryId)
        : await client.from("anniversaries").insert({ id: entry.id, couple_id: cloudCoupleId, created_by: authUser.id, ...anniversaryFields() });
      setCloudBusy(false);
      if (error) return showToast(t("toast.saveFailed"));
    }
    setAnniversaries((current) => (editingAnniversaryId
      ? current.map((item) => (item.id === entry.id ? entry : item))
      : [...current, entry]));
    const wasEditing = Boolean(editingAnniversaryId);
    closeAnniversary();
    if (wasEditing) return showToast(t("toast.annivUpdated"));
    showToast(entry.reminderDays > 0
      ? t("toast.annivSavedAhead", { days: entry.reminderDays })
      : t("toast.annivSavedSameDay"));
  };

  const deleteAnniversary = async () => {
    if (!editingAnniversaryId) return;
    const id = editingAnniversaryId;
    const client = cloudCoupleId ? await getSupabase() : null;
    if (client) {
      setCloudBusy(true);
      const { error } = await client.from("anniversaries").delete().eq("id", id);
      setCloudBusy(false);
      if (error) return showToast(t("toast.deleteFailed"));
    }
    setAnniversaries((current) => current.filter((item) => item.id !== id));
    closeAnniversary();
    showToast(t("toast.annivDeleted"));
  };

  const openAddWish = () => {
    setEditingWishId(null);
    setWishDraft({ name: "", description: "", price: "48", category: category === "limited" ? "food" : category });
    setWishOpen(true);
  };

  const openEditWish = (item: MenuItem) => {
    setEditingWishId(item.id);
    setWishDraft({ name: item.name, description: item.description, price: String(item.price), category: item.category });
    setWishOpen(true);
  };

  const saveWish = async () => {
    const name = wishDraft.name.trim();
    const description = wishDraft.description.trim();
    const price = Number(wishDraft.price);
    if (!name) return showToast(t("toast.wishNameRequired"));
    if (name.length > 20) return showToast(t("toast.nameTooLong"));
    if (description.length > 40) return showToast(t("toast.descTooLong"));
    if (!Number.isInteger(price) || price < CUSTOM_PRICE_RANGE.min || price > CUSTOM_PRICE_RANGE.max) {
      return showToast(t("toast.priceRange", { min: CUSTOM_PRICE_RANGE.min, max: CUSTOM_PRICE_RANGE.max }));
    }
    const entry = customItemFrom({ id: editingWishId ?? newId(), category: wishDraft.category, name, description, price });
    const client = cloudCoupleId ? await getSupabase() : null;
    if (client && cloudCoupleId && authUser) {
      setCloudBusy(true);
      const fields = { category: entry.category, name, description, price };
      const { error } = editingWishId
        ? await client.from("custom_menu_items").update(fields).eq("id", editingWishId)
        : await client.from("custom_menu_items").insert({ id: entry.id, couple_id: cloudCoupleId, created_by: authUser.id, ...fields });
      setCloudBusy(false);
      if (error) return showToast(t(wishErrorMessage(error.message)));
    }
    setCustomItems((current) => (editingWishId
      ? current.map((item) => (item.id === entry.id ? entry : item))
      : [...current, entry]));
    setCategory(entry.category);
    closeWish();
    showToast(editingWishId ? t("toast.wishUpdated") : t("toast.wishListed", { name }));
  };

  const deleteWish = async () => {
    if (!editingWishId) return;
    const client = cloudCoupleId ? await getSupabase() : null;
    if (client) {
      setCloudBusy(true);
      const { error } = await client.from("custom_menu_items").delete().eq("id", editingWishId);
      setCloudBusy(false);
      if (error) return showToast(t("toast.deleteFailed"));
    }
    // Orders already placed keep their own name, price and category, so taking
    // a wish off the menu never rewrites what has already happened.
    setCustomItems((current) => current.filter((item) => item.id !== editingWishId));
    closeWish();
    showToast(t("toast.wishRemoved"));
  };

  const openSettings = () => {
    setProfileDraft(localizedProfile(profile, lang));
    setSettingsOpen(true);
  };

  const saveProfile = async () => {
    const nextProfile: CoupleProfile = {
      shopName: profileDraft.shopName.trim(),
      firstName: profileDraft.firstName.trim(),
      secondName: profileDraft.secondName.trim(),
      startedOn: profileDraft.startedOn.trim(),
    };
    if (!nextProfile.shopName || !nextProfile.firstName || !nextProfile.secondName) return showToast(t("toast.profileIncomplete"));
    if ([nextProfile.shopName, nextProfile.firstName, nextProfile.secondName].some((value) => value.length > 20)) return showToast(t("toast.nameTooLong"));
    if (!isValidDateKey(nextProfile.startedOn)) return showToast(t("toast.startedOnFormat"));
    if (nextProfile.startedOn > todayKey()) return showToast(t("toast.startedOnFuture"));

    setProfileSaving(true);
    try {
      const client = cloudCoupleId ? await getSupabase() : null;
      if (client) {
        const { error } = await client.rpc("update_couple_profile", {
          p_name: nextProfile.shopName,
          p_partner_a_name: nextProfile.firstName,
          p_partner_b_name: nextProfile.secondName,
          p_started_on: nextProfile.startedOn,
        });
        if (error) throw error;
      }
      setProfile(nextProfile);
      closeSettings();
      showToast(t(cloudCoupleId ? "toast.profileSynced" : "toast.profileSaved"));
    } catch {
      showToast(t("toast.saveFailed"));
    } finally {
      setProfileSaving(false);
    }
  };

  const switchIdentity = () => {
    localStorage.removeItem(STORAGE_KEYS.identity);
    setIdentity(null);
  };

  const toggleFavouriteItem = (item: MenuItem) => {
    if (!identity) return;
    const next = toggleFavourite(favourites, item.id);
    setFavourites(next);
    try {
      localStorage.setItem(favouritesKey(identity), JSON.stringify(next));
    } catch {
      // A blocked storage must not stop the star from filling in on screen.
    }
  };

  /** 此刻 points at one order; the orders page has to widen its own filter. */
  const openOrderFromMoment = (orderId: string) => {
    setFocusOrderId(orderId);
    setView("orders");
  };

  const chooseRandom = () => {
    // Whichever category is open, not only 点吃的: the other three had no
    // randomiser at all, which is where choosing gets hardest.
    const pool = [...customItems, ...MENU].filter((item) => item.category === category && !usedLimitedIds.includes(item.id));
    if (pool.length === 0) return showToast(t("toast.categoryEmpty"));
    const item = pool[Math.floor(Math.random() * pool.length)];
    setSelected(item);
    showToast(t("toast.randomPick", { name: localizedItem(item, lang).name }));
  };

  const copyInviteCode = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      showToast(t("toast.inviteCopied", { code: inviteCode }));
    } catch {
      // A blocked clipboard still has to leave the reader with the code.
      showToast(t("toast.inviteIs", { code: inviteCode }));
    }
  };

  /**
   * The invitation, through whatever the two of them already talk in.
   *
   * `navigator.share` is the whole point on a phone — it reaches iMessage and
   * WeChat without this app knowing either exists — but it only exists on some
   * browsers and only in a secure context, and it rejects when the sheet is
   * dismissed. A cancelled share is not a failure and must not be answered with
   * a clipboard toast; anything else falls back to copying the link.
   */
  const shareInvite = async () => {
    if (!inviteCode || !inviteLink) return;
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: shownProfile.shopName,
          text: t("invite.shareText", { code: inviteCode }),
          url: inviteLink,
        });
        return;
      } catch (error) {
        if ((error as { name?: string } | null)?.name === "AbortError") return;
      }
    }
    await copyInviteLink();
  };

  const copyInviteLink = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      showToast(t("toast.linkCopied"));
    } catch {
      showToast(t("toast.linkIs", { link: inviteLink }));
    }
  };

  /**
   * Re-reads everything and re-opens the realtime channel.
   *
   * Bumping the nonce re-runs the effect that owns both, which is the point:
   * when the live connection is what broke, re-reading the tables without
   * re-subscribing would leave the shop quiet again a second later.
   */
  const syncNow = () => {
    if (!cloudCoupleId) return setView("ours");
    setSyncNonce((value) => value + 1);
    showToast(t("toast.resyncing"));
  };

  const submitOrder = async () => {
    if (!selected || !identity || !currentName || !partnerName) return;
    const order: Order = {
      id: newId(),
      itemId: selected.id,
      itemName: selected.name,
      itemCategory: selected.category,
      image: selected.image,
      price: selected.price,
      note: note.trim(),
      createdAt: new Date().toISOString(),
      desiredTime: time,
      status: "pending",
      from: currentName,
      to: partnerName,
      createdBy: authUser?.id,
    };
    const client = cloudCoupleId ? await getSupabase() : null;
    if (client) {
      const { data, error } = await client.rpc("place_couple_order", {
        p_id: order.id,
        p_item_id: order.itemId,
        p_item_name: order.itemName,
        p_image_url: order.image ?? null,
        p_price: order.price,
        p_note: order.note,
        p_desired_time: order.desiredTime,
        p_from_name: order.from,
        p_to_name: order.to,
      }).single();
      if (error) return showToast(t(orderErrorMessage(error.message)));
      const result = data as { order_id: string; coin_balance: number };
      setCoins(result.coin_balance);
      setOrders((current) => [order, ...current.filter((item) => item.id !== order.id)]);
      closeOrderSheet();
      setNote("");
      setTime(desiredTimes(lang)[0]);
      // Say only what is true right now; upgrade the wording once the push has
      // actually been handed over. This used to claim delivery beforehand and
      // then discard the invoke's error entirely.
      showToast(t("toast.orderPlaced"));
      const notice = await notifyPartner(client, order.id, "order.created");
      if (notice && notice.delivered > 0) showToast(t("toast.orderNotified", { partner: partnerLabel }));
      else if (notice && notice.subscribed === 0) showToast(t("toast.orderNoPush", { partner: partnerLabel }));
      return;
    }
    if (usedLimitedIds.includes(selected.id)) return showToast(t("toast.limitedUsed"));
    if (coins < selected.price) return showToast(t("toast.notEnoughCoins"));
    setOrders((current) => [order, ...current]);
    setCoins((current) => current - selected.price);
    closeOrderSheet();
    setNote("");
    setTime(desiredTimes(lang)[0]);
    showToast(t("toast.orderPlaced"));
  };

  /** Refunds the payer in local mode; the payer may be the other identity. */
  const refundLocally = (target: Order) => {
    const payer = target.from === currentName ? identity : partnerIdentity;
    if (payer && payer === wallet.owner) setCoins((current) => current + target.price);
    else if (payer) localStorage.setItem(walletKey(payer), String(loadEconomyCoins(payer) + target.price));
  };

  const cancelOrder = async (id: string) => {
    const target = orders.find((order) => order.id === id);
    if (!target || target.status !== "pending") return;
    const client = cloudCoupleId ? await getSupabase() : null;
    if (client) {
      const { data, error } = await client.rpc("cancel_couple_order", { p_order_id: id }).single();
      if (error) return showToast(t(orderStatusErrorMessage(error.message)));
      const result = data as { coin_balance: number } | null;
      if (typeof result?.coin_balance === "number") setCoins(result.coin_balance);
      void notifyPartner(client, id, "order.cancelled");
    } else {
      refundLocally(target);
    }
    setOrders((current) => current.map((order) => (order.id === id ? { ...order, status: "cancelled" } : order)));
    showToast(t("toast.cancelled", { price: target.price }));
  };

  const updateStatus = async (id: string, status: OrderStatus, note?: string) => {
    const target = orders.find((order) => order.id === id);
    const client = cloudCoupleId ? await getSupabase() : null;
    if (client) {
      const { data, error } = await client.rpc("update_order_status", { p_order_id: id, p_status: status, p_note: note ?? null }).single();
      if (error) return showToast(t(orderStatusErrorMessage(error.message)));
      const result = data as { coin_balance: number } | null;
      if (typeof result?.coin_balance === "number") setCoins(result.coin_balance);
      // The sender is the one who needs to hear this; this device says nothing
      // about it, because the notification lands on the other phone.
      void notifyPartner(client, id, `order.${status}`);
    } else if (status === "rejected" && target) {
      // Local mode has no server to refund with.
      refundLocally(target);
    }
    // Local mode has no server to stamp the completion, and the weekly task and
    // the monthly count both read it.
    const completedAt = status === "done" ? new Date().toISOString() : undefined;
    setOrders((current) => current.map((order) => (order.id === id
      ? { ...order, status, completedAt: completedAt ?? order.completedAt, declineNote: status === "rejected" ? note : order.declineNote }
      : order)));
    if (status === "rejected") showToast(t("toast.declined", { price: target?.price ?? 0, name: target?.from ?? t("toast.partnerFallback") }));
    else if (status === "done") showToast(t("toast.wishDone"));
    else showToast(t("toast.orderStatusUpdated", { status: STATUS_TEXT[lang][status] }));
  };

  const claimTask = async (task: CoupleTask) => {
    const key = taskClaimKey(task);
    if (claimedTasks.includes(key)) return;
    const client = cloudCoupleId ? await getSupabase() : null;
    if (client) {
      const { data, error } = await client.rpc("claim_couple_task", { p_task_id: task.id }).single();
      if (error) return showToast(t(rewardErrorMessage(error.message, "toast.taskAlreadyClaimed")));
      const result = data as { coin_balance: number; claim_key: string };
      setClaimedTasks((current) => [...current, `${result.claim_key}:${task.id}`]);
      setCoins(result.coin_balance);
      showToast(t("toast.taskClaimed", { reward: task.reward }));
      return;
    }
    setClaimedTasks((current) => [...current, key]);
    setCoins((current) => current + task.reward);
    showToast(t("toast.taskClaimed", { reward: task.reward }));
  };

  const enableNotifications = async () => {
    if (!notificationsSupported) return showToast(t("toast.notifUnsupported"));
    const permission = await Notification.requestPermission();
    setPushState((current) => ({ ...current, permission }));
    if (permission !== "granted") return showToast(t("toast.notifDenied"));
    // Everything below decides whether this device can actually be pushed to.
    // The old code promised push unconditionally, including when it had just
    // reported that the subscription failed.
    const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    const client = cloudCoupleId ? await getSupabase() : null;
    if (!registration || !vapidPublicKey()) return showToast(t("toast.notifLocalOnly"));
    // Reachable before an identity has been chosen, where there is no partner
    // to name yet — the old template literal printed a literal "null" here.
    const them = partnerLabel ?? t("toast.partnerFallback");
    if (!client || !cloudCoupleId || !authUser) return showToast(t("toast.notifNeedPair", { partner: them }));
    try {
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(vapidPublicKey()!),
      });
      await saveSubscription(client, subscription, cloudCoupleId, authUser.id);
      setPushState({ permission, subscribed: true });
      showToast(t("toast.notifOn", { partner: them }));
      void registration.showNotification(t("notif.appName"), { body: t("notif.enabledBody"), icon: "/assets/app-icon.png" });
    } catch {
      setPushState({ permission, subscribed: false });
      showToast(t("toast.notifSubFailed"));
    }
  };

  const createCloudSpace = async () => {
    const client = await getSupabase();
    if (!client || !identity) return;
    if (!authUser || authUser.is_anonymous) {
      setAuthMode("signup");
      setAuthOpen(true);
      return showToast(t("toast.needAccountCreate"));
    }
    setCloudBusy(true);
    try {
      const { data, error } = await client.rpc("create_couple_space", { display_name: identity }).single();
      if (error) throw error;
      const row = data as { couple_id: string; invite_code: string };
      localStorage.setItem(STORAGE_KEYS.cloudId, row.couple_id);
      localStorage.setItem(STORAGE_KEYS.inviteCode, row.invite_code);
      setCloudCoupleId(row.couple_id);
      setInviteCode(row.invite_code);
      await client.rpc("update_couple_profile", {
        p_name: profile.shopName,
        p_partner_a_name: profile.firstName,
        p_partner_b_name: profile.secondName,
        p_started_on: profile.startedOn,
      });
      showToast(t("toast.inviteCreated", { code: row.invite_code }));
    } catch {
      showToast(t("toast.createFailed"));
    } finally {
      setCloudBusy(false);
    }
  };

  const joinCloudSpace = async () => {
    const client = await getSupabase();
    if (!client || !identity) return;
    if (!authUser || authUser.is_anonymous) {
      setAuthMode("signup");
      setAuthOpen(true);
      return showToast(t("toast.needAccountJoin"));
    }
    setCloudBusy(true);
    try {
      const { data, error } = await client.rpc("join_couple_space", { code: pairingCode, display_name: identity }).single();
      if (error) throw error;
      const row = data as { couple_id: string };
      localStorage.setItem(STORAGE_KEYS.cloudId, row.couple_id);
      localStorage.setItem(STORAGE_KEYS.inviteCode, pairingCode);
      setCloudCoupleId(row.couple_id);
      setInviteCode(pairingCode);
      setPairingCode("");
      showToast(t("toast.paired"));
    } catch {
      showToast(t("toast.inviteNotFound"));
    } finally {
      setCloudBusy(false);
    }
  };

  if (!identity || !currentName || !partnerName) {
    return (
      <div className="app-shell identity-shell">
        <MobileScroll className="identity-screen">
          <main className="identity-login" aria-label={t("identity.aria")}>
            <div className="identity-brand">
              <span><HeartFilledIcon /></span>
              <strong>{shownProfile.shopName}</strong>
              {/* This is the first screen anyone sees, so the switch has to be
                  here too — otherwise an English reader has to guess their way
                  through a Chinese identity choice to reach the setting. */}
              <div className="identity-lang" role="group" aria-label={t("ours.language")}>
                {LANGS.map((option) => (
                  <button
                    key={option}
                    className={lang === option ? "is-active" : ""}
                    aria-pressed={lang === option}
                    onClick={() => setLang(option)}
                  >
                    {LANG_LABEL[option]}
                  </button>
                ))}
              </div>
            </div>
            <div className="identity-welcome"><span>{shownProfile.firstName} & {shownProfile.secondName}</span><h1>{t("identity.question")}</h1><p>{t("identity.hint")}</p></div>
            <div className="identity-options">
              {identityOptions.map((option) => (
                <button key={option.name} className={`identity-choice ${option.tone}`} onClick={() => { chooseIdentity(option.name); setView("shop"); }}>
                  <span className="identity-avatar">{option.displayName.slice(0, 1)}</span>
                  <span><strong>{t("identity.iAm", { name: option.displayName })}</strong><small>{t("identity.todayBy", { name: option.displayName })}</small></span>
                  <span className="identity-arrow"><PaperPlaneIcon /></span>
                </button>
              ))}
            </div>
            <div className="identity-note"><CheckCircledIcon /><span>{t("identity.remembered")}</span></div>
          </main>
        </MobileScroll>
      </div>
    );
  }

  const currentLabel = localizedPersonName(currentName, lang);
  const partnerLabel = localizedPersonName(partnerName, lang);

  // How stale the cloud copy is, in buckets: a timestamp to the second only
  // invites watching it.
  const age = syncAge(lastSyncedAt);
  const freshness = !lastSyncedAt || !age
    ? t("sync.never")
    : age === "now"
      ? t("sync.syncedNow")
      : age === "minutes"
        ? t("sync.syncedMinutes", { count: syncAgeValue(lastSyncedAt) })
        : age === "hours"
          ? t("sync.syncedHours", { count: syncAgeValue(lastSyncedAt) })
          : t("sync.syncedStale");

  const syncState = cloudCoupleId
    ? realtime === "live"
      ? { title: t("sync.connected", { partner: partnerLabel }), detail: freshness, live: true, action: null }
      : realtime === "connecting"
        ? { title: t("sync.connected", { partner: partnerLabel }), detail: t("sync.reconnecting"), live: false, action: null }
        : { title: t("sync.dropped"), detail: freshness, live: false, action: "retry" as const }
    : cloudEnabled
      ? { title: t("sync.waiting", { partner: partnerLabel }), detail: t("sync.waitingDetail"), live: false, action: "connect" as const }
      : { title: t("sync.local"), detail: t("sync.localDetail"), live: false, action: null };

  // The cloud steps only exist for a build that has a project behind it; on a
  // local install the checklist is honestly two steps long.
  const openingSteps: OpeningStep[] = [
    { id: "identity", title: t("opening.identity", { name: currentLabel }), detail: t("opening.identityDetail"), done: true },
    ...(cloudEnabled ? [
      {
        id: "account",
        title: t("opening.account"),
        detail: t("opening.accountDetail"),
        done: Boolean(authUser && !authUser.is_anonymous),
        action: openAccount,
        cta: t("opening.accountCta"),
      },
      {
        id: "pair",
        title: t("opening.pair"),
        detail: t("opening.pairDetail", { partner: partnerLabel }),
        done: Boolean(cloudCoupleId),
        action: () => setView("ours"),
        cta: t("opening.pairCta"),
      },
      // Installing comes first because on iPhone it is what makes push exist
      // at all. Once installed the step drops off instead of sitting ticked.
      ...(installed ? [] : [{
        id: "install",
        title: t("opening.install"),
        detail: t("opening.installDetail"),
        done: false,
        action: () => setInstallHelpOpen(true),
        cta: t("opening.installCta"),
      }]),
      // A browser with no push service would leave this permanently unticked
      // and the checklist permanently on screen, so it is only offered where it
      // can actually be finished.
      ...(pushCapable() ? [{
        id: "push",
        title: t("opening.push"),
        detail: t("opening.pushDetail"),
        done: pushState.subscribed,
        action: enableNotifications,
        cta: t("opening.pushCta"),
      }] : []),
    ] : []),
    {
      id: "order",
      title: t("opening.firstOrder"),
      detail: t("opening.firstOrderDetail", { partner: partnerLabel }),
      done: orders.length > 0,
      action: () => setView("shop"),
      cta: t("opening.firstOrderCta"),
    },
  ];

  return (
    <div className="app-shell">
      <MobileScroll className="app-screen" scrollKey={view}>
        <main className="screen-content couple-shop" aria-label={t("app.aria")} onPointerDown={dismissKeyboardOnOutsideTap}>
          <header className="top-bar">
            <div className="brand-mark"><HeartFilledIcon /></div>
            <div className="brand-copy"><span>{shownProfile.firstName} & {shownProfile.secondName}</span><h1>{shownProfile.shopName}</h1></div>
            <button className="bell-button" onClick={() => setView("orders")} aria-label={t("app.viewOrders")}><BellIcon />{activeOrders > 0 && <span>{activeOrders}</span>}</button>
          </header>
          {/* Not a sign when it is also the fix: unpaired, this line is the
              shortest route to pairing, so it is a button. */}
          <section
            className={`live-push-strip ${syncState.action === "retry" ? "is-dropped" : ""}`.trim()}
            aria-label={syncState.action === "retry"
              ? t("sync.ariaRetry")
              : syncState.action === "connect" ? t("sync.ariaConnect") : t("sync.ariaStatus")}
            role={syncState.action ? "button" : undefined}
            tabIndex={syncState.action ? 0 : undefined}
            onClick={syncState.action === "retry" ? syncNow : syncState.action === "connect" ? () => setView("ours") : undefined}
          >
            <span className="live-push-icon"><BellIcon /></span>
            <div><strong>{syncState.title}</strong><small>{syncState.detail}</small></div>
            {syncState.live
              ? <span className="live-state"><i /> {t("sync.live")}</span>
              : syncState.action && <span className="live-go">{syncState.action === "retry" ? t("sync.retry") : t("sync.goConnect")}</span>}
          </section>
          {view === "shop" && !openingDismissed && (
            <OpeningProgress steps={openingSteps} onDismiss={() => {
              localStorage.setItem(STORAGE_KEYS.openingDismissed, "1");
              setOpeningDismissed(true);
            }} />
          )}
          {/* Above the wallet on purpose: what the other person is waiting for
              matters more than how many coins are left. */}
          {view === "shop" && partnerName && (
            <MomentsSection
              moments={moments}
              partnerName={partnerLabel}
              onOpenOrders={openOrderFromMoment}
              onPlanDate={() => { setCategory("date"); setView("shop"); }}
              onOrder={setSelected}
              onEarn={() => setView("tasks")}
            />
          )}
          <section className="wallet-card">
            <div className="coin-count"><HeartFilledIcon /><strong>{coins}</strong><span>{t("app.coin", { count: coins })}</span></div>
            <button className="earn-link" onClick={() => setView("tasks")}><CheckCircledIcon /><span>{t("app.earnCoins")}</span></button>
          </section>

          {view === "shop" && (
            <ShopScreen
              category={category}
              setCategory={setCategory}
              onAdd={setSelected}
              onRandom={chooseRandom}
              usedLimitedIds={usedLimitedIds}
              customItems={customItems}
              onAddCustom={openAddWish}
              onEditCustom={openEditWish}
              coins={coins}
              pinned={pinned}
              favouriteIds={favourites}
              onToggleFavourite={toggleFavouriteItem}
              history={history}
            />
          )}
          {view === "tasks" && (
            <TasksScreen
              coins={coins}
              claimedTasks={claimedTasks}
              onClaim={claimTask}
              orders={orders}
              memories={memories}
              currentName={currentName}
              currentUserId={authUser?.id}
              memoriesTracked={Boolean(cloudCoupleId)}
              partner={partner}
            />
          )}
          {view === "orders" && (
            <OrdersScreen
              orders={orders}
              currentName={currentName}
              onStatus={updateStatus}
              onCancel={cancelOrder}
              onKeepAsMemory={keepOrderAsMemory}
              focusOrderId={focusOrderId}
              onFocusConsumed={() => setFocusOrderId(null)}
              onBrowseShop={() => setView("shop")}
            />
          )}
          {view === "memories" && (
            <MemoriesScreen
              orders={orders}
              profile={shownProfile}
              memories={memories}
              anniversaries={anniversaries}
              checkin={cloudCoupleId ? checkin : checkinStatusFrom(wallet.checkins)}
              onCheckin={dailyCheckin}
              onAddMemory={openAddMemory}
              onOpenMemory={setMemoryDetail}
              onAddAnniversary={openAddAnniversary}
              onEditAnniversary={openEditAnniversary}
              paired={Boolean(cloudCoupleId)}
              onPair={() => setView("ours")}
              onPlanDate={() => { setCategory("date"); setView("shop"); }}
              onWriteWish={() => { openAddWish(); setView("shop"); }}
            />
          )}
          {view === "ours" && (
            <OursScreen
              identity={identity}
              partnerName={partnerLabel}
              onSwitchIdentity={switchIdentity}
              push={pushState}
              onEnableNotifications={enableNotifications}
              cloudCoupleId={cloudCoupleId}
              inviteCode={cloudCoupleId ? inviteCode : null}
              onOpenInvite={() => setInviteOpen(true)}
              onOpenMove={() => setMoveOpen(true)}
              syncDetail={freshness}
              realtime={realtime}
              onSyncNow={syncNow}
              pairingCode={pairingCode}
              setPairingCode={setPairingCode}
              cloudBusy={cloudBusy}
              onCreateSpace={createCloudSpace}
              onJoinSpace={joinCloudSpace}
              profile={shownProfile}
              onOpenSettings={openSettings}
              authUser={authUser}
              onOpenAccount={openAccount}
              membership={membership}
              onExport={exportData}
              onLeaveCouple={() => { setDangerConfirm("leave"); setPrivacyOpen(true); }}
              onOpenPrivacy={() => setPrivacyOpen(true)}
            />
          )}
          <div className="bottom-spacer" />
        </main>
      </MobileScroll>

      <nav className="bottom-nav" aria-label={t("nav.aria")} style={{ bottom: bottomInset + 9 }}>
        <button className={view === "shop" ? "active" : ""} onClick={() => setView("shop")}><HomeIcon /><span>{t("nav.shop")}</span></button>
        <button className={view === "tasks" ? "active" : ""} onClick={() => setView("tasks")}><TargetIcon /><span>{t("nav.tasks")}</span></button>
        <button className={view === "orders" ? "active" : ""} onClick={() => setView("orders")}><ArchiveIcon />{activeOrders > 0 && <i />}<span>{t("nav.orders")}</span></button>
        <button className={view === "memories" ? "active" : ""} onClick={() => setView("memories")}><HeartIcon /><span>{t("nav.memories")}</span></button>
        <button className={view === "ours" ? "active" : ""} onClick={() => setView("ours")}><PersonIcon /><span>{t("nav.ours")}</span></button>
      </nav>

      <BottomSheet open={Boolean(selected)} onOpenChange={(open) => !open && closeOrderSheet()} title={selected ? t("order.sheetTitle", { name: localizedItem(selected, lang).name }) : t("order.sheetFallbackTitle")} description={t("order.sheetDesc")}>
        {selected && (
          <div className="order-sheet">
            <div className="sheet-item"><div className="sheet-art"><MenuArt item={selected} /></div><div><h3>{localizedItem(selected, lang).name}</h3><p>{localizedItem(selected, lang).description}</p></div><div className="price-pill"><HeartFilledIcon /> {selected.price}</div></div>
            <div className="time-options">
              <span>{t("order.when")}</span>
              {/* The stored value is whatever was on screen when it was picked,
                  so a language switch has to be normalised before comparing. */}
              <div>{desiredTimes(lang).map((option) => <button key={option} className={localizeDesiredTime(time, lang) === option ? "active" : ""} onClick={() => setTime(option)}>{option}</button>)}</div>
            </div>
            <label className="order-note-field" htmlFor="order-time">
              <span>{t("order.customTime")}</span>
              <KeyboardInput id="order-time" value={time} maxLength={40} onChange={(event) => setTime(event.target.value)} placeholder={t("order.customTimePlaceholder")} />
            </label>
            <label className="order-note-field" htmlFor="order-note">
              <span>{t("order.note")}</span>
              <KeyboardInput id="order-note" value={note} maxLength={160} onChange={(event) => setNote(event.target.value)} placeholder={t("order.notePlaceholder")} />
            </label>
            {selected.price > coins ? (
              <div className="order-short">
                <strong>{t("order.short", { count: selected.price - coins })}</strong>
                <p>
                  {cloudEnabled && !cloudCoupleId
                    ? t("order.shortPair", { partner: partnerLabel, bonus: PAIRING_BONUS })
                    : t("order.shortTasks")}
                </p>
                <button
                  className="submit-order"
                  onClick={() => {
                    closeOrderSheet();
                    setView(cloudEnabled && !cloudCoupleId ? "ours" : "tasks");
                  }}
                >
                  {cloudEnabled && !cloudCoupleId ? t("order.goPair", { partner: partnerLabel }) : t("order.goTasks")}
                </button>
              </div>
            ) : (
              <button className="submit-order" onClick={submitOrder}><HeartFilledIcon /> {t("order.confirm", { price: selected.price })}</button>
            )}
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={wishOpen} onOpenChange={(open) => (open ? setWishOpen(true) : closeWish())} title={t(editingWishId ? "wish.editTitle" : "wish.newTitle")} description={t("wish.desc", { min: CUSTOM_PRICE_RANGE.min, max: CUSTOM_PRICE_RANGE.max })}>
        <div className="memory-form">
          {/* A blank form asks people to be inventive on the spot, which is
              exactly when nothing comes to mind. */}
          {!editingWishId && (
            <div className="wish-templates">
              <span>{t("wish.templates")}</span>
              <div className="wish-template-row">
                {WISH_TEMPLATES.map((template) => {
                  const copy = localizedTemplate(template, lang);
                  return (
                    <button
                      key={template.name}
                      onClick={() => setWishDraft({ name: copy.name, description: copy.description, price: String(template.price), category: template.category })}
                    >
                      {copy.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <label className="account-field" htmlFor="wish-name"><span>{t("wish.name")}</span><KeyboardInput id="wish-name" value={wishDraft.name} maxLength={20} onChange={(event) => setWishDraft((current) => ({ ...current, name: event.target.value }))} placeholder={t("wish.namePlaceholder")} /></label>
          <label className="account-field" htmlFor="wish-desc"><span>{t("wish.summary")}</span><KeyboardInput id="wish-desc" value={wishDraft.description} maxLength={40} onChange={(event) => setWishDraft((current) => ({ ...current, description: event.target.value }))} placeholder={t("wish.summaryPlaceholder")} /></label>
          <div className="option-field">
            <span>{t("wish.category")}</span>
            <div className="option-row">
              {CUSTOM_CATEGORIES.map((option) => (
                <button key={option} className={wishDraft.category === option ? "active" : ""} onClick={() => setWishDraft((current) => ({ ...current, category: option }))}>
                  {localizedCategory(categoryMeta.find((meta) => meta.id === option)!, lang).label}
                </button>
              ))}
            </div>
          </div>
          <label className="account-field" htmlFor="wish-price"><span>{t("wish.price")}</span><KeyboardInput id="wish-price" value={wishDraft.price} inputMode="numeric" maxLength={3} onChange={(event) => setWishDraft((current) => ({ ...current, price: event.target.value.replace(/\D/g, "") }))} placeholder="48" /></label>
          {confirmDelete === "wish" ? (
            <div className="delete-confirm">
              <strong>{t("wish.removeTitle")}</strong>
              <p>{t("wish.removeBody")}</p>
              <button className="account-danger" disabled={cloudBusy} onClick={deleteWish}>{t(cloudBusy ? "wish.removing" : "wish.removeConfirm")}</button>
              <button className="account-secondary" onClick={() => setConfirmDelete(null)}>{t("common.thinkAgain")}</button>
            </div>
          ) : (
            <>
              <button className="account-primary" disabled={cloudBusy} onClick={saveWish}>{cloudBusy ? t("common.saving") : editingWishId ? t("common.saveEdits") : t("wish.publish")}</button>
              {editingWishId && <button className="account-danger" onClick={() => setConfirmDelete("wish")}><TrashIcon /> {t("wish.remove")}</button>}
            </>
          )}
        </div>
      </BottomSheet>

      <BottomSheet open={settingsOpen} onOpenChange={(open) => (open ? setSettingsOpen(true) : closeSettings())} title={t("settings.title")} description={t(cloudCoupleId ? "settings.descSynced" : "settings.descLocal")}>
        <div className="profile-sheet">
          <div className="profile-preview">
            <span>{profileDraft.firstName.slice(0, 1) || DEFAULT_PROFILE.firstName.slice(0, 1)}</span>
            <div><small>{profileDraft.shopName || DEFAULT_PROFILE.shopName}</small><strong>{profileDraft.firstName || DEFAULT_PROFILE.firstName} & {profileDraft.secondName || DEFAULT_PROFILE.secondName}</strong><p>{t("settings.startedFrom", { date: formatStartedOn(profileDraft.startedOn, lang) })}</p></div>
            <span className="partner">{profileDraft.secondName.slice(0, 1) || DEFAULT_PROFILE.secondName.slice(0, 1)}</span>
          </div>
          <label className="profile-field" htmlFor="shop-name"><span>{t("settings.shopName")}</span><KeyboardInput id="shop-name" value={profileDraft.shopName} maxLength={20} onChange={(event) => setProfileDraft((current) => ({ ...current, shopName: event.target.value }))} placeholder={t("settings.shopNamePlaceholder")} /></label>
          <div className="profile-name-grid">
            <label className="profile-field" htmlFor="first-name"><span>{t("settings.firstName")}</span><KeyboardInput id="first-name" value={profileDraft.firstName} maxLength={20} onChange={(event) => setProfileDraft((current) => ({ ...current, firstName: event.target.value }))} placeholder={DEFAULT_PROFILE.firstName} /></label>
            <label className="profile-field" htmlFor="second-name"><span>{t("settings.secondName")}</span><KeyboardInput id="second-name" value={profileDraft.secondName} maxLength={20} onChange={(event) => setProfileDraft((current) => ({ ...current, secondName: event.target.value }))} placeholder={DEFAULT_PROFILE.secondName} /></label>
          </div>
          <label className="profile-field" htmlFor="started-on"><span>{t("settings.startedOn")}</span><KeyboardInput id="started-on" value={profileDraft.startedOn} inputMode="numeric" maxLength={10} onChange={(event) => setProfileDraft((current) => ({ ...current, startedOn: normalizeDateInput(event.target.value) }))} placeholder="YYYY-MM-DD" /><small>{t("settings.startedOnHint")}</small></label>
          <button className="save-profile" disabled={profileSaving} onClick={saveProfile}><CheckIcon />{t(profileSaving ? "common.saving" : "settings.save")}</button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={authOpen}
        onOpenChange={(open) => (open ? setAuthOpen(true) : closeAuth())}
        title={protectedAccount ? t("account.center") : t(authCopy.title)}
        description={protectedAccount ? t("account.protectedDesc") : t(authCopy.description)}
      >
        <div className="account-sheet">
          {authUser && !authUser.is_anonymous ? (
            <>
              <div className="account-profile"><span><LockClosedIcon /></span><div><small>{t("account.verified")}</small><strong>{authUser.email ?? authUser.phone ?? t("account.apple")}</strong><p>{t("account.idNote")}</p></div></div>
              <div className="account-benefits"><div><CheckCircledIcon /><span>{t("account.benefit1")}</span></div><div><CheckCircledIcon /><span>{t("account.benefit2")}</span></div><div><CheckCircledIcon /><span>{t("account.benefit3")}</span></div></div>
              <button className="account-secondary" onClick={signOut}><ExitIcon /> {t("account.signOut")}</button>
              <button className="account-danger" onClick={() => { closeAuth(); setDangerConfirm("delete"); setPrivacyOpen(true); }}><TrashIcon /> {t("account.delete")}</button>
            </>
          ) : (
            <>
              {authMode !== "recover" && authMode !== "new-password" && authMode !== "phone" && <div className="auth-tabs"><button className={authMode === "signin" ? "active" : ""} onClick={() => setAuthMode("signin")}>{t("account.tabSignin")}</button><button className={authMode === "signup" ? "active" : ""} onClick={() => setAuthMode("signup")}>{t(authUser?.is_anonymous ? "account.tabUpgrade" : "account.tabSignup")}</button></div>}
              {authMode === "phone" ? (
                <>
                  <label className="account-field"><span>{t("account.phoneLabel")}</span><KeyboardInput value={authPhone} onChange={(event) => setAuthPhone(event.target.value)} inputMode="tel" placeholder={t("account.phonePlaceholder")} /></label>
                  {phoneOtpSent && <label className="account-field"><span>{t("account.otpLabel")}</span><KeyboardInput value={authOtp} onChange={(event) => setAuthOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder={t("account.otpPlaceholder")} /></label>}
                </>
              ) : authMode === "new-password" ? (
                <label className="account-field"><span>{t("account.newPassword")}</span><KeyboardInput value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} type="password" placeholder={t("account.passwordPlaceholder")} /></label>
              ) : (
                <>
                  <label className="account-field"><span>{t("account.email")}</span><KeyboardInput value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} inputMode="email" autoCapitalize="none" placeholder="name@example.com" /></label>
                  {authMode !== "recover" && <label className="account-field"><span>{t(authMode === "signup" ? "account.setPassword" : "account.password")}</span><KeyboardInput value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} type="password" placeholder={t("account.passwordPlaceholder")} /></label>}
                </>
              )}
              {authMode === "signup" && <button className={`privacy-consent ${privacyAccepted ? "selected" : ""}`} onClick={() => { const next = !privacyAccepted; setPrivacyAccepted(next); localStorage.setItem(STORAGE_KEYS.privacyAccepted, next ? "1" : "0"); }}><span>{privacyAccepted ? <CheckIcon /> : null}</span><p>{t("account.consent")}</p></button>}
              <button className="account-primary" disabled={authBusy} onClick={submitAuth}>{authBusy ? t("common.processing") : t(authCopy.primary)}</button>
              {authMode === "signin" && <button className="auth-link" onClick={() => setAuthMode("recover")}>{t("account.forgot")}</button>}
              {(authMode === "recover" || authMode === "phone") && <button className="auth-link" onClick={() => { setAuthMode("signin"); setPhoneOtpSent(false); }}>{t("account.backToEmail")}</button>}
              {/* Only providers this deployment has actually configured are
                  offered: an unconfigured one leads straight into a failure. */}
              {authMode !== "recover" && authMode !== "new-password" && (phoneAuthEnabled || appleAuthEnabled) && (
                <>
                  <div className="auth-divider"><span>{t("account.otherMethods")}</span></div>
                  <div className="provider-grid">
                    {phoneAuthEnabled && <button onClick={() => setAuthMode("phone")}><span>☎</span> {t("account.phoneProvider")}</button>}
                    {appleAuthEnabled && <button onClick={signInWithApple}><span className="apple-mark">●</span> Apple</button>}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </BottomSheet>

      <BottomSheet open={memoryOpen} onOpenChange={(open) => (open ? setMemoryOpen(true) : closeMemory())} title={t(editingMemoryId ? "memory.editTitle" : "memory.newTitle")} description={t(editingMemoryId ? "memory.editDesc" : "memory.newDesc")}>
        <div className="memory-form">
          {!editingMemoryId && (
            <>
              <input ref={fileInputRef} className="hidden-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(event) => setMemoryFile(event.target.files?.[0] ?? null)} />
              <button className={`photo-picker ${memoryFile ? "selected" : ""}`} onClick={() => fileInputRef.current?.click()}><CameraIcon /><strong>{memoryFile ? memoryFile.name : t("memory.pickPhoto")}</strong><span>{memoryFile ? `${(memoryFile.size / 1024 / 1024).toFixed(1)} MB` : t("memory.pickHint")}</span></button>
            </>
          )}
          <label className="account-field"><span>{t("memory.story")}</span><KeyboardInput value={memoryCaption} maxLength={160} onChange={(event) => setMemoryCaption(event.target.value)} placeholder={t("memory.storyPlaceholder")} /></label>
          <label className="account-field"><span>{t("memory.date")}</span><KeyboardInput value={memoryDate} inputMode="numeric" maxLength={10} onChange={(event) => setMemoryDate(normalizeDateInput(event.target.value))} placeholder="YYYY-MM-DD" /></label>
          <button className="account-primary" disabled={cloudBusy} onClick={saveMemory}>{cloudBusy ? t("common.saving") : editingMemoryId ? t("common.saveEdits") : t("memory.save")}</button>
        </div>
      </BottomSheet>

      <BottomSheet open={Boolean(memoryDetail)} onOpenChange={(open) => !open && closeMemoryDetail()} title={t("memory.detailTitle")} description={memoryDetail ? t("memory.recordedOn", { date: memoryDetail.happenedOn }) : ""}>
        {memoryDetail && (
          <div className="memory-detail">
            {memoryDetail.imageUrl
              ? <img src={memoryDetail.imageUrl} alt={memoryDetail.caption} draggable="false" />
              : <div className="memory-detail-blank"><ImageIcon /><span>{t("memory.noPhoto")}</span></div>}
            <h3>{memoryDetail.caption}</h3>
            <p>{memoryDetail.happenedOn}</p>
            {memoryDetail.createdBy && authUser && memoryDetail.createdBy !== authUser.id ? (
              <p className="memory-detail-note">{t("memory.partnerOwned", { partner: partnerLabel })}</p>
            ) : confirmDelete === "memory" ? (
              <div className="delete-confirm">
                <strong>{t("common.deleteIrreversible")}</strong>
                <p>{t("memory.deleteBody", { partner: partnerLabel })}</p>
                <button className="account-danger" disabled={cloudBusy} onClick={() => deleteMemory(memoryDetail)}>{t(cloudBusy ? "common.deleting" : "common.confirmDelete")}</button>
                <button className="account-secondary" onClick={() => setConfirmDelete(null)}>{t("common.thinkAgain")}</button>
              </div>
            ) : (
              <div className="memory-detail-actions">
                <button className="account-secondary" onClick={() => openEditMemory(memoryDetail)}><Pencil1Icon /> {t("memory.editText")}</button>
                <button className="account-danger" onClick={() => setConfirmDelete("memory")}><TrashIcon /> {t("memory.delete")}</button>
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      <BottomSheet open={anniversaryOpen} onOpenChange={(open) => (open ? setAnniversaryOpen(true) : closeAnniversary())} title={t(editingAnniversaryId ? "annivSheet.manageTitle" : "annivSheet.addTitle")} description={t("annivSheet.desc")}>
        <div className="memory-form">
          <label className="account-field"><span>{t("annivSheet.name")}</span><KeyboardInput value={anniversaryTitle} maxLength={40} onChange={(event) => setAnniversaryTitle(event.target.value)} placeholder={t("annivSheet.namePlaceholder")} /></label>
          <label className="account-field"><span>{t("annivSheet.date")}</span><KeyboardInput value={anniversaryDate} inputMode="numeric" maxLength={10} onChange={(event) => setAnniversaryDate(normalizeDateInput(event.target.value))} placeholder="YYYY-MM-DD" /></label>
          <div className="option-field">
            <span>{t("annivSheet.repeat")}</span>
            <div className="option-row">
              <button className={anniversaryRepeats ? "active" : ""} onClick={() => setAnniversaryRepeats(true)}>{t("anniv.yearly")}</button>
              <button className={anniversaryRepeats ? "" : "active"} onClick={() => setAnniversaryRepeats(false)}>{t("anniv.once")}</button>
            </div>
          </div>
          <div className="option-field">
            <span>{t("annivSheet.remindAhead")}</span>
            <div className="option-row">
              {[0, 1, 3, 7].map((days) => (
                <button key={days} className={anniversaryReminder === days ? "active" : ""} onClick={() => setAnniversaryReminder(days)}>{days === 0 ? t("annivSheet.sameDay") : t("annivSheet.days", { days })}</button>
              ))}
            </div>
          </div>
          <div className="reminder-note"><BellIcon /><div><strong>{anniversaryReminder === 0 ? t("annivSheet.sameDayRemind") : t("annivSheet.aheadRemind", { days: anniversaryReminder })}</strong><p>{t("annivSheet.remindNote")}</p></div></div>
          {confirmDelete === "anniversary" ? (
            <div className="delete-confirm">
              <strong>{t("common.deleteIrreversible")}</strong>
              <p>{t("annivSheet.deleteBody", { title: anniversaryTitle.trim() || t("annivSheet.thisOne") })}</p>
              <button className="account-danger" disabled={cloudBusy} onClick={deleteAnniversary}>{t(cloudBusy ? "common.deleting" : "common.confirmDelete")}</button>
              <button className="account-secondary" onClick={() => setConfirmDelete(null)}>{t("common.thinkAgain")}</button>
            </div>
          ) : (
            <>
              <button className="account-primary" disabled={cloudBusy} onClick={saveAnniversary}>{cloudBusy ? t("common.saving") : editingAnniversaryId ? t("common.saveEdits") : t("annivSheet.save")}</button>
              {editingAnniversaryId && <button className="account-danger" onClick={() => setConfirmDelete("anniversary")}><TrashIcon /> {t("annivSheet.delete")}</button>}
            </>
          )}
        </div>
      </BottomSheet>

      <BottomSheet open={installHelpOpen} onOpenChange={setInstallHelpOpen} title={t("install.title")} description={t("install.desc")}>
        <div className="install-help">
          <ol>
            <li>{t("install.step1Pre")}<strong>{t("install.step1Em")}</strong>{t("install.step1Post")}</li>
            <li>{t("install.step2Pre")}<strong>{t("install.step2Em")}</strong>{t("install.step2Post")}</li>
            <li>{t("install.step3Pre")}<strong>{t("install.step3Em")}</strong>{t("install.step3Post")}</li>
            <li>{t("install.step4")}</li>
          </ol>
          <p>{t("install.note")}</p>
          <button className="account-primary" onClick={() => setInstallHelpOpen(false)}>{t("common.gotIt")}</button>
        </div>
      </BottomSheet>

      {inviteCode && inviteLink && (
        <InviteSheet
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          partnerName={partnerLabel}
          code={inviteCode}
          link={inviteLink}
          onShare={shareInvite}
          onCopyLink={copyInviteLink}
          onCopyCode={copyInviteCode}
        />
      )}
      <MoveSheet
        open={moveOpen}
        onOpenChange={setMoveOpen}
        account={authUser && !authUser.is_anonymous ? authUser.email ?? authUser.phone ?? null : null}
        onOpenAccount={() => { setMoveOpen(false); openAccount(); }}
      />
      <OnboardingSheet open={onboardingOpen} partnerName={partnerLabel} onFinish={finishOnboarding} />

      <BottomSheet open={privacyOpen} onOpenChange={(open) => { setPrivacyOpen(open); if (!open) setDangerConfirm(null); }} title={t(dangerConfirm === "leave" ? "privacy.leaveTitle" : dangerConfirm === "delete" ? "privacy.deleteTitle" : "privacy.title")} description={t("privacy.desc")}>
        <div className="privacy-sheet">
          {dangerConfirm ? (
            <div className="danger-confirm"><span><TrashIcon /></span><h3>{t(dangerConfirm === "leave" ? "privacy.leaveHead" : "privacy.deleteHead")}</h3><p>{t(dangerConfirm === "leave" ? "privacy.leaveBody" : "privacy.deleteBody")}</p><button className="danger-final" disabled={cloudBusy} onClick={confirmDangerAction}>{cloudBusy ? t("common.working") : t(dangerConfirm === "leave" ? "privacy.leaveConfirm" : "privacy.deleteConfirm")}</button><button className="account-secondary" onClick={() => setDangerConfirm(null)}>{t("common.thinkAgain")}</button></div>
          ) : (
            <>
              <div className="privacy-section"><span><LockClosedIcon /></span><div><strong>{t("privacy.storeTitle")}</strong><p>{t("privacy.storeBody")}</p></div></div>
              <div className="privacy-section"><span><ReaderIcon /></span><div><strong>{t("privacy.useTitle")}</strong><p>{t("privacy.useBody")}</p></div></div>
              <div className="privacy-section"><span><DownloadIcon /></span><div><strong>{t("privacy.rightsTitle")}</strong><p>{t("privacy.rightsBody")}</p></div></div>
              <div className="security-grid"><div><strong>{t("privacy.rateLimit")}</strong><span>{t("privacy.rateLimitDetail")}</span></div><div><strong>{t("privacy.audit")}</strong><span>{t("privacy.auditDetail")}</span></div><div><strong>{t("privacy.export")}</strong><span>{t("privacy.exportDetail")}</span></div></div>
              <div className="legal-links"><button onClick={() => window.open("/privacy.html", "_blank", "noopener,noreferrer")}>{t("privacy.fullPolicy")}</button><button onClick={() => window.open("/terms.html", "_blank", "noopener,noreferrer")}>{t("privacy.fullTerms")}</button></div>
              <button className="account-secondary" onClick={exportData}><DownloadIcon /> {t("privacy.exportMine")}</button>
              {authUser && !authUser.is_anonymous && <button className="account-danger" onClick={() => setDangerConfirm("delete")}><TrashIcon /> {t("account.delete")}</button>}
            </>
          )}
        </div>
      </BottomSheet>

      <div className="toast-region" role="status" aria-live="polite">
        {toast && <div className="toast"><CheckCircledIcon />{toast}</div>}
      </div>
    </div>
  );
}

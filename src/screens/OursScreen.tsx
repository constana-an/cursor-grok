import { BellIcon, CardStackIcon, DownloadIcon, GearIcon, GlobeIcon, LinkBreak2Icon, LockClosedIcon, MobileIcon, PaperPlaneIcon, PersonIcon, ReaderIcon, UpdateIcon } from "@radix-ui/react-icons";
import type { User } from "@supabase/supabase-js";
import { KeyboardInput } from "../shell";
import { cleanCodeInput } from "../lib/pairing";
import { formatStartedOn, relationshipDays } from "../lib/date";
import { LANG_LABEL } from "../lib/i18n";
import { appleAuthEnabled, cloudEnabled, membershipEnabled, phoneAuthEnabled } from "../lib/supabase";
import { displayNameFor } from "../lib/types";
import { useI18n } from "../i18n";
import type { CoupleProfile, Identity, MembershipState } from "../lib/types";

export function OursScreen({
  identity,
  partnerName,
  onSwitchIdentity,
  push,
  onEnableNotifications,
  cloudCoupleId,
  inviteCode,
  onOpenInvite,
  onOpenMove,
  syncDetail,
  realtime,
  onSyncNow,
  pairingCode,
  setPairingCode,
  cloudBusy,
  onCreateSpace,
  onJoinSpace,
  profile,
  onOpenSettings,
  authUser,
  onOpenAccount,
  membership,
  onExport,
  onLeaveCouple,
  onOpenPrivacy,
}: {
  identity: Identity;
  partnerName: string;
  onSwitchIdentity: () => void;
  /** Permission alone proves nothing; only a live subscription can be pushed to. */
  push: { permission: NotificationPermission | "unsupported"; subscribed: boolean };
  onEnableNotifications: () => void;
  cloudCoupleId: string | null;
  /** The couple's real invite code; null until a space has actually been created or joined. */
  inviteCode: string | null;
  onOpenInvite: () => void;
  onOpenMove: () => void;
  /** How stale the cloud copy is, already in words. */
  syncDetail: string;
  realtime: "connecting" | "live" | "dropped";
  onSyncNow: () => void;
  pairingCode: string;
  setPairingCode: (value: string) => void;
  cloudBusy: boolean;
  onCreateSpace: () => void;
  onJoinSpace: () => void;
  profile: CoupleProfile;
  onOpenSettings: () => void;
  authUser: User | null;
  onOpenAccount: () => void;
  membership: MembershipState;
  onExport: () => void;
  onLeaveCouple: () => void;
  onOpenPrivacy: () => void;
}) {
  const { lang, setLang, t } = useI18n();
  const currentName = displayNameFor(profile, identity);
  const days = relationshipDays(profile.startedOn);
  const protectedAccount = Boolean(authUser && !authUser.is_anonymous);
  // Name only the providers this deployment can actually serve; the sheet
  // itself already hides the rest, and the two must not disagree.
  const signInMethods = t("ours.signInMethods", {
    methods: [t("ours.methodEmail"), phoneAuthEnabled ? t("ours.methodPhone") : null, appleAuthEnabled ? "Apple" : null]
      .filter(Boolean).join(t("ours.methodSeparator")),
  });
  // The language switch is one tap, and the state chip names where the tap
  // leads rather than where you already are — otherwise it reads as a label.
  const otherLang = lang === "zh" ? "en" : "zh";
  // Four states, because "allowed" and "will actually arrive" are different
  // things — and the gap between them is where the old copy lied.
  const pushNotice = push.permission !== "granted"
    ? { state: t("ours.pushGo"), detail: t("ours.pushGoDetail") }
    : push.subscribed
      ? { state: t("ours.pushOn"), detail: t("ours.pushOnDetail") }
      : cloudCoupleId
        ? { state: t("ours.pushIncomplete"), detail: t("ours.pushIncompleteDetail") }
        : { state: t("ours.pushLocal"), detail: t("ours.pushLocalDetail") };
  return (
    <section className="page-section ours-page">
      <div className="couple-card"><div className="large-avatar">{profile.firstName.slice(0, 1)}</div><div><span>{profile.shopName}</span><h2>{profile.firstName} & {profile.secondName}</h2><p>{t("ours.daysTogether", { days, date: formatStartedOn(profile.startedOn, lang) })}</p></div><div className="large-avatar partner">{profile.secondName.slice(0, 1)}</div></div>
      <button className="setting-row" onClick={onSwitchIdentity}><span className="setting-icon identity"><PersonIcon /></span><span><strong>{t("ours.currentIdentity", { name: currentName })}</strong><small>{t("ours.otherPhone", { partner: partnerName })}</small></span><span className="setting-state">{t("ours.switch")}</span></button>
      <button className="setting-row" onClick={onOpenAccount}><span className="setting-icon account"><LockClosedIcon /></span><span><strong>{authUser?.is_anonymous ? t("ours.upgradeTrial") : authUser?.email ?? authUser?.phone ?? t("ours.signInOrUp")}</strong><small>{protectedAccount ? t("ours.accountProtectedHint") : signInMethods}</small></span><span className={`setting-state ${protectedAccount ? "on" : ""}`}>{protectedAccount ? t("ours.protected") : t("ours.goSignIn")}</span></button>
      {push.permission !== "unsupported" && (
        <button className="setting-row" onClick={onEnableNotifications}>
          <span className="setting-icon pink"><BellIcon /></span>
          <span><strong>{t("ours.push")}</strong><small>{pushNotice.detail}</small></span>
          <span className={`setting-state ${push.subscribed ? "on" : ""}`}>{pushNotice.state}</span>
        </button>
      )}
      {/* Push has no email or SMS fallback to offer, so this says what does
          happen instead rather than leaving the gap unexplained. */}
      {!push.subscribed && <p className="settings-note">{t("ours.pushFallback")}</p>}
      {inviteCode && (
        <button className="setting-row" onClick={onOpenInvite}><span className="setting-icon mint"><PaperPlaneIcon /></span><span><strong>{t("ours.invite")}</strong><small>{t("ours.inviteDetail", { code: inviteCode })}</small></span><span className="setting-state">{t("ours.inviteState")}</span></button>
      )}
      <button className="setting-row" onClick={onOpenSettings}><span className="setting-icon gold"><GearIcon /></span><span><strong>{t("ours.settings")}</strong><small>{t("ours.settingsDetail")}</small></span><span className="setting-state">{t("ours.settingsState")}</span></button>
      <button className="setting-row" onClick={() => setLang(otherLang)}><span className="setting-icon account"><GlobeIcon /></span><span><strong>{t("ours.language")}</strong><small>{t("ours.languageDetail")}</small></span><span className="setting-state">{LANG_LABEL[otherLang]}</span></button>
      {/* The paid tier has no payment channel yet, so during the test period the
          entitlement row would only lead back to the account sheet. */}
      {membershipEnabled && (
        <button className="setting-row" onClick={onOpenAccount}><span className="setting-icon membership"><CardStackIcon /></span><span><strong>{membership.planName ?? t("ours.planBasic")}</strong><small>{membership.status === "active" ? t("ours.membershipOk") : t("ours.membershipIssue")}</small></span><span className="setting-state">{t("ours.membershipState")}</span></button>
      )}
      <button className="setting-row" onClick={onOpenMove}><span className="setting-icon identity"><MobileIcon /></span><span><strong>{t("ours.newPhone")}</strong><small>{t("ours.newPhoneDetail")}</small></span><span className="setting-state">{t("ours.newPhoneState")}</span></button>
      <button className="setting-row" onClick={onExport}><span className="setting-icon mint"><DownloadIcon /></span><span><strong>{t("ours.export")}</strong><small>{t("ours.exportDetail")}</small></span><span className="setting-state">{t("ours.exportState")}</span></button>
      <button className="setting-row" onClick={onOpenPrivacy}><span className="setting-icon identity"><ReaderIcon /></span><span><strong>{t("ours.privacy")}</strong><small>{t("ours.privacyDetail")}</small></span><span className="setting-state">{t("ours.view")}</span></button>
      {cloudCoupleId && <button className="setting-row danger-row" onClick={onLeaveCouple}><span className="setting-icon danger"><LinkBreak2Icon /></span><span><strong>{t("ours.unpair")}</strong><small>{t("ours.unpairDetail")}</small></span><span className="setting-state">{t("ours.unpairState")}</span></button>}
      {cloudEnabled && !cloudCoupleId && (
        <div className="pair-card">
          <div><strong>{t("ours.pairTitle")}</strong><p>{t("ours.pairBody")}</p></div>
          <button className="create-space" disabled={cloudBusy} onClick={onCreateSpace}>{cloudBusy ? t("ours.connecting") : t("ours.createShop")}</button>
          <span className="pair-divider">{t("ours.orEnterCode")}</span>
          <div className="pair-input-row"><KeyboardInput value={pairingCode} onChange={(event) => setPairingCode(cleanCodeInput(event.target.value))} inputMode="numeric" placeholder={t("ours.codePlaceholder")} /><button disabled={cloudBusy || pairingCode.length < 6} onClick={onJoinSpace}>{t("ours.join")}</button></div>
        </div>
      )}
      <div className="cloud-state">
        <span className={`cloud-dot ${cloudCoupleId && realtime === "live" ? "online" : cloudCoupleId && realtime === "dropped" ? "dropped" : ""}`.trim()} />
        <div>
          <strong>{cloudCoupleId ? (realtime === "dropped" ? t("sync.dropped") : t("ours.cloudOn")) : cloudEnabled ? t("ours.cloudWaiting") : t("ours.cloudLocal")}</strong>
          <p>{cloudCoupleId ? syncDetail : cloudEnabled ? t("ours.cloudWaitingDetail") : t("ours.cloudLocalDetail")}</p>
        </div>
        {cloudCoupleId && (
          <button className="cloud-retry" onClick={onSyncNow} aria-label={t("sync.ariaRetry")}><UpdateIcon /></button>
        )}
      </div>
    </section>
  );
}

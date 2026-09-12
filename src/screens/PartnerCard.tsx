import { CheckCircledIcon, MoonIcon, SunIcon } from "@radix-ui/react-icons";
import { WEEKLY_PERSONAL_GOAL } from "../lib/catalog";
import { localizedPersonName } from "../lib/storage";
import { useI18n } from "../i18n";
import type { PartnerStatus } from "../lib/types";

/**
 * Everything else in this app is single-player: your wallet, your tasks, your
 * streak. This is the one place the other person shows up while they are not
 * ordering anything — so the shop reads as something two people keep, rather
 * than two apps that happen to share a menu.
 *
 * It never shows a balance. Wallets are private and the server-side function
 * this renders does not return one.
 */
export function PartnerCard({ status }: { status: PartnerStatus | null }) {
  const { lang, t } = useI18n();
  if (!status) return null;
  const name = localizedPersonName(status.displayName, lang);
  const progress = Math.min(100, Math.round((status.earnedThisWeek / WEEKLY_PERSONAL_GOAL) * 100));
  return (
    <section className="partner-card" aria-label={t("partner.aria", { name })}>
      <div className="partner-head">
        <span className="partner-avatar">{name.slice(0, 1)}</span>
        <div>
          <strong>{t("partner.thisWeek", { name })}</strong>
          <small>
            {status.checkedToday ? t("partner.visited") : t("partner.notVisited")}
            {status.streak > 0 && t("partner.streak", { days: status.streak })}
          </small>
        </div>
        <span className={`partner-today ${status.checkedToday ? "is-on" : ""}`}>
          {status.checkedToday ? <SunIcon /> : <MoonIcon />}
        </span>
      </div>
      <div className="partner-progress" aria-label={t("partner.progressAria", { name, percent: progress })}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="partner-foot">
        <span><CheckCircledIcon /> {t("partner.earned", { coins: status.earnedThisWeek })}</span>
        <span>{status.earnedThisWeek} / {WEEKLY_PERSONAL_GOAL}</span>
      </div>
    </section>
  );
}

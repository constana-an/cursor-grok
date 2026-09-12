import { HeartFilledIcon } from "@radix-ui/react-icons";
import { BottomSheet } from "../shell";
import { MENU, TASKS } from "../lib/catalog";
import { OPENING_BALANCE } from "../lib/storage";
import { cloudEnabled } from "../lib/supabase";
import { useI18n } from "../i18n";

const CHEAPEST = Math.min(...MENU.map((item) => item.price));
const DEAREST = Math.max(...MENU.map((item) => item.price));
const DAILY_REWARD = TASKS.filter((task) => task.frequency === "daily").reduce((sum, task) => sum + task.reward, 0);

/** What `public.grant_pairing_bonus` credits each partner the first time they pair. */
export const PAIRING_BONUS = 20;

/**
 * One screen, not three. The opening checklist on the shop page already walks
 * people through account → pairing → notifications → first wish, so a stepped
 * guide covering the same ground meant sitting through two onboardings to
 * arrive at the same place.
 *
 * What the checklist cannot explain is why a wallet holding 8 coins is looking
 * at a menu starting at 28 — so that is what this keeps, with the arithmetic
 * the pairing bonus actually produces rather than the pre-bonus "三四天".
 */
export function OnboardingSheet({
  open,
  partnerName,
  onFinish,
}: {
  open: boolean;
  partnerName: string;
  /** `goToTasks` sends the reader straight to their first claimable task. */
  onFinish: (goToTasks: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => !next && onFinish(false)}
      title={t("onboard.title")}
      description={t("onboard.desc", { partner: partnerName })}
      snap={0.62}
    >
      <div className="onboarding-sheet">
        <div className="onboarding-step">
          <span className="onboarding-icon"><HeartFilledIcon /></span>
          <h3>{t("onboard.menuLine", { count: MENU.length, cheapest: CHEAPEST, dearest: DEAREST })}</h3>
          <p>{t("onboard.body", { partner: partnerName })}</p>
        </div>
        <div className="onboarding-note">
          <strong>{t("onboard.coinsFrom")}</strong>
          {cloudEnabled ? (
            <p>{t("onboard.coinsCloud", { opening: OPENING_BALANCE, partner: partnerName, bonus: PAIRING_BONUS, total: OPENING_BALANCE + PAIRING_BONUS, daily: DAILY_REWARD })}</p>
          ) : (
            <p>{t("onboard.coinsLocal", { opening: OPENING_BALANCE, cheapest: CHEAPEST, daily: DAILY_REWARD })}</p>
          )}
        </div>
        <button className="account-primary" onClick={() => onFinish(true)}>{t("onboard.goTasks")}</button>
        <button className="auth-link" onClick={() => onFinish(false)}>{t("onboard.browse")}</button>
      </div>
    </BottomSheet>
  );
}

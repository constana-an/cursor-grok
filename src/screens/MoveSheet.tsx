import { CheckIcon, LockClosedIcon, MobileIcon } from "@radix-ui/react-icons";
import { BottomSheet } from "../shell";
import { useI18n } from "../i18n";

/**
 * What to do when the phone changes.
 *
 * Nothing here is new machinery: signing in already restores the couple, the
 * invite code and which side this person is, because all three live on their
 * profile row rather than in this handset's storage. What was missing was
 * anybody saying so — a couple whose shop holds a year of orders should not
 * have to guess whether a new phone means starting again.
 */
export function MoveSheet({
  open,
  onOpenChange,
  account,
  onOpenAccount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The email or phone the shop is attached to, or null when there is none. */
  account: string | null;
  onOpenAccount: () => void;
}) {
  const { t } = useI18n();
  const steps: string[] = [
    t("move.step1"),
    t("move.step2", { account: account ?? "—" }),
    t("move.step3"),
    t("move.step4"),
  ];
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("move.title")}
      description={t("move.desc")}
      snap={0.62}
    >
      <div className="move-sheet">
        {account ? (
          <ol className="move-steps">
            {steps.map((step, index) => (
              <li key={step}>
                <span className="move-step-number">{index === steps.length - 1 ? <CheckIcon /> : index + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="move-warning">
            <span className="move-warning-icon"><LockClosedIcon /></span>
            <p>{t("move.noAccount")}</p>
            <button className="account-primary" onClick={onOpenAccount}><MobileIcon /> {t("move.goAccount")}</button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}

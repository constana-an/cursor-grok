import { CopyIcon, PaperPlaneIcon } from "@radix-ui/react-icons";
import { BottomSheet } from "../shell";
import { useI18n } from "../i18n";
import { QrCode } from "./QrCode";

/**
 * The invitation, as something you can actually send.
 *
 * Pairing used to be: create the shop, read six digits out loud, have the other
 * person find the Us page and type them in. Two people who are already texting
 * each other should not have to do that, so the link is first — it goes through
 * whatever they already talk in, and opening it lands on the pairing page with
 * the code filled in. The QR is for when they are in the same room, and the six
 * digits stay for when neither works.
 */
export function InviteSheet({
  open,
  onOpenChange,
  partnerName,
  code,
  link,
  onShare,
  onCopyLink,
  onCopyCode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partnerName: string;
  code: string;
  /** The `?join=` URL this shop is reachable at. */
  link: string;
  onShare: () => void;
  onCopyLink: () => void;
  onCopyCode: () => void;
}) {
  const { t } = useI18n();
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("invite.title", { partner: partnerName })}
      description={t("invite.desc")}
      snap={0.78}
    >
      <div className="invite-sheet">
        <div className="invite-qr-frame">
          <QrCode value={link} label={t("invite.qrLabel")} />
        </div>
        <p className="invite-scan-hint">{t("invite.scanHint")}</p>

        <button className="account-primary" onClick={onShare}><PaperPlaneIcon /> {t("invite.share")}</button>
        <button className="invite-secondary" onClick={onCopyLink}><CopyIcon /> {t("invite.copyLink")}</button>

        <div className="invite-code-row">
          <div>
            <small>{t("invite.codeLabel")}</small>
            <strong>{code}</strong>
          </div>
          <button onClick={onCopyCode} aria-label={t("invite.copyCode")}><CopyIcon /></button>
        </div>
        <p className="invite-scan-hint">{t("invite.manual")}</p>
      </div>
    </BottomSheet>
  );
}

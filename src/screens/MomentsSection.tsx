import { BellIcon, CalendarIcon, ClockIcon, HeartFilledIcon } from "@radix-ui/react-icons";
import { localizedItem, localizedItemName } from "../lib/catalog";
import { relativeTime } from "../lib/date";
import { localizedPersonName } from "../lib/storage";
import type { TKey } from "../lib/i18n";
import { WAITING_HOURS, type Moment, type TimeSlot } from "../lib/moments";
import type { MenuItem } from "../lib/types";
import { useI18n } from "../i18n";
import { MenuArt } from "./MenuArt";

/**
 * 此刻 — the top of the shop page.
 *
 * What used to be here was a category rail and forty cards, which asked the
 * same question on every open: pick something. Most of the time the answer is
 * not a purchase. It is that they sent a wish this morning and nobody replied,
 * or that something was promised and not done, or that an anniversary is in
 * three days.
 *
 * `buildMoments` decides what belongs here and in what order; this file only
 * says it out loud. At most two cards ever appear — a third would turn the one
 * thing to do now back into a list to choose from.
 */

const SLOT_TITLE: Record<TimeSlot, TKey> = {
  morning: "moment.slotMorning",
  midday: "moment.slotMidday",
  afternoon: "moment.slotAfternoon",
  evening: "moment.slotEvening",
  night: "moment.slotNight",
};

export function MomentsSection({
  moments,
  partnerName,
  onOpenOrders,
  onPlanDate,
  onOrder,
  onEarn,
}: {
  moments: Moment[];
  /** The other person's display name — every card is about the two of them. */
  partnerName: string;
  onOpenOrders: (orderId: string) => void;
  onPlanDate: () => void;
  onOrder: (item: MenuItem) => void;
  onEarn: () => void;
}) {
  const { lang, t } = useI18n();
  if (moments.length === 0) return null;

  return (
    <section className="moments" aria-label={t("moment.aria")}>
      {moments.map((moment) => {
        if (moment.kind === "answer") {
          const name = localizedItemName(moment.order, lang);
          // Past half a day the card stops saying when it arrived and starts
          // saying how long it has been waiting, which is the honest framing.
          const waited = moment.waitedHours >= WAITING_HOURS;
          return (
            <article className="moment-card is-answer" key={moment.id}>
              <span className="moment-icon"><BellIcon /></span>
              <div className="moment-copy">
                <span className="moment-tag">{t("moment.tagAnswer")}</span>
                <strong>{t("moment.answerTitle", { partner: localizedPersonName(moment.order.from, lang), item: name })}</strong>
                <small>
                  {waited
                    ? t("moment.answerWaiting", { hours: moment.waitedHours })
                    : t("moment.answerBody", { time: relativeTime(moment.order.createdAt, lang) })}
                  {moment.count > 1 && ` · ${t("moment.answerMore", { count: moment.count - 1 })}`}
                </small>
              </div>
              <button className="moment-cta" onClick={() => onOpenOrders(moment.order.id)}>{t("moment.answerCta")}</button>
            </article>
          );
        }

        if (moment.kind === "promised") {
          const name = localizedItemName(moment.order, lang);
          return (
            <article className="moment-card is-promised" key={moment.id}>
              <span className="moment-icon"><ClockIcon /></span>
              <div className="moment-copy">
                <span className="moment-tag">{t("moment.tagPromised")}</span>
                <strong>{t("moment.promisedTitle", { item: name })}</strong>
                <small>
                  {t("moment.promisedBody", { partner: partnerName })}
                  {moment.count > 1 && ` · ${t("moment.promisedMore", { count: moment.count - 1 })}`}
                </small>
              </div>
              <button className="moment-cta" onClick={() => onOpenOrders(moment.order.id)}>{t("moment.promisedCta")}</button>
            </article>
          );
        }

        if (moment.kind === "anniversary") {
          return (
            <article className="moment-card is-anniversary" key={moment.id}>
              <span className="moment-icon"><CalendarIcon /></span>
              <div className="moment-copy">
                <span className="moment-tag">{t("moment.tagAnniversary")}</span>
                <strong>
                  {moment.days === 0
                    ? t("moment.annivToday", { title: moment.anniversary.title })
                    : t("moment.annivTitle", { title: moment.anniversary.title, days: moment.days })}
                </strong>
                <small>{t("moment.annivBody")}</small>
              </div>
              <button className="moment-cta" onClick={onPlanDate}>{t("moment.annivCta")}</button>
            </article>
          );
        }

        const copy = localizedItem(moment.item, lang);
        return (
          <article className="moment-card is-timely" key={moment.id}>
            <span className="moment-art" style={{ background: moment.item.tint }}><MenuArt item={moment.item} /></span>
            <div className="moment-copy">
              <span className="moment-tag">{t(SLOT_TITLE[moment.slot])}</span>
              <strong>{copy.name}</strong>
              <small>
                {moment.affordable
                  ? copy.description
                  : <span className="price-short">{t("shop.short", { count: moment.short })}</span>}
              </small>
            </div>
            {moment.affordable
              ? <button className="moment-cta" onClick={() => onOrder(moment.item)}><HeartFilledIcon /> {moment.item.price}</button>
              : <button className="moment-cta is-quiet" onClick={onEarn}>{t("app.earnCoins")}</button>}
          </article>
        );
      })}
    </section>
  );
}

import { useState } from "react";
import { CalendarIcon, CameraIcon, HeartFilledIcon, ImageIcon, LockClosedIcon, Pencil1Icon, PlusIcon, StarFilledIcon, SunIcon } from "@radix-ui/react-icons";
import { dayKeyOf, daysUntilAnniversary, formatMonthKey, formatStartedOn, isPastOneOff, monthKeyOf, relationshipDays, thisMonthKey } from "../lib/date";
import { localizedItemName, localizedMilestone, milestoneUnitOf, nextMilestone, reachedMilestones } from "../lib/catalog";
import { localeOf, type Lang } from "../lib/i18n";
import { localizedPersonName } from "../lib/storage";
import { cloudEnabled } from "../lib/supabase";
import { useI18n } from "../i18n";
import { MenuArt } from "./MenuArt";
import type { Anniversary, CheckinStatus, CoupleProfile, MemoryEntry, Order } from "../lib/types";

const isPast = (item: Anniversary) => isPastOneOff(item.eventDate, item.repeatsYearly);

/** How many finished wishes to show before asking, and per tap after that. */
const TIMELINE_PAGE = 20;

/** Past one-offs sink to the bottom instead of masquerading as "today". */
const countdownOrder = (item: Anniversary) => (isPast(item) ? Number.MAX_SAFE_INTEGER : daysUntilAnniversary(item.eventDate, item.repeatsYearly));

/** The stat tile is one line wide, so English gets digits rather than a month name. */
const compactStartDate = (startedOn: string, lang: Lang): string => (lang === "en"
  ? startedOn.replace(/-/g, ".")
  : formatStartedOn(startedOn).replace(/ 年 | 月 | 日/g, ".").replace(/\.$/, ""));

export function MemoriesScreen({
  orders,
  profile,
  memories,
  anniversaries,
  checkin,
  onCheckin,
  onAddMemory,
  onOpenMemory,
  onAddAnniversary,
  onEditAnniversary,
  paired,
  onPair,
  onPlanDate,
  onWriteWish,
}: {
  orders: Order[];
  profile: CoupleProfile;
  memories: MemoryEntry[];
  anniversaries: Anniversary[];
  checkin: CheckinStatus;
  onCheckin: () => void;
  onAddMemory: () => void;
  onOpenMemory: (memory: MemoryEntry) => void;
  onAddAnniversary: () => void;
  onEditAnniversary: (anniversary: Anniversary) => void;
  /** Photos need the couple's private bucket; everything else works offline. */
  paired: boolean;
  onPair: () => void;
  onPlanDate: () => void;
  onWriteWish: () => void;
}) {
  const { lang, t } = useI18n();
  const [timelineLimit, setTimelineLimit] = useState(TIMELINE_PAGE);
  const [historyOpen, setHistoryOpen] = useState(false);
  const done = orders.filter((order) => order.status === "done");
  // The hero counts this calendar month; the all-time total gets its own tile so
  // the two numbers can never be mistaken for each other.
  const month = thisMonthKey();
  // A wish ordered last month but finished today belongs to this month.
  const doneThisMonth = done.filter((order) => monthKeyOf(order.completedAt ?? order.createdAt) === month);
  const days = relationshipDays(profile.startedOn);
  const monthLabel = new Intl.DateTimeFormat(localeOf(lang), { month: "long" }).format(new Date());
  const anniversaryHint = (item: Anniversary): string => {
    if (isPast(item)) return t("anniv.past");
    const until = daysUntilAnniversary(item.eventDate, item.repeatsYearly);
    return until === 0 ? t("anniv.today") : t("anniv.daysLeft", { days: until });
  };
  const sortedAnniversaries = [...anniversaries].sort((a, b) => countdownOrder(a) - countdownOrder(b));
  const nextAnniversary = sortedAnniversaries[0];
  const startedLabel = compactStartDate(profile.startedOn, lang);
  // The counters in stats-row have always been inert. These give them a place
  // to have arrived at, and a place to be heading.
  const counts = { days, wishes: done.length, streak: checkin.streak };
  const reached = reachedMilestones(counts);
  // Headline is the last one the catalogue lists, not the most recently earned:
  // days, wishes and streaks cross their thresholds on their own schedules and
  // nothing records when. The history below is the complete answer.
  const headline = reached[reached.length - 1] ?? null;
  const headlineCopy = headline ? localizedMilestone(headline, lang) : null;
  const upcoming = nextMilestone(counts);
  // Finished wishes are the couple's own history and need no curation: newest
  // first, straight from the order list. The album on top is for the photos
  // they choose to add on purpose.
  //
  // Nothing is dropped. This used to keep the newest 20 and silently discard
  // the rest, which quietly deletes the early months of a relationship from a
  // section calling itself 我们的时间线. Older entries are behind a button
  // instead.
  const ordered = [...done].sort((a, b) =>
    (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt));
  const visible = ordered.slice(0, timelineLimit);
  const remaining = ordered.length - visible.length;
  const months: Array<{ key: string; orders: Order[] }> = [];
  for (const order of visible) {
    const key = monthKeyOf(order.completedAt ?? order.createdAt) ?? thisMonthKey();
    const last = months[months.length - 1];
    if (last?.key === key) last.orders.push(order);
    else months.push({ key, orders: [order] });
  }
  return (
    <section className="page-section memory-page">
      <div className="memory-hero"><span>{t("memories.heroTag", { month: monthLabel })}</span><strong>{doneThisMonth.length}</strong><p>{t("memories.heroBody")}</p><div className="avatar-pair"><span>{profile.firstName.slice(0, 1)}</span><span>{profile.secondName.slice(0, 1)}</span></div></div>
      <div className="stats-row"><div><HeartFilledIcon /><strong>{days}</strong><span>{t("memories.statDays")}</span></div><div><StarFilledIcon /><strong>{done.length}</strong><span>{t("memories.statDone")}</span></div><div><CalendarIcon /><strong>{startedLabel}</strong><span>{t("memories.statStart")}</span></div></div>
      {(headlineCopy || upcoming) && (
        <section className="milestone-card" aria-label={t("memories.milestoneAria")}>
          <div className="milestone-reached">
            <span className="milestone-badge"><StarFilledIcon /></span>
            {headlineCopy
              ? <div><strong>{headlineCopy.title}</strong><p>{headlineCopy.body}</p></div>
              : <div><strong>{t("memories.noMilestone")}</strong><p>{t("memories.noMilestoneBody")}</p></div>}
          </div>
          {upcoming && (
            <p className="milestone-next">
              {t("memories.nextMilestone", {
                remaining: upcoming.remaining,
                unit: milestoneUnitOf(lang, upcoming.milestone.kind, upcoming.remaining),
                title: localizedMilestone(upcoming.milestone, lang).title,
              })}
            </p>
          )}
          {/* The celebration toast is gone in two seconds and the card only
              keeps the newest one, so everything earned before today had
              nowhere to be looked at. */}
          {reached.length > 1 && (
            <>
              <button className="milestone-toggle" aria-expanded={historyOpen} onClick={() => setHistoryOpen((open) => !open)}>
                {historyOpen ? t("common.collapse") : t("memories.milestoneHistory", { count: reached.length })}
              </button>
              {historyOpen && (
                <ol className="milestone-history">
                  {[...reached].reverse().map((milestone) => {
                    const copy = localizedMilestone(milestone, lang);
                    return (
                      <li key={milestone.id}>
                        <strong>{copy.title}</strong>
                        <p>{copy.body}</p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
        </section>
      )}
      <div className="checkin-card">
        <span className="checkin-flame"><SunIcon /></span>
        <div><small>{t("memories.streak")}</small><strong>{t("memories.streakDays", { days: checkin.streak })}</strong><p>{t("memories.checkinHint")}</p></div>
        <button disabled={checkin.checkedToday} onClick={onCheckin}>{checkin.checkedToday ? t("memories.checkedToday") : t("memories.checkin")}</button>
      </div>
      <div className="memory-section-heading">
        <div><small>{t("memories.photoTag")}</small><h3>{t("memories.photoTitle")}</h3></div>
        {paired && <button onClick={onAddMemory}><CameraIcon /> {t("common.add")}</button>}
      </div>
      {!paired ? (
        // Photos live in the couple's private bucket. Offering the picker here
        // would only lead to a "请先登录" toast, so say why instead.
        <div className="locked-section">
          <span><LockClosedIcon /></span>
          {cloudEnabled ? (
            <>
              <strong>{t("memories.photoLocked")}</strong>
              <p>{t("memories.photoLockedBody")}</p>
              <button onClick={onPair}>{t("memories.goPair")}</button>
            </>
          ) : (
            <>
              <strong>{t("memories.localNoAlbum")}</strong>
              <p>{t("memories.localNoAlbumBody")}</p>
            </>
          )}
        </div>
      ) : memories.length > 0 ? (
        <div className="memory-grid">
          {memories.map((memory) => (
            <button type="button" key={memory.id} onClick={() => onOpenMemory(memory)} aria-label={t("memories.viewAria", { caption: memory.caption })}>
              {memory.imageUrl ? <img src={memory.imageUrl} alt={memory.caption} draggable="false" /> : <span><ImageIcon /></span>}
              <div><strong>{memory.caption}</strong><small>{memory.happenedOn}</small></div>
            </button>
          ))}
        </div>
      ) : (
        <button className="memory-empty" onClick={onAddMemory}><CameraIcon /><strong>{t("memories.firstPhoto")}</strong><span>{t("memories.firstPhotoHint")}</span></button>
      )}
      <div className="memory-section-heading"><div><small>{t("memories.annivTag")}</small><h3>{t("memories.annivTitle")}</h3></div><button onClick={onAddAnniversary}><PlusIcon /> {t("common.add")}</button></div>
      {nextAnniversary ? (
        <>
          <div className="anniversary-card">
            <div><span><CalendarIcon /></span><div><small>{t("memories.nextAnniv")}</small><strong>{nextAnniversary.title}</strong><p>{nextAnniversary.eventDate} · {anniversaryHint(nextAnniversary)}</p></div></div>
            <button onClick={() => onEditAnniversary(nextAnniversary)}>{t("memories.manage")}</button>
          </div>
          {/* Once it is close enough to be reminded about, the useful thing is
              not another reminder — it is somewhere to start. */}
          {daysUntilAnniversary(nextAnniversary.eventDate, nextAnniversary.repeatsYearly) <= nextAnniversary.reminderDays && (
            <div className="anniversary-ideas">
              <strong>{t("memories.annivIdeas", { title: nextAnniversary.title })}</strong>
              <div className="anniversary-idea-row">
                <button onClick={onPlanDate}>{t("memories.ideaDate")}</button>
                <button onClick={onWriteWish}>{t("memories.ideaWish")}</button>
                <button onClick={paired ? onAddMemory : onPair}>{t("memories.ideaPhoto")}</button>
              </div>
            </div>
          )}
          <div className="anniversary-list">
            {sortedAnniversaries.map((item) => (
              <button type="button" key={item.id} onClick={() => onEditAnniversary(item)} aria-label={t("memories.editAnnivAria", { title: item.title })}>
                <span className="anniversary-count">
                  {isPast(item) ? <small>{t("memories.past")}</small> : <><strong>{daysUntilAnniversary(item.eventDate, item.repeatsYearly)}</strong><small>{t("memories.dayUnit", { days: daysUntilAnniversary(item.eventDate, item.repeatsYearly) })}</small></>}
                </span>
                <span className="anniversary-info">
                  <strong>{item.title}</strong>
                  <small>{t("memories.annivMeta", { date: item.eventDate, repeat: item.repeatsYearly ? t("anniv.yearly") : t("anniv.once"), days: item.reminderDays })}</small>
                </span>
                <span className="anniversary-edit"><Pencil1Icon /></span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <button className="memory-empty" onClick={onAddAnniversary}><CalendarIcon /><strong>{t("memories.firstAnniv")}</strong><span>{t("memories.firstAnnivHint")}</span></button>
      )}
      <div className="memory-section-heading"><div><small>{t("memories.timelineTag")}</small><h3>{t("memories.timelineTitle")}</h3></div></div>
      {ordered.length > 0 ? (
        <>
          {months.map((entry) => (
            <section key={entry.key} className="timeline-month">
              <h4>{formatMonthKey(entry.key, undefined, lang)}<span>{entry.orders.length}</span></h4>
              <ol className="memory-timeline">
                {entry.orders.map((order) => (
                  <li key={order.id}>
                    <span className="timeline-art"><MenuArt item={order} /></span>
                    <div>
                      <small>{t("memories.timelineLine", { date: dayKeyOf(order.completedAt ?? order.createdAt) ?? "", to: localizedPersonName(order.to, lang), from: localizedPersonName(order.from, lang) })}</small>
                      <strong>{localizedItemName(order, lang)}</strong>
                      {order.note && <p>“{order.note}”</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
          {remaining > 0 && (
            <button className="timeline-more" onClick={() => setTimelineLimit((current) => current + TIMELINE_PAGE)}>
              {t("memories.timelineMore", { count: remaining })}
            </button>
          )}
        </>
      ) : (
        <div className="memory-card"><div><span className="memory-dot" /><p>{t("memories.notStarted")}</p></div><h3>{t("memories.emptyTitle")}</h3><p>{t("memories.emptyBody")}</p></div>
      )}
    </section>
  );
}

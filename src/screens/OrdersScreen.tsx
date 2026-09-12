import { useEffect, useRef, useState } from "react";
import { ArchiveIcon, CameraIcon, CheckCircledIcon, CheckIcon, ClockIcon, Cross1Icon, HeartFilledIcon, ResetIcon } from "@radix-ui/react-icons";
import { STATUS_TEXT, localizeDesiredTime, localizedItemName } from "../lib/catalog";
import { relativeTime } from "../lib/date";
import { localizedPersonName } from "../lib/storage";
import { KeyboardInput, useKeyboard } from "../shell";
import { useI18n } from "../i18n";
import type { TKey } from "../lib/i18n";
import type { Order, OrderFilter, OrderStatus } from "../lib/types";
import { MenuArt } from "./MenuArt";

/** Declined and withdrawn orders are finished business, not "进行中". */
const matchesFilter = (order: Order, filter: OrderFilter): boolean => {
  if (filter === "all") return true;
  if (filter === "active") return order.status !== "done" && order.status !== "rejected" && order.status !== "cancelled";
  if (filter === "closed") return order.status === "rejected" || order.status === "cancelled";
  return order.status === filter;
};

const TABS: Array<{ id: OrderFilter; label: TKey; empty: TKey }> = [
  { id: "active", label: "orders.tabActive", empty: "orders.tabActiveEmpty" },
  { id: "done", label: "orders.tabDone", empty: "orders.tabDoneEmpty" },
  { id: "closed", label: "orders.tabClosed", empty: "orders.tabClosedEmpty" },
  { id: "all", label: "orders.tabAll", empty: "orders.tabAllEmpty" },
];

export function OrdersScreen({
  orders,
  currentName,
  onStatus,
  onCancel,
  onKeepAsMemory,
  focusOrderId,
  onFocusConsumed,
  onBrowseShop,
}: {
  orders: Order[];
  /** Display name of this device's identity; only the recipient may respond. */
  currentName: string;
  onStatus: (id: string, status: OrderStatus, note?: string) => void;
  onCancel: (id: string) => void;
  onKeepAsMemory: (order: Order) => void;
  /** Set when a notification deep-linked to one order. */
  focusOrderId: string | null;
  onFocusConsumed: () => void;
  onBrowseShop: () => void;
}) {
  const { lang, t } = useI18n();
  const [filter, setFilter] = useState<OrderFilter>("active");
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState("");
  const focusRef = useRef<HTMLElement | null>(null);
  const visible = orders.filter((order) => matchesFilter(order, filter));
  const activeTab = TABS.find((tab) => tab.id === filter)!;

  // A notification usually points at an order the default tab cannot show — a
  // finished or declined one — so widen the filter before scrolling to it.
  const focusOrder = focusOrderId ? orders.find((order) => order.id === focusOrderId) : undefined;
  useEffect(() => {
    if (!focusOrder) return;
    if (!matchesFilter(focusOrder, filter)) {
      setFilter("all");
      return;
    }
    focusRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    const timer = window.setTimeout(onFocusConsumed, 3000);
    return () => window.clearTimeout(timer);
  }, [focusOrder, filter, onFocusConsumed]);

  // The decline note owns a text field, so the simulated keyboard has to come
  // down in the same event that closes it — otherwise it covers the bottom nav.
  const keyboard = useKeyboard();
  const startDecline = (id: string) => { setDecliningId(id); setDeclineNote(""); };
  const closeDecline = () => { keyboard.hide(); setDecliningId(null); setDeclineNote(""); };
  const confirmDecline = (id: string) => {
    onStatus(id, "rejected", declineNote.trim() || undefined);
    closeDecline();
  };

  return (
    <section className="page-section orders-page">
      <div className="page-title">
        <div><p>{t("orders.subtitle")}</p><h2>{t("orders.title")}</h2></div>
        <span className="round-icon"><ArchiveIcon /></span>
      </div>
      <div className="segment-control four">
        {TABS.map((tab) => (
          <button key={tab.id} className={filter === tab.id ? "active" : ""} aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)}>
            {t(tab.label)}
          </button>
        ))}
      </div>
      <div className="order-list">
        {visible.length === 0 ? (
          <div className="empty-card">
            <CheckCircledIcon /><h3>{t("orders.empty")}</h3><p>{t(activeTab.empty)}</p>
            <button className="empty-action" onClick={onBrowseShop}>{t("orders.browse")}</button>
          </div>
        ) : visible.map((order) => {
          // `currentName` is the stored name, because that is what the row
          // recorded; the two names below are only what the reader sees.
          const mine = order.to === currentName;
          const sender = localizedPersonName(order.from, lang);
          const recipient = localizedPersonName(order.to, lang);
          const focused = order.id === focusOrderId;
          return (
            <article
              className={`order-card ${focused ? "is-focused" : ""}`}
              key={order.id}
              ref={focused ? (node) => { focusRef.current = node; } : undefined}
            >
              <div className="order-card-top">
                <div className="order-art"><MenuArt item={order} /></div>
                <div className="order-main"><span>{sender} → {recipient}</span><h3>{localizedItemName(order, lang)}</h3><p>{relativeTime(order.createdAt, lang)} · {localizeDesiredTime(order.desiredTime, lang)}</p></div>
                <span className={`status-badge status-${order.status}`}>{STATUS_TEXT[lang][order.status]}</span>
              </div>
              {order.note && <div className="order-note">“{order.note}”</div>}
              {order.status === "pending" && (mine ? (
                decliningId === order.id ? (
                  <div className="decline-form">
                    <label htmlFor={`decline-${order.id}`}>{t("orders.declineLabel")}</label>
                    <KeyboardInput id={`decline-${order.id}`} value={declineNote} maxLength={40} onChange={(event) => setDeclineNote(event.target.value)} placeholder={t("orders.declinePlaceholder")} />
                    <div className="order-actions">
                      <button className="ghost-action" onClick={closeDecline}>{t("orders.reconsider")}</button>
                      <button className="primary-action" onClick={() => confirmDecline(order.id)}>{t("orders.confirmDecline")}</button>
                    </div>
                  </div>
                ) : (
                  <div className="order-actions">
                    <button className="ghost-action" onClick={() => startDecline(order.id)}><Cross1Icon /> {t("orders.decline")}</button>
                    <button className="primary-action" onClick={() => onStatus(order.id, "accepted")}><CheckIcon /> {t("orders.accept")}</button>
                  </div>
                )
              ) : (
                <>
                  <div className="order-waiting"><ClockIcon /> {t("orders.waiting", { name: recipient })}</div>
                  <button className="wide-action ghost" onClick={() => onCancel(order.id)}><ResetIcon /> {t("orders.cancel")}</button>
                </>
              ))}
              {order.status === "accepted" && (mine
                ? <button className="wide-action" onClick={() => onStatus(order.id, "doing")}><ClockIcon /> {t("orders.start")}</button>
                : <div className="order-waiting"><CheckIcon /> {t("orders.accepted", { name: recipient })}</div>)}
              {order.status === "doing" && (mine
                ? <button className="wide-action complete" onClick={() => onStatus(order.id, "done")}><HeartFilledIcon /> {t("orders.finish")}</button>
                : <div className="order-waiting"><HeartFilledIcon /> {t("orders.preparing", { name: recipient })}</div>)}
              {order.status === "done" && (
                <>
                  <div className="order-waiting"><CheckCircledIcon /> {order.completedAt ? t("orders.completedAt", { time: relativeTime(order.completedAt, lang) }) : t("orders.completed")}</div>
                  {/* It is already on the timeline; this only adds the photo. */}
                  <button className="wide-action ghost" onClick={() => onKeepAsMemory(order)}><CameraIcon /> {t("orders.addPhoto")}</button>
                </>
              )}
              {order.status === "rejected" && (
                <>
                  <div className="order-waiting"><Cross1Icon /> {t("orders.rejectedNote", { price: order.price, name: sender })}</div>
                  {order.declineNote && <div className="order-note">“{order.declineNote}”</div>}
                </>
              )}
              {order.status === "cancelled" && (
                <div className="order-waiting"><ResetIcon /> {t("orders.cancelledNote", { name: sender, price: order.price })}</div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

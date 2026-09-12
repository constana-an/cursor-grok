import { CheckIcon, HeartFilledIcon, MagicWandIcon, Pencil1Icon, PlusIcon, StarFilledIcon, StarIcon } from "@radix-ui/react-icons";
import { Carousel } from "../shell";
import { MENU, categoryMeta, localizedCategory, localizedItem } from "../lib/catalog";
import { daysSinceOrdered, type ItemHistory } from "../lib/history";
import { useI18n } from "../i18n";
import type { Category, MenuItem } from "../lib/types";
import { MenuArt } from "./MenuArt";

export function ShopScreen({
  category,
  setCategory,
  onAdd,
  onRandom,
  usedLimitedIds,
  customItems,
  onAddCustom,
  onEditCustom,
  coins,
  pinned,
  favouriteIds,
  onToggleFavourite,
  history,
}: {
  category: Category;
  setCategory: (category: Category) => void;
  onAdd: (item: MenuItem) => void;
  onRandom: () => void;
  /** Limited coupons already spent by this couple; each one can only be used once. */
  usedLimitedIds: string[];
  /** Wishes this couple wrote themselves, already scoped to their own shop. */
  customItems: MenuItem[];
  onAddCustom: () => void;
  onEditCustom: (item: MenuItem) => void;
  /** Spending power, so a wish out of reach says so before it is tapped. */
  coins: number;
  /** 我们的固定项目: starred first, then whatever this person orders often. */
  pinned: MenuItem[];
  favouriteIds: string[];
  onToggleFavourite: (item: MenuItem) => void;
  /** This person's own ordering record, for "点过 N 次 · 上次 N 天前". */
  history: Map<string, ItemHistory>;
}) {
  const { lang, t } = useI18n();
  const activeMeta = localizedCategory(categoryMeta.find((item) => item.id === category)!, lang);
  // The couple's own wishes come first: they are the ones worth rediscovering.
  const items = [
    ...customItems.filter((item) => item.category === category),
    ...MENU.filter((item) => item.category === category),
  ];
  const canCustomise = category !== "limited";
  return (
    <>
      {/* The forty shipped cards are the same forty for everybody. This rail is
          the part of the menu that belongs to this person: what they starred,
          then what they keep coming back for. After a fortnight no two shops
          open on the same row. */}
      {pinned.length > 0 && (
        <section className="pinned-section" aria-label={t("shop.pinnedTag")}>
          <div className="section-heading">
            <div><p>{t("shop.pinnedTag")}</p><h2>{t("shop.pinnedTitle")}</h2></div>
          </div>
          <Carousel ariaLabel={t("shop.pinnedTag")} className="pinned-carousel" contentClassName="pinned-track">
            {pinned.map((item) => {
              const copy = localizedItem(item, lang);
              return (
                <button className="pinned-card" key={item.id} onClick={() => onAdd(item)} aria-label={t("shop.addAria", { name: copy.name })}>
                  <span className="pinned-art" style={{ background: item.tint }}><MenuArt item={item} /></span>
                  <strong>{copy.name}</strong>
                  <span className="pinned-price"><HeartFilledIcon /> {item.price}</span>
                </button>
              );
            })}
          </Carousel>
          <p className="pinned-hint">{t("shop.pinnedHint")}</p>
        </section>
      )}

      <Carousel ariaLabel={t("shop.categoriesAria")} className="category-carousel" contentClassName="category-track">
        {categoryMeta.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`category-chip ${category === item.id ? "is-active" : ""}`}
              onClick={() => setCategory(item.id)}
              aria-pressed={category === item.id}
            >
              <Icon />
              <span>{localizedCategory(item, lang).label}</span>
            </button>
          );
        })}
      </Carousel>

      <section className="shop-section">
        <div className="section-heading">
          <div>
            <p>{activeMeta.subtitle}</p>
            <h2>{activeMeta.label}</h2>
          </div>
          <span>{t("shop.wishCount", { count: items.length })}</span>
        </div>

        <button className="random-card" onClick={onRandom}>
          <span className="random-icon"><MagicWandIcon /></span>
          <span><strong>{category === "food" ? t("shop.randomFood") : t("shop.randomOther")}</strong><small>{t("shop.randomHint", { category: activeMeta.label })}</small></span>
          <span className="random-go"><PlusIcon /></span>
        </button>

        <div className="menu-list">
          {items.map((item) => {
            const used = Boolean(item.limited) && usedLimitedIds.includes(item.id);
            // A new wallet holds 8 and the cheapest wish is 28, so most of the
            // menu is out of reach on day one. Saying it here beats letting
            // someone fill in a time and a note first.
            const short = item.price - coins;
            const copy = localizedItem(item, lang);
            const pinnedHere = favouriteIds.includes(item.id);
            const entry = history.get(item.id);
            const since = daysSinceOrdered(history, item.id);
            return (
              <article className={`menu-card ${used ? "is-used" : ""} ${short > 0 ? "is-short" : ""}`.trim()} key={item.id}>
                <div className="menu-art" style={{ background: item.tint }}><MenuArt item={item} /></div>
                <div className="menu-copy">
                  <div className="menu-title-row">
                    <h3>{copy.name}</h3>
                    {item.limited && <span className="limited-tag">{used ? t("shop.used") : t("shop.limitedOnce")}</span>}
                    {pinnedHere && <span className="pinned-tag">{t("shop.pinnedBadge")}</span>}
                    {item.custom && (
                      <button className="custom-edit" onClick={() => onEditCustom(item)} aria-label={t("shop.editAria", { name: copy.name })}>
                        <Pencil1Icon /> {t("shop.ourOwn")}
                      </button>
                    )}
                  </div>
                  <p>{copy.description}</p>
                  <div className="price-meta">
                    <div className="price-pill"><HeartFilledIcon /> {item.price}</div>
                    {used
                      ? <span>{t("shop.couponUsed")}</span>
                      : short > 0
                        ? <span className="price-short">{t("shop.short", { count: short })}</span>
                        // Only once the shortfall is out of the way, because
                        // "还差 40 币" is the more useful of the two.
                        : entry && (
                          <span className="menu-history">
                            {t("shop.orderedTimes", { count: entry.count })}
                            {since !== null && ` · ${since === 0 ? t("shop.lastToday") : t("shop.lastDays", { count: since })}`}
                          </span>
                        )}
                  </div>
                </div>
                <div className="menu-actions">
                  <button
                    className={`pin-button ${pinnedHere ? "is-on" : ""}`.trim()}
                    onClick={() => onToggleFavourite(item)}
                    aria-pressed={pinnedHere}
                    aria-label={pinnedHere ? t("shop.unpinAria", { name: copy.name }) : t("shop.pinAria", { name: copy.name })}
                  >
                    {pinnedHere ? <StarFilledIcon /> : <StarIcon />}
                  </button>
                  <button
                    className="add-button"
                    onClick={() => onAdd(item)}
                    disabled={used}
                    aria-label={used ? t("shop.usedAria", { name: copy.name }) : t("shop.addAria", { name: copy.name })}
                  >
                    {used ? <CheckIcon /> : <PlusIcon />}
                  </button>
                </div>
              </article>
            );
          })}
          {canCustomise && (
            <button className="add-wish-card" onClick={onAddCustom}>
              <span className="add-wish-icon"><PlusIcon /></span>
              <span><strong>{t("shop.addWish")}</strong><small>{t("shop.addWishHint", { category: activeMeta.label })}</small></span>
            </button>
          )}
        </div>
      </section>
    </>
  );
}

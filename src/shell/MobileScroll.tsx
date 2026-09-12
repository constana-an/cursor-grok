import { type PropsWithChildren, useEffect, useLayoutEffect, useRef } from "react";

/**
 * Native scrolling, with one position remembered per tab.
 *
 * The prototype's `MobileScroll` is 466 lines of pointer maths reproducing
 * momentum and rubber-banding for a mouse on a desktop. A phone has all of that
 * in hardware, and doing it in JavaScript on top would be slower and slightly
 * wrong. What is worth keeping is `overscroll-behavior: contain`, so a scroll
 * that runs off the end does not start pulling the page behind it.
 *
 * The five tabs share this one container, so without `scrollKey` a tab opens
 * wherever the previous one was left — scroll 任务 down, tap 小铺, and the shop
 * starts halfway through the menu with its heading cut off. Each tab now keeps
 * its own offset, which is also what a native tab bar does.
 */
export function MobileScroll({
  className,
  scrollKey,
  children,
}: PropsWithChildren<{ className?: string; scrollKey?: string }>) {
  const ref = useRef<HTMLDivElement>(null);
  const positions = useRef<Record<string, number>>({});
  const activeKey = useRef(scrollKey);
  /**
   * The last offset actually observed. Scroll events are asynchronous, so at
   * the moment a tab changes this still holds where the outgoing tab was —
   * reading `scrollTop` instead would read a value the browser may already have
   * clamped against the incoming tab's content.
   */
  const lastOffset = useRef(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const record = () => { lastOffset.current = element.scrollTop; };
    element.addEventListener("scroll", record, { passive: true });
    return () => element.removeEventListener("scroll", record);
  }, []);

  // Layout effect: restore before the browser paints, or the incoming tab
  // flashes at the outgoing one's offset first.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const leaving = activeKey.current;
    // `lastOffset` is the accurate reading for a real scroll; `scrollTop` is the
    // fallback for the case where no scroll event was ever seen.
    if (leaving !== undefined && leaving !== scrollKey) {
      positions.current[leaving] = lastOffset.current || element.scrollTop;
    }

    activeKey.current = scrollKey;
    const restored = scrollKey === undefined ? 0 : positions.current[scrollKey] ?? 0;
    element.scrollTop = restored;
    lastOffset.current = restored;
  }, [scrollKey]);

  return (
    <div ref={ref} className={`app-scroll ${className ?? ""}`.trim()} data-testid="app-scroll">
      {children}
    </div>
  );
}

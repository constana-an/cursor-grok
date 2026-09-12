import { expect, test } from "@playwright/test";

/**
 * The shipped shell, which fills the phone.
 *
 * This replaces the old keyboard-clipping spec. That file measured a drawing of
 * an iPhone — bezel clipping, a keyboard PNG parked below a simulated screen —
 * and every one of those assertions became meaningless the moment the app
 * stopped shipping the simulation. What matters now is the real thing: the app
 * owns the viewport, the document itself never scrolls, and fixed bottom chrome
 * gets out of the way of the system keyboard.
 *
 * The keyboard cannot be raised from a desktop browser, so the cases that need
 * one drive `visualViewport` directly — which is exactly the signal the shell
 * reads on a device.
 */
const enter = async (page: import("@playwright/test").Page) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("couple-shop-lang", "zh");
    localStorage.setItem("couple-shop-onboarded", "1");
    localStorage.setItem("couple-shop-economy-version", "4");
    localStorage.setItem("couple-shop-coins:大宝", "200");
  });
  await page.reload();
  await page.getByRole("button", { name: /我是大宝/ }).click();
};

/** Shrinks the visual viewport the way iOS does when the keyboard comes up. */
const raiseKeyboard = async (page: import("@playwright/test").Page, height: number) => {
  await page.evaluate((covered) => {
    const viewport = window.visualViewport!;
    Object.defineProperty(viewport, "height", {
      get: () => window.innerHeight - covered,
      configurable: true,
    });
    viewport.dispatchEvent(new Event("resize"));
  }, height);
};

const lowerKeyboard = async (page: import("@playwright/test").Page) => {
  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Object.defineProperty(viewport, "height", { get: () => window.innerHeight, configurable: true });
    viewport.dispatchEvent(new Event("resize"));
  });
};

test("the app fills the viewport, with no simulated phone around it", async ({ page }) => {
  await enter(page);
  // The preview harness must not reach the bundle a real visitor runs.
  await expect(page.getByTestId("device-screen")).toHaveCount(0);
  await expect(page.getByTestId("keyboard-dock")).toHaveCount(0);

  const root = (await page.locator(".app-root").boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(Math.round(root.height)).toBeGreaterThanOrEqual(viewport.height - 1);
  expect(Math.round(root.y)).toBe(0);
});

test("the document never scrolls; the app's own container does", async ({ page }) => {
  await enter(page);
  // Two scrollbars is the classic full-height-app mistake: the page scrolls
  // behind the fixed chrome and the nav drifts off the bottom.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollHeight - window.innerHeight);
  expect(overflow).toBeLessThanOrEqual(1);

  const scrollable = await page.evaluate(() => {
    const scroll = document.querySelector<HTMLElement>('[data-testid="app-scroll"]')!;
    return { canScroll: scroll.scrollHeight > scroll.clientHeight, contain: getComputedStyle(scroll).overscrollBehaviorY };
  });
  expect(scrollable.canScroll).toBe(true);
  // A scroll that runs off the end must not start dragging the page behind it.
  expect(scrollable.contain).toBe("contain");
});

test("the bottom navigation stays on screen and clears the home indicator", async ({ page }) => {
  await enter(page);
  const nav = (await page.locator(".bottom-nav").boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(nav.y).toBeGreaterThan(viewport.height * 0.6);
  expect(nav.y + nav.height).toBeLessThanOrEqual(viewport.height + 1);
});

test("the tab bar rides above the keyboard instead of hiding behind it", async ({ page }) => {
  await enter(page);
  const before = (await page.locator(".bottom-nav").boundingBox())!;

  // Regression: the bar was pinned to the safe area alone, so the keyboard
  // covered it and every tab became unreachable.
  await raiseKeyboard(page, 300);
  await expect(async () => {
    const during = (await page.locator(".bottom-nav").boundingBox())!;
    expect(during.y + during.height).toBeLessThanOrEqual(page.viewportSize()!.height - 300 + 1);
  }).toPass({ timeout: 4000 });

  await lowerKeyboard(page);
  await expect(async () => {
    const after = (await page.locator(".bottom-nav").boundingBox())!;
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2);
  }).toPass({ timeout: 4000 });
});

test("a bottom sheet stays inside the viewport while it opens", async ({ page }) => {
  await enter(page);
  await page.getByRole("button", { name: "加入缤纷水果茶" }).click();

  const viewport = page.viewportSize()!;
  await expect(page.getByTestId("bottom-sheet")).toBeVisible();

  // Horizontal containment holds throughout; the sheet only ever moves on Y.
  const during = (await page.getByTestId("bottom-sheet").boundingBox())!;
  expect(during.x).toBeGreaterThanOrEqual(-1);
  expect(during.x + during.width).toBeLessThanOrEqual(viewport.width + 1);

  // Vertically it slides up from below, so the property worth asserting is
  // where it comes to rest — measuring mid-flight just measures the animation.
  await expect(async () => {
    const settled = (await page.getByTestId("bottom-sheet").boundingBox())!;
    expect(settled.y + settled.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(settled.y).toBeGreaterThanOrEqual(-1);
  }).toPass({ timeout: 4000 });
});

test("saving a sheet lets go of the field, so the keyboard can drop", async ({ page }) => {
  await enter(page);
  await page.getByRole("button", { name: "我们", exact: true }).click();
  await page.getByRole("button", { name: /小铺设置/ }).click();
  await page.getByLabel("小铺名称").fill("我们的周末小铺");
  await expect(page.getByLabel("小铺名称")).toBeFocused();

  await page.getByRole("button", { name: "保存小铺资料", exact: true }).click();
  // Blurring is the only way a page can ask iOS to put the keyboard away.
  const stillFocused = await page.evaluate(() =>
    document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA");
  expect(stillFocused).toBe(false);
});

test("tapping away from a field releases it", async ({ page }) => {
  await enter(page);
  await page.getByRole("button", { name: "我们", exact: true }).click();
  await page.getByPlaceholder("输入 6 位情侣码").click();
  await expect(page.getByPlaceholder("输入 6 位情侣码")).toBeFocused();

  await page.getByText("一人创建小铺，另一人输入情侣码加入").click();
  const stillFocused = await page.evaluate(() => document.activeElement?.tagName === "INPUT");
  expect(stillFocused).toBe(false);
});

test("the design harness is still reachable, and only when asked for", async ({ page }) => {
  await page.goto("/?preview=1");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("couple-shop-lang", "zh");
    localStorage.setItem("couple-shop-onboarded", "1");
    localStorage.setItem("couple-shop-identity", "大宝");
  });
  await page.reload();
  // The simulated phone is a design tool, not something a visitor stumbles into.
  await expect(page.getByTestId("device-screen")).toBeVisible();
});

test("each tab remembers its own scroll position, and never inherits another's", async ({ page }) => {
  await enter(page);
  const offset = () => page.evaluate(() =>
    document.querySelector<HTMLElement>('[data-testid="app-scroll"]')!.scrollTop);
  const go = (tab: string) => page.getByRole("button", { name: tab, exact: true }).click();

  // Regression: all five tabs share one scroll container, so 小铺 opened
  // wherever 任务 had been left — heading cut off, mid-menu.
  await go("任务");
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('[data-testid="app-scroll"]')!.scrollTop = 600;
  });
  await page.waitForTimeout(200);
  const before = await offset();
  expect(before).toBeGreaterThan(0);

  await go("小铺");
  expect(await offset(), "a freshly opened tab must start at its own top").toBe(0);

  // Coming back returns to exactly where that tab was, the way a native tab bar
  // behaves — "somewhere greater than zero" would pass on a stale offset too.
  await go("任务");
  await expect(async () => expect(await offset()).toBe(before)).toPass({ timeout: 3000 });
});

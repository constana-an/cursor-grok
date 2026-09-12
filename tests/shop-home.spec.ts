import { expect, test } from "@playwright/test";

/**
 * The shop page used to open on a category rail and forty cards, which asked
 * the same question on every launch: pick something. These hold the two things
 * that replaced it — 此刻, which says what is actually owed right now, and the
 * pinned rail, which is the part of the menu that belongs to this person.
 */
const enter = async (page: import("@playwright/test").Page, as: "大宝" | "二宝" = "大宝") => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("couple-shop-lang", "zh");
    localStorage.setItem("couple-shop-economy-version", "4");
    localStorage.setItem("couple-shop-onboarded", "1");
    localStorage.setItem("couple-shop-opening-dismissed", "1");
    localStorage.setItem("couple-shop-coins:大宝", "400");
    localStorage.setItem("couple-shop-coins:二宝", "400");
  });
  await page.reload();
  await page.getByRole("button", { name: new RegExp(`我是${as}`) }).click();
};

const switchIdentity = async (page: import("@playwright/test").Page, to: "大宝" | "二宝") => {
  await page.getByRole("button", { name: "我们", exact: true }).click();
  await page.getByRole("button", { name: /当前身份/ }).click();
  await page.getByRole("button", { name: new RegExp(`我是${to}`) }).click();
};

/** Sends one wish from this device to the other person. */
const order = async (page: import("@playwright/test").Page, name: string, category = "点吃的") => {
  await page.getByRole("button", { name: "小铺", exact: true }).click();
  await page.getByRole("button", { name: category, exact: true }).click();
  await page.getByRole("button", { name: `加入${name}` }).click();
  await page.getByRole("button", { name: /确认下单/ }).click();
};

test("a first run is left to the opening checklist alone", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("couple-shop-lang", "zh");
    localStorage.setItem("couple-shop-onboarded", "1");
  });
  await page.reload();
  await page.getByRole("button", { name: /我是大宝/ }).click();
  // Two things competing to be the first instruction is how people do neither.
  await expect(page.locator(".moments")).toHaveCount(0);
});

test("an unanswered wish is the first thing on the page, and lands on its order", async ({ page }) => {
  await enter(page, "二宝");
  await order(page, "奶茶投喂");
  await switchIdentity(page, "大宝");

  const card = page.locator(".moment-card.is-answer");
  await expect(card).toBeVisible();
  await expect(card).toContainText("二宝点了「奶茶投喂」");

  // 此刻 sits above the wallet: what they are waiting for outranks the balance.
  const moments = await page.locator(".moments").boundingBox();
  const wallet = await page.locator(".wallet-card").boundingBox();
  expect(moments!.y).toBeLessThan(wallet!.y);

  await card.getByRole("button", { name: "去回应" }).click();
  await expect(page.locator(".order-card.is-focused")).toContainText("奶茶投喂");
});

test("something said yes to and not finished is still owed", async ({ page }) => {
  await enter(page, "二宝");
  await order(page, "十分钟抱抱", "点服务");
  await switchIdentity(page, "大宝");
  await page.getByRole("button", { name: "订单", exact: true }).click();
  await page.getByRole("button", { name: /接单/ }).click();

  await page.getByRole("button", { name: "小铺", exact: true }).click();
  await expect(page.locator(".moment-card.is-promised")).toContainText("你答应了「十分钟抱抱」");
});

test("a starred wish is pinned first, and the rail remembers it per person", async ({ page }) => {
  await enter(page, "大宝");
  await expect(page.locator(".pinned-section")).toHaveCount(0);

  await page.getByRole("button", { name: "置顶暖呼呼火锅" }).click();
  await expect(page.locator(".pinned-card").first()).toContainText("暖呼呼火锅");
  await expect(page.getByRole("button", { name: "取消置顶暖呼呼火锅" })).toBeVisible();

  // Stars are personal, like the wallet: one person pinning theirs never
  // rearranges the other's shop.
  await switchIdentity(page, "二宝");
  await expect(page.locator(".pinned-section")).toHaveCount(0);
  await switchIdentity(page, "大宝");
  await expect(page.locator(".pinned-card").first()).toContainText("暖呼呼火锅");

  await page.getByRole("button", { name: "取消置顶暖呼呼火锅" }).click();
  await expect(page.locator(".pinned-section")).toHaveCount(0);
});

test("a wish ordered twice becomes a regular and says when it last happened", async ({ page }) => {
  await enter(page, "大宝");
  await order(page, "奶茶投喂");
  await order(page, "奶茶投喂");

  // One order is a try; two is a habit, and habits earn a place in the rail.
  await expect(page.locator(".pinned-card").first()).toContainText("奶茶投喂");
  await expect(page.locator(".menu-card", { hasText: "奶茶投喂" }).locator(".menu-history"))
    .toContainText("点过 2 次 · 今天点过");
});

test("the shop page never scrolls sideways", async ({ page }) => {
  await enter(page, "大宝");
  await page.getByRole("button", { name: "置顶暖呼呼火锅" }).click();
  const sizes = await page.evaluate(() => {
    const screen = document.querySelector(".app-screen")!;
    return { scrollWidth: screen.scrollWidth, clientWidth: screen.clientWidth };
  });
  expect(sizes.scrollWidth).toBe(sizes.clientWidth);
});

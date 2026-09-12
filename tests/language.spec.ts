import { expect, test } from "@playwright/test";

/**
 * The shop reads in English or Chinese, per device.
 *
 * Three things are worth holding still here: that a device opens in English
 * without consulting the browser's locale, that the switch reaches every
 * screen, and that it stops at the couple's own words. A shop that translated
 * "陪我去菜市场" into something else would be rewriting what one of them wrote.
 *
 * Every other spec seeds `couple-shop-lang` to `zh` and drives the Chinese UI;
 * this file is the one that leaves the default alone.
 */
const fresh = async (page: import("@playwright/test").Page) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("couple-shop-onboarded", "1");
    localStorage.setItem("couple-shop-economy-version", "4");
    localStorage.setItem("couple-shop-coins:大宝", "200");
  });
  await page.reload();
};

test("a new device opens in English and switches from the very first screen", async ({ page }) => {
  await fresh(page);

  // Nothing is guessed from the browser's locale: the shop is English until
  // somebody says otherwise.
  await expect(page.getByRole("heading", { name: "Who's ordering today?" })).toBeVisible();
  // The two shipped default names are the shop's words, not the couple's, so
  // an English reader is introduced to their partner in English.
  await expect(page.getByRole("button", { name: /I'm Sweetie/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /I'm Honey/ })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");

  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(page.getByRole("heading", { name: "今天是谁来点单？" })).toBeVisible();
  await expect(page.getByRole("button", { name: /我是大宝/ })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");

  // The choice belongs to the device, so it has to survive a cold launch.
  await page.reload();
  await expect(page.getByRole("heading", { name: "今天是谁来点单？" })).toBeVisible();
});

test("the default reaches every screen, and the Us row turns it over", async ({ page }) => {
  await fresh(page);
  await page.getByRole("button", { name: /I'm Sweetie/ }).click();

  await expect(page.getByRole("heading", { name: "Food" })).toBeVisible();
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My tasks today" })).toBeVisible();
  await page.getByRole("button", { name: "Orders", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Our orders" })).toBeVisible();
  await page.getByRole("button", { name: "Memories", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Photo memories" })).toBeVisible();
  await page.getByRole("button", { name: "Us", exact: true }).click();
  await expect(page.getByRole("button", { name: /Shop settings/ })).toBeVisible();

  // The row names where the tap leads, not where you already are.
  await page.getByRole("button", { name: /语言 \/ Language/ }).click();
  await expect(page.getByRole("button", { name: /小铺设置/ })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});

test("English counts agree with their nouns", async ({ page }) => {
  await fresh(page);
  await page.getByRole("button", { name: /I'm Sweetie/ }).click();
  await page.getByRole("button", { name: "Memories", exact: true }).click();

  // One wish away from the first milestone: "1 wishes to go" is the whole
  // reason the dictionary carries a plural form at all.
  await expect(page.getByText(/1 wish to go until/)).toBeVisible();
  await expect(page.getByText(/1 wishes to go/)).toHaveCount(0);
});

test("a wish the couple wrote keeps their own words in both languages", async ({ page }) => {
  await fresh(page);

  // Write it in Chinese, so the check afterwards is about their words rather
  // than about a string that happens to already be English.
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await page.getByRole("button", { name: /我是大宝/ }).click();
  await page.getByRole("button", { name: /写一个我们自己的心愿/ }).click();
  await page.getByLabel("心愿名字").fill("陪我去菜市场");
  await page.getByLabel("一句话介绍").fill("挑晚饭的菜，顺便牵手");
  await page.getByRole("button", { name: "上架这个心愿", exact: true }).click();
  await expect(page.getByRole("heading", { name: "陪我去菜市场" })).toBeVisible();

  await page.getByRole("button", { name: "我们", exact: true }).click();
  await page.getByRole("button", { name: /语言 \/ Language/ }).click();
  await page.getByRole("button", { name: "Shop", exact: true }).click();

  // The shop's own items are renamed; theirs is not.
  await expect(page.getByRole("heading", { name: "Fruit Tea, Full Cup" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "陪我去菜市场" })).toBeVisible();
  await expect(page.getByText("挑晚饭的菜，顺便牵手")).toBeVisible();
});

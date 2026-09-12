import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("couple-shop-lang", "zh");
    localStorage.setItem("couple-shop-onboarded", "1");
  });
  await page.reload();
});

test("couple profile updates names, shop title, start date, and memory stats", async ({ page }) => {
  await page.getByRole("button", { name: /我是大宝/ }).click();
  await page.getByRole("button", { name: "我们", exact: true }).click();
  await page.getByRole("button", { name: /小铺设置/ }).click();

  await page.getByLabel("小铺名称").fill("我们的周末小铺");
  await page.getByLabel("第一位名字").fill("安安");
  await page.getByLabel("第二位名字").fill("小屿");
  await page.getByLabel(/恋爱开始日期/).fill("2024-05-20");
  await page.getByRole("button", { name: "保存小铺资料", exact: true }).click();

  await expect(page.getByRole("heading", { name: "我们的周末小铺" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "安安 & 小屿" })).toBeVisible();
  await expect(page.getByText(/2024 年 5 月 20 日开始/)).toBeVisible();

  await page.getByRole("button", { name: "回忆", exact: true }).click();
  await expect(page.getByText("2024.5.20")).toBeVisible();
  await expect(page.getByText("开始日期")).toBeVisible();
});

test("couple profile rejects a future start date", async ({ page }) => {
  await page.getByRole("button", { name: /我是大宝/ }).click();
  await page.getByRole("button", { name: "我们", exact: true }).click();
  await page.getByRole("button", { name: /小铺设置/ }).click();
  await page.getByLabel(/恋爱开始日期/).fill("2999-12-31");
  await page.getByRole("button", { name: "保存小铺资料", exact: true }).click();

  await expect(page.getByText("开始日期不能晚于今天")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "小铺资料" })).toBeVisible();
});

import { expect, test } from "@playwright/test";

/** Seeds a separate wallet for each identity, then enters the shop as 大宝. */
const startWithCoins = async (page: import("@playwright/test").Page, coins: number) => {
  await page.goto("/");
  await page.evaluate((value) => {
    localStorage.clear();
    localStorage.setItem("couple-shop-lang", "zh");
    localStorage.setItem("couple-shop-economy-version", "4");
    // The first-run guide is a modal; onboarding has its own test.
    localStorage.setItem("couple-shop-onboarded", "1");
    localStorage.setItem("couple-shop-coins:大宝", String(value));
    localStorage.setItem("couple-shop-coins:二宝", "8");
  }, coins);
  await page.reload();
  await page.getByRole("button", { name: /我是大宝/ }).click();
};

const switchIdentity = async (page: import("@playwright/test").Page, to: "大宝" | "二宝") => {
  await page.getByRole("button", { name: "我们", exact: true }).click();
  await page.getByRole("button", { name: /当前身份/ }).click();
  await page.getByRole("button", { name: new RegExp(`我是${to}`) }).click();
};

const coinBalance = async (page: import("@playwright/test").Page) =>
  Number(await page.locator(".coin-count strong").innerText());

test("a brand new shop opens both wallets at 8 coins", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("couple-shop-lang", "zh");
    localStorage.setItem("couple-shop-onboarded", "1");
  });
  await page.reload();
  await page.getByRole("button", { name: /我是大宝/ }).click();
  expect(await coinBalance(page)).toBe(8);
  await switchIdentity(page, "二宝");
  expect(await coinBalance(page)).toBe(8);
});

test("each identity keeps its own wallet", async ({ page }) => {
  await startWithCoins(page, 200);
  expect(await coinBalance(page)).toBe(200);
  await switchIdentity(page, "二宝");
  // 二宝 must not see or be able to spend 大宝's coins.
  expect(await coinBalance(page)).toBe(8);
  await switchIdentity(page, "大宝");
  expect(await coinBalance(page)).toBe(200);
});

test("the sender pays, cannot answer their own order, and a decline refunds them", async ({ page }) => {
  await startWithCoins(page, 200);

  await page.getByRole("button", { name: "加入缤纷水果茶" }).click();
  await page.getByRole("button", { name: /把这份心意送出去/ }).click();
  await page.getByRole("button", { name: "订单", exact: true }).click();

  await expect(page.getByText("等 二宝 回应；这次不方便的话，心意会回到你这里")).toBeVisible();
  await expect(page.getByRole("button", { name: /接单/ })).toHaveCount(0);
  expect(await coinBalance(page)).toBe(172);

  await switchIdentity(page, "二宝");
  await page.getByRole("button", { name: "订单", exact: true }).click();
  await page.getByRole("button", { name: /婉拒/ }).click();
  await page.getByLabel(/说一句为什么/).fill("今天太累了，明天补给你");
  await page.getByRole("button", { name: "确认婉拒" }).click();
  await expect(page.getByText("已经回复大宝了，28 份心意也回到大宝那里")).toBeVisible();
  // The reason travels with the order, so "这次未接单" is not the whole story.
  await page.getByRole("button", { name: "未完成", exact: true }).click();
  await expect(page.getByText("“今天太累了，明天补给你”")).toBeVisible();
  // The responder's own wallet is untouched by someone else's order.
  expect(await coinBalance(page)).toBe(8);

  await switchIdentity(page, "大宝");
  expect(await coinBalance(page)).toBe(200);
});

test("a declined order leaves 进行中 and is filed under 未完成", async ({ page }) => {
  await startWithCoins(page, 200);
  await page.getByRole("button", { name: "加入缤纷水果茶" }).click();
  await page.getByRole("button", { name: /把这份心意送出去/ }).click();

  await switchIdentity(page, "二宝");
  await page.getByRole("button", { name: "订单", exact: true }).click();
  await page.getByRole("button", { name: /婉拒/ }).click();
  await page.getByRole("button", { name: "确认婉拒" }).click();

  // Regression: 进行中 used to mean "not done", which kept declined orders in
  // the working list forever.
  await expect(page.locator(".order-card")).toHaveCount(0);
  await expect(page.getByText("这里空空的")).toBeVisible();

  await page.getByRole("button", { name: "未完成", exact: true }).click();
  await expect(page.locator(".order-card")).toHaveCount(1);
  await expect(page.getByText("28 份心意已经回到 大宝 那里")).toBeVisible();

  await page.getByRole("button", { name: "已完成", exact: true }).click();
  await expect(page.locator(".order-card")).toHaveCount(0);
  await page.getByRole("button", { name: "全部", exact: true }).click();
  await expect(page.locator(".order-card")).toHaveCount(1);
});

test("the weekly order task unlocks for whoever actually finished the wish", async ({ page }) => {
  await startWithCoins(page, 200);
  const orderTask = page.locator(".task-card", { hasText: "认真完成一份订单" });

  await page.getByRole("button", { name: "任务", exact: true }).click();
  await expect(orderTask.getByRole("button", { name: /待完成/ })).toBeDisabled();
  await expect(orderTask.getByText("先完成一份对方点的心愿")).toBeVisible();

  await page.getByRole("button", { name: "小铺", exact: true }).click();
  await page.getByRole("button", { name: "加入缤纷水果茶" }).click();
  await page.getByRole("button", { name: /把这份心意送出去/ }).click();

  await switchIdentity(page, "二宝");
  await page.getByRole("button", { name: "订单", exact: true }).click();
  await page.getByRole("button", { name: /接单/ }).click();
  await page.getByRole("button", { name: /开始准备/ }).click();
  await page.getByRole("button", { name: /完成心愿/ }).click();

  // 二宝 did the thing, so 二宝 can claim it.
  await page.getByRole("button", { name: "任务", exact: true }).click();
  await orderTask.getByRole("button", { name: "+8" }).click();
  await expect(orderTask.getByRole("button", { name: /已领取/ })).toBeVisible();

  // 大宝 only asked for it, so the task stays locked on that side.
  await switchIdentity(page, "大宝");
  await page.getByRole("button", { name: "任务", exact: true }).click();
  await expect(orderTask.getByRole("button", { name: /待完成/ })).toBeDisabled();
});

test("a couple's own wish can be written, ordered and taken back off the menu", async ({ page }) => {
  await startWithCoins(page, 200);
  await page.getByRole("button", { name: /写一个我们自己的心愿/ }).click();

  await expect(page.getByRole("dialog", { name: "写一个我们的心愿" })).toBeVisible();
  await page.getByLabel("心愿名字").fill("陪我去菜市场");
  await page.getByLabel("一句话介绍").fill("挑晚饭的菜，顺便牵手");
  await page.getByLabel("需要多少份心意").fill("30");
  await page.getByRole("button", { name: "上架这个心愿" }).click();

  const card = page.locator(".menu-card", { hasText: "陪我去菜市场" });
  await expect(card).toBeVisible();
  await expect(card.getByText("挑晚饭的菜，顺便牵手")).toBeVisible();

  await card.getByRole("button", { name: "加入陪我去菜市场" }).click();
  await page.getByRole("button", { name: /把这份心意送出去 · 30/ }).click();
  expect(await coinBalance(page)).toBe(170);

  // Taking it off the menu must not rewrite the order that already exists.
  await page.getByRole("button", { name: "编辑陪我去菜市场" }).click();
  await page.getByRole("button", { name: /下架这个心愿/ }).click();
  await page.getByRole("button", { name: "确认下架" }).click();
  await expect(page.locator(".menu-card", { hasText: "陪我去菜市场" })).toHaveCount(0);

  await page.getByRole("button", { name: "订单", exact: true }).click();
  await expect(page.locator(".order-card", { hasText: "陪我去菜市场" })).toBeVisible();
});

test("a custom 去约会 wish counts towards the weekly date task", async ({ page }) => {
  await startWithCoins(page, 200);
  await page.getByRole("button", { name: "去约会", exact: true }).click();
  await page.getByRole("button", { name: /写一个我们自己的心愿/ }).click();
  await page.getByLabel("心愿名字").fill("夜市散步");
  await page.getByLabel("需要多少份心意").fill("40");
  await page.getByRole("button", { name: "上架这个心愿" }).click();

  await page.getByRole("button", { name: "加入夜市散步" }).click();
  await page.getByRole("button", { name: /把这份心意送出去/ }).click();

  await switchIdentity(page, "二宝");
  await page.getByRole("button", { name: "订单", exact: true }).click();
  await page.getByRole("button", { name: /接单/ }).click();
  await page.getByRole("button", { name: /开始准备/ }).click();
  await page.getByRole("button", { name: /完成心愿/ }).click();

  // The order carries its own category, so a wish the couple wrote themselves
  // unlocks the date task exactly like a built-in one.
  await page.getByRole("button", { name: "任务", exact: true }).click();
  const dateTask = page.locator(".task-card", { hasText: "完成一次用心约会" });
  await dateTask.getByRole("button", { name: "+10" }).click();
  await expect(dateTask.getByRole("button", { name: /已领取/ })).toBeVisible();
});

test("the sender can withdraw an unanswered wish, and gets the coins back", async ({ page }) => {
  await startWithCoins(page, 200);
  await page.getByRole("button", { name: "限定券", exact: true }).click();
  await page.getByRole("button", { name: "加入今天吃什么我决定" }).click();
  await page.getByRole("button", { name: /把这份心意送出去/ }).click();
  expect(await coinBalance(page)).toBe(80);

  const card = page.locator(".menu-card", { hasText: "今天吃什么我决定" });
  await expect(card.getByText("已使用")).toBeVisible();

  await page.getByRole("button", { name: "订单", exact: true }).click();
  await page.getByRole("button", { name: /撤回这个心愿/ }).click();
  await expect(page.getByText("已撤回，120 份心意回到你这里")).toBeVisible();
  expect(await coinBalance(page)).toBe(200);

  await expect(page.locator(".order-card")).toHaveCount(0);
  await page.getByRole("button", { name: "未完成", exact: true }).click();
  await expect(page.locator(".status-badge")).toHaveText("已撤回");

  // Withdrawing must release the once-per-couple coupon, not burn it.
  await page.getByRole("button", { name: "小铺", exact: true }).click();
  await page.getByRole("button", { name: "限定券", exact: true }).click();
  await expect(card.getByText("已使用")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "加入今天吃什么我决定" })).toBeEnabled();

  // Only the sender may withdraw, and only while it is unanswered.
  await page.getByRole("button", { name: "加入今天吃什么我决定" }).click();
  await page.getByRole("button", { name: /把这份心意送出去/ }).click();
  await switchIdentity(page, "二宝");
  await page.getByRole("button", { name: "订单", exact: true }).click();
  await expect(page.getByRole("button", { name: /撤回这个心愿/ })).toHaveCount(0);
});

test("a notification link lands on its own order, whatever tab it belongs to", async ({ page }) => {
  await startWithCoins(page, 200);
  await page.getByRole("button", { name: "加入缤纷水果茶" }).click();
  await page.getByRole("button", { name: /把这份心意送出去/ }).click();

  await switchIdentity(page, "二宝");
  await page.getByRole("button", { name: "订单", exact: true }).click();
  await page.getByRole("button", { name: /接单/ }).click();
  await page.getByRole("button", { name: /开始准备/ }).click();
  await page.getByRole("button", { name: /完成心愿/ }).click();
  const orderId = await page.evaluate(() => JSON.parse(localStorage.getItem("couple-shop-orders")!)[0].id);

  await page.goto(`/?order=${orderId}`);
  // A finished order is invisible under the default 进行中 tab, so the filter
  // has to widen; the id used to be parsed and then thrown away entirely.
  await expect(page.locator(".order-card.is-focused")).toBeVisible();
  await expect(page.locator(".order-card", { hasText: "缤纷水果茶" })).toBeVisible();
  expect(new URL(page.url()).search).toBe("");
});

test("a spent limited coupon stays visibly used", async ({ page }) => {
  await startWithCoins(page, 200);
  await page.getByRole("button", { name: "限定券", exact: true }).click();
  await page.getByRole("button", { name: "加入今天吃什么我决定" }).click();
  await page.getByRole("button", { name: /把这份心意送出去/ }).click();

  const card = page.locator(".menu-card", { hasText: "今天吃什么我决定" });
  await expect(card.getByText("已使用")).toBeVisible();
  await expect(card.getByRole("button", { name: /已使用/ })).toBeDisabled();
});

test("a wish beyond the wallet says so before the note is written", async ({ page }) => {
  await startWithCoins(page, 8);

  // Regression: every card looked orderable, and "心意还差一点点" only arrived as
  // a toast after picking a time and typing a message.
  const card = page.locator(".menu-card", { hasText: "缤纷水果茶" });
  await expect(card.getByText("再攒 20 份心意")).toBeVisible();

  await page.getByRole("button", { name: "加入缤纷水果茶" }).click();
  // The card and the sheet now say the same sentence, so this one is scoped.
  await expect(page.locator(".order-short").getByText("再攒 20 份心意")).toBeVisible();
  await expect(page.getByRole("button", { name: /把这份心意送出去/ })).toHaveCount(0);
  // The sheet offers the way out rather than a dead end.
  await expect(page.getByRole("button", { name: /去连接|去做任务攒心意/ })).toBeVisible();
});

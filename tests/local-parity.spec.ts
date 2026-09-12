import { expect, test } from "@playwright/test";

/** The shop day key, in the shop timezone — mirrors src/lib/date.ts. */
const shopDay = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(Date.now() + offsetDays * 86_400_000));

const enterAs = async (page: import("@playwright/test").Page, who: "大宝" | "二宝", seed: Record<string, string> = {}) => {
  await page.goto("/");
  await page.evaluate((entries) => {
    localStorage.clear();
    localStorage.setItem("couple-shop-lang", "zh");
    localStorage.setItem("couple-shop-onboarded", "1");
    localStorage.setItem("couple-shop-economy-version", "4");
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, seed);
  await page.reload();
  await page.getByRole("button", { name: new RegExp(`我是${who}`) }).click();
};

const switchIdentity = async (page: import("@playwright/test").Page, to: "大宝" | "二宝") => {
  await page.getByRole("button", { name: "我们", exact: true }).click();
  await page.getByRole("button", { name: /当前身份/ }).click();
  await page.getByRole("button", { name: new RegExp(`我是${to}`) }).click();
};

const coinBalance = async (page: import("@playwright/test").Page) =>
  Number(await page.locator(".coin-count strong").innerText());

test("checking in works offline and pays into that identity's own wallet", async ({ page }) => {
  await enterAs(page, "大宝");
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  expect(await coinBalance(page)).toBe(8);

  await page.getByRole("button", { name: "签到 +1" }).click();
  await expect(page.getByText("连续签到 1 天，甜心币 +1")).toBeVisible();
  // Regression: this used to force open a login sheet that could never succeed
  // when the build carries no Supabase configuration.
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".checkin-card strong")).toHaveText("1 天");
  await expect(page.getByRole("button", { name: "今日已签" })).toBeDisabled();
  expect(await coinBalance(page)).toBe(9);

  await page.reload();
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  await expect(page.locator(".checkin-card strong")).toHaveText("1 天");
  expect(await coinBalance(page)).toBe(9);

  // The other identity has their own streak and their own coin.
  await switchIdentity(page, "二宝");
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  await expect(page.locator(".checkin-card strong")).toHaveText("0 天");
  await expect(page.getByRole("button", { name: "签到 +1" })).toBeEnabled();
  expect(await coinBalance(page)).toBe(8);

  await switchIdentity(page, "大宝");
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  await expect(page.locator(".checkin-card strong")).toHaveText("1 天");
});

test("a streak counts back from yesterday when today is not claimed yet", async ({ page }) => {
  await enterAs(page, "大宝", {
    "couple-shop-checkins:大宝": JSON.stringify([shopDay(-1), shopDay(-2)]),
  });
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  // Matches public.checkin_streak: an unclaimed today does not break the run.
  await expect(page.locator(".checkin-card strong")).toHaveText("2 天");
  await expect(page.getByRole("button", { name: "签到 +1" })).toBeEnabled();

  await page.getByRole("button", { name: "签到 +1" }).click();
  await expect(page.getByText("连续签到 3 天，甜心币 +1")).toBeVisible();
});

test("anniversaries can be kept, edited and deleted without a cloud", async ({ page }) => {
  await enterAs(page, "大宝");
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  await page.getByRole("button", { name: /添加第一个纪念日/ }).click();

  await page.getByLabel("纪念日名称").fill("第一次见面");
  await page.getByLabel("日期").fill("2024-05-20");
  await page.getByRole("button", { name: "7 天", exact: true }).click();
  await page.getByRole("button", { name: "保存纪念日" }).click();
  await expect(page.getByText("纪念日已保存，将提前 7 天提醒")).toBeVisible();

  const row = page.locator(".anniversary-list button", { hasText: "第一次见面" });
  await expect(row).toBeVisible();
  await expect(row.getByText(/每年重复 · 提前 7 天提醒/)).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  await expect(page.locator(".anniversary-list button", { hasText: "第一次见面" })).toBeVisible();

  await page.getByRole("button", { name: "管理" }).click();
  await page.getByLabel("纪念日名称").fill("我们第一次见面");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByText("纪念日已更新")).toBeVisible();
  await expect(page.locator(".anniversary-list button", { hasText: "我们第一次见面" })).toBeVisible();

  await page.getByRole("button", { name: "管理" }).click();
  await page.getByRole("button", { name: /删除这个纪念日/ }).click();
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByRole("button", { name: /添加第一个纪念日/ })).toBeVisible();
});

test("an allowed but unsubscribed device does not claim it will be pushed", async ({ page }) => {
  // A device where the OS permission is already granted, which is all the old
  // code ever looked at.
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { get: () => "granted", configurable: true });
  });
  await enterAs(page, "大宝");
  await page.getByRole("button", { name: "我们", exact: true }).click();

  // Regression: this row read 已开启 / 订单不会错过 off the permission alone, on
  // a device with no push subscription and no couple to be pushed from.
  const row = page.locator(".setting-row", { hasText: "实时消息通知" });
  await expect(row).toBeVisible();
  await expect(row.getByText("已允许通知；连接双人小铺后才会推送")).toBeVisible();
  await expect(row.getByText("仅本机")).toBeVisible();
  await expect(row.getByText("订单不会错过")).toHaveCount(0);
});

test("a finished wish lands on the memory timeline by itself", async ({ page }) => {
  await enterAs(page, "大宝", { "couple-shop-coins:大宝": "200" });
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  await expect(page.getByText("完成一个心愿，它就会自己出现在这条时间线上")).toBeVisible();

  await page.getByRole("button", { name: "小铺", exact: true }).click();
  await page.getByRole("button", { name: "加入缤纷水果茶" }).click();
  await page.getByRole("button", { name: /把这份心意送出去/ }).click();
  await switchIdentity(page, "二宝");
  await page.getByRole("button", { name: "订单", exact: true }).click();
  await page.getByRole("button", { name: /接单/ }).click();
  await page.getByRole("button", { name: /开始准备/ }).click();
  await page.getByRole("button", { name: /完成心愿/ }).click();

  // No "save it" step: the onboarding promised this happens on its own.
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  const entry = page.locator(".memory-timeline li", { hasText: "缤纷水果茶" });
  await expect(entry).toBeVisible();
  await expect(entry.getByText("二宝 完成了 大宝 点的")).toBeVisible();
});

test("the partner card shows the other person's week, and never their wallet", async ({ page }) => {
  await enterAs(page, "大宝", {
    "couple-shop-coins:二宝": "137",
    "couple-shop-checkins:二宝": JSON.stringify([shopDay(), shopDay(-1), shopDay(-2)]),
    // +1 morning, +3 focus, +10 date-task = 14 this week.
    "couple-shop-task-claims:二宝": JSON.stringify([`${shopDay()}:morning`, `${shopDay()}:focus`, `${shopDay()}:date-task`]),
  });
  await page.getByRole("button", { name: "任务", exact: true }).click();

  const card = page.locator(".partner-card");
  await expect(card).toBeVisible();
  await expect(card.getByText("二宝这周")).toBeVisible();
  await expect(card.getByText(/今天已经来过小铺了 · 连续 3 天/)).toBeVisible();
  await expect(card.getByText("本周攒了 14 甜心币")).toBeVisible();
  // 二宝's balance is 137; wallets are private and must not surface here.
  await expect(card.getByText("137")).toHaveCount(0);

  // Switching sides flips the card to the other person, with nothing carried over.
  await switchIdentity(page, "二宝");
  await page.getByRole("button", { name: "任务", exact: true }).click();
  await expect(page.locator(".partner-card").getByText("大宝这周")).toBeVisible();
  await expect(page.locator(".partner-card").getByText("今天还没来签到")).toBeVisible();
  await expect(page.locator(".partner-card").getByText("本周攒了 0 甜心币")).toBeVisible();
});

test("a milestone is celebrated once, not on every reload", async ({ page }) => {
  // 100 days in, with the shop's own start date doing the work.
  await enterAs(page, "大宝", {
    "couple-shop-profile": JSON.stringify({
      shopName: "我们的小铺", firstName: "大宝", secondName: "二宝", startedOn: shopDay(-100),
    }),
  });
  await expect(page.getByText("🎉 相爱 100 天")).toBeVisible();

  await page.getByRole("button", { name: "回忆", exact: true }).click();
  const card = page.locator(".milestone-card");
  await expect(card.getByText("相爱 100 天")).toBeVisible();
  await expect(card.getByText(/再 \d+ 个心愿，就是「第 1?0? ?个心愿」|再 \d+ /)).toBeVisible();

  await page.reload();
  await expect(page.getByText("🎉 相爱 100 天")).toHaveCount(0);
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  await expect(page.locator(".milestone-card").getByText("相爱 100 天")).toBeVisible();
});

test("the album explains itself instead of dead-ending", async ({ page }) => {
  await enterAs(page, "大宝");
  await page.getByRole("button", { name: "回忆", exact: true }).click();

  await expect(page.getByText(/照片回忆需要双人空间|本地体验模式没有相册/)).toBeVisible();
  await expect(page.getByText("请先登录并连接双人小铺")).toHaveCount(0);

  // With Supabase configured but unpaired, the card routes to where pairing is.
  await page.locator(".locked-section").getByRole("button", { name: "去连接双人小铺" }).click();
  await expect(page.getByRole("button", { name: /小铺设置/ })).toBeVisible();
  await expect(page.getByText("连接两台 iPhone")).toBeVisible();
});

test("the timeline keeps every finished wish, grouped by month", async ({ page }) => {
  // 22 finished wishes across two months: more than one page, so the older
  // month is only reachable if nothing was silently truncated away.
  const seeded = Array.from({ length: 22 }, (_, index) => {
    const month = index < 12 ? "07" : "08";
    const day = String((index % 12) + 1).padStart(2, "0");
    return {
      id: `seed-${index}`, itemId: "fruit-tea", itemName: `心愿 ${index}`,
      image: "/assets/menu/fruit-tea.png", price: 28, note: "", desiredTime: "尽快",
      from: "大宝", to: "二宝", status: "done",
      createdAt: `2026-${month}-${day}T10:00:00.000Z`,
      completedAt: `2026-${month}-${day}T12:00:00.000Z`,
    };
  });
  await enterAs(page, "大宝", { "couple-shop-orders": JSON.stringify(seeded) });
  await page.getByRole("button", { name: "回忆", exact: true }).click();

  await expect(page.locator(".memory-timeline li")).toHaveCount(20);
  const more = page.getByRole("button", { name: /还有 2 件/ });
  await expect(more).toBeVisible();

  await more.click();
  await expect(page.locator(".memory-timeline li")).toHaveCount(22);
  await expect(page.getByRole("button", { name: /还有/ })).toHaveCount(0);
  // The oldest wish must be reachable, not quietly dropped off the end.
  await expect(page.locator(".memory-timeline li", { hasText: "心愿 0" })).toBeVisible();
  await expect(page.locator(".timeline-month h4")).toHaveCount(2);
});

test("earlier milestones stay readable after the toast is gone", async ({ page }) => {
  // 100 days in with a finished wish: 相爱 100 天 and 第一个心愿 both passed.
  const done = {
    id: "seed-done", itemId: "fruit-tea", itemName: "缤纷水果茶",
    image: "/assets/menu/fruit-tea.png", price: 28, note: "", desiredTime: "尽快",
    from: "大宝", to: "二宝", status: "done",
    createdAt: "2026-09-05T10:00:00.000Z", completedAt: "2026-09-05T12:00:00.000Z",
  };
  await enterAs(page, "大宝", {
    "couple-shop-orders": JSON.stringify([done]),
    "couple-shop-profile": JSON.stringify({
      shopName: "我们的小铺", firstName: "大宝", secondName: "二宝", startedOn: shopDay(-100),
    }),
    // Already congratulated, so nothing pops: the history has to stand alone.
    "couple-shop-milestones:大宝": JSON.stringify(["wishes-1", "days-100"]),
  });
  await page.getByRole("button", { name: "回忆", exact: true }).click();

  const card = page.locator(".milestone-card");
  // Only one milestone headlines the card; the other is out of sight entirely.
  await expect(card.getByText("第一个心愿完成了")).toBeVisible();
  await expect(card.getByText("相爱 100 天")).toHaveCount(0);

  await card.getByRole("button", { name: /看看走过的 2 个里程碑/ }).click();
  await expect(card.getByText("相爱 100 天")).toBeVisible();
  await expect(card.locator(".milestone-history li")).toHaveCount(2);

  await card.getByRole("button", { name: "收起" }).click();
  await expect(card.locator(".milestone-history")).toHaveCount(0);
});

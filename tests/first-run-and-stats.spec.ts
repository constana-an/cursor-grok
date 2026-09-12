import { expect, test } from "@playwright/test";

const doneOrder = (id: string, createdAt: string) => ({
  id,
  itemId: "fruit-tea",
  itemName: "缤纷水果茶",
  price: 28,
  note: "",
  createdAt,
  desiredTime: "尽快",
  status: "done",
  from: "大宝",
  to: "二宝",
});

test("the first run explains the coin gap and hands over the first task", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("couple-shop-lang", "zh");
  });
  await page.reload();
  await page.getByRole("button", { name: /我是大宝/ }).click();

  // One screen, not three: the opening checklist on the shop page covers the
  // steps, so the guide only has to explain the thing the checklist cannot.
  const guide = page.getByRole("dialog", { name: "这间小铺怎么开" });
  await expect(guide).toBeVisible();
  await expect(page.getByRole("button", { name: "下一步" })).toHaveCount(0);

  // A new wallet holds 8 coins and the cheapest wish costs 28: without this
  // block the shop reads as entirely locked.
  await expect(guide.getByText("甜心币从哪来")).toBeVisible();
  await expect(guide.getByText(/最便宜的心愿 28 枚|各再得 20 枚/)).toBeVisible();

  await page.getByRole("button", { name: "去领第一个任务" }).click();
  await expect(page.getByRole("heading", { name: "我的今日任务" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("dialog", { name: "这间小铺怎么开" })).toHaveCount(0);
});

test("the guide opens where it can be seen for a remembered identity", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("couple-shop-lang", "zh");
    localStorage.setItem("couple-shop-identity", "大宝");
  });
  await page.reload();

  // Regression: opening the sheet during the first render put it somewhere the
  // reader could not see, because the container it mounts into did not exist
  // until after that commit.
  await expect(page.getByRole("dialog", { name: "这间小铺怎么开" })).toBeVisible();
  // Where it comes to rest, not where the entrance animation has it right now.
  const viewport = page.viewportSize()!;
  await expect(async () => {
    const sheet = (await page.getByTestId("bottom-sheet").boundingBox())!;
    expect(sheet.y).toBeGreaterThanOrEqual(0);
    expect(sheet.y + sheet.height).toBeLessThanOrEqual(viewport.height + 1);
  }).toPass({ timeout: 4000 });
});

test("the first-run guide can be skipped and stays dismissed", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("couple-shop-lang", "zh");
  });
  await page.reload();
  await page.getByRole("button", { name: /我是二宝/ }).click();
  await page.getByRole("button", { name: "先自己逛逛" }).click();

  await expect(page.getByRole("dialog", { name: "这间小铺怎么开" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "加入缤纷水果茶" })).toBeVisible();
});

test("the opening checklist carries the first run through to a real order", async ({ page }) => {
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

  const checklist = page.getByRole("region", { name: "开张进度" });
  await expect(checklist).toBeVisible();
  // One action shows at a time — whichever is genuinely next — and the rest are
  // a tap away. Which one that is depends on whether this build has cloud
  // config, so assert the shape rather than a particular step.
  await expect(checklist.getByText("下一步")).toBeVisible();
  await expect(checklist.locator(".opening-next-title")).toBeVisible();
  await expect(checklist.locator(".opening-steps li")).toHaveCount(0);

  await checklist.getByRole("button", { name: /看看全部/ }).click();
  await expect(checklist.getByText("身份：大宝")).toBeVisible();
  await expect(checklist.getByText("送出第一个心愿")).toBeVisible();

  // Sending one wish is what finishes the list, so it disappears afterwards.
  await page.getByRole("button", { name: "加入缤纷水果茶" }).click();
  await page.getByRole("button", { name: /把这份心意送出去/ }).click();
  await expect(checklist).toHaveCount(0);
});

test("the unconnected banner is the shortest route to pairing", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("couple-shop-lang", "zh");
    localStorage.setItem("couple-shop-onboarded", "1");
  });
  await page.reload();
  await page.getByRole("button", { name: /我是大宝/ }).click();

  // It used to only say "去「我们」页…" and leave the walking to the reader.
  await expect(page.getByText("点这里创建小铺或输入情侣码")).toBeVisible();
  await page.getByRole("button", { name: "去连接双人小铺", exact: true }).click();
  await expect(page.getByRole("button", { name: /小铺设置/ })).toBeVisible();
});

test("memories count this month in the hero and all time in its own tile", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((orders) => {
    localStorage.clear();
    localStorage.setItem("couple-shop-lang", "zh");
    localStorage.setItem("couple-shop-onboarded", "1");
    localStorage.setItem(
      "couple-shop-orders",
      JSON.stringify([{ ...orders.recent, createdAt: new Date().toISOString() }, orders.old]),
    );
  }, { recent: doneOrder("recent", ""), old: doneOrder("old", "2024-01-05T10:00:00.000Z") });
  await page.reload();
  await page.getByRole("button", { name: /我是大宝/ }).click();
  await page.getByRole("button", { name: "回忆", exact: true }).click();

  // Regression: the hero said "本月" while counting every completed order ever.
  await expect(page.locator(".memory-hero > strong")).toHaveText("1");
  await expect(page.locator(".stats-row div", { hasText: "累计完成" }).locator("strong")).toHaveText("2");
});

test("the checklist never asks for a step this device cannot finish", async ({ page }) => {
  // A browser with no push service: on iPhone Safari that is every visit until
  // the site has been added to the Home Screen.
  await page.addInitScript(() => {
    // @ts-expect-error deleting a capability is the whole point of the fixture
    delete window.PushManager;
  });
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("couple-shop-lang", "zh");
    localStorage.setItem("couple-shop-onboarded", "1");
  });
  await page.reload();
  await page.getByRole("button", { name: /我是大宝/ }).click();

  const checklist = page.locator(".opening-progress");
  await expect(checklist).toBeVisible();
  await checklist.getByRole("button", { name: /看看全部/ }).click();
  // Offering it would leave the step permanently unticked, and the checklist
  // permanently on screen.
  await expect(checklist.getByText("开启消息通知")).toHaveCount(0);
  // Installing is what makes push exist on iOS, so that step is still offered.
  await expect(checklist.getByText("添加到主屏幕", { exact: true })).toBeVisible();

});

test("installing is asked for before notifications, never after", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("couple-shop-lang", "zh");
    localStorage.setItem("couple-shop-onboarded", "1");
  });
  await page.reload();
  await page.getByRole("button", { name: /我是大宝/ }).click();

  await page.getByRole("button", { name: /看看全部/ }).click();
  // On iPhone `PushManager` only exists once the site is on the Home Screen, so
  // an "开启通知" step above "添加到主屏幕" is a step nobody can complete.
  const titles = await page.locator(".opening-steps li strong").allInnerTexts();
  const install = titles.indexOf("添加到主屏幕");
  const push = titles.indexOf("开启消息通知");
  expect(install, "the install step is missing").toBeGreaterThanOrEqual(0);
  if (push >= 0) expect(install).toBeLessThan(push);
});

test("an installed shop stops asking to be installed", async ({ page }) => {
  await page.addInitScript(() => {
    // Spreading a MediaQueryList drops its prototype methods and the runtime
    // calls addEventListener on it, so override the getter instead.
    const real = window.matchMedia.bind(window);
    window.matchMedia = ((query: string) => {
      const list = real(query);
      if (query.includes("display-mode: standalone")) {
        Object.defineProperty(list, "matches", { get: () => true, configurable: true });
      }
      return list;
    }) as typeof window.matchMedia;
  });
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("couple-shop-lang", "zh");
    localStorage.setItem("couple-shop-onboarded", "1");
  });
  await page.reload();
  await page.getByRole("button", { name: /我是大宝/ }).click();

  await expect(page.locator(".opening-progress")).toBeVisible();
  await expect(page.locator(".opening-progress").getByText("添加到主屏幕", { exact: true })).toHaveCount(0);
});

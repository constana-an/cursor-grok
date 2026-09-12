import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("couple-shop-lang", "zh");
    // The first-run guide is a modal; onboarding has its own test.
    localStorage.setItem("couple-shop-onboarded", "1");
  });
  await page.reload();
  await page.getByRole("button", { name: /我是大宝/ }).click();
});

test("account center exposes permanent login and recovery, and hides unconfigured providers", async ({ page }) => {
  await page.getByRole("button", { name: "我们", exact: true }).click();
  await page.getByRole("button", { name: /登录或注册账户|升级试用账户/ }).click();

  await expect(page.getByRole("dialog", { name: /注册账户|登录账户/ })).toBeVisible();
  await expect(page.getByLabel("邮箱")).toBeVisible();
  await expect(page.getByLabel(/密码/)).toBeVisible();
  // SMS and Apple need provider credentials this build does not carry, so the
  // entry points must be absent rather than present-and-failing.
  await expect(page.getByRole("button", { name: /手机号/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Apple/ })).toHaveCount(0);
  await expect(page.getByText("其他登录方式")).toHaveCount(0);

  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("button", { name: "忘记密码？找回账户" }).click();
  await expect(page.getByRole("dialog", { name: "找回账户" })).toBeVisible();
  await expect(page.getByRole("button", { name: "发送重置邮件" })).toBeVisible();
});

test("the membership placeholder stays hidden and export is named for what it does", async ({ page }) => {
  await page.getByRole("button", { name: "我们", exact: true }).click();
  await expect(page.getByRole("button", { name: /基础版/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /导出数据/ })).toBeVisible();
  await expect(page.getByText(/照片只含引用路径/)).toBeVisible();
});

test("memories include check-in and anniversary entry points", async ({ page }) => {
  await page.getByRole("button", { name: "回忆", exact: true }).click();
  await expect(page.getByText("连续签到")).toBeVisible();
  await expect(page.getByRole("button", { name: "签到 +1" })).toBeVisible();

  await page.getByRole("button", { name: "添加", exact: true }).last().click();
  await expect(page.getByRole("dialog", { name: "添加纪念日" })).toBeVisible();
  await expect(page.getByLabel("纪念日名称")).toBeVisible();
  // The form has to carry everything the list renders back, or "管理" would
  // still be a one-way door.
  await expect(page.getByRole("button", { name: "每年重复" })).toBeVisible();
  await expect(page.getByRole("button", { name: "仅这一次" })).toBeVisible();
  await expect(page.getByRole("button", { name: "当天", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "7 天", exact: true })).toBeVisible();
});

test("an unpaired shop explains the album instead of dead-ending in it", async ({ page }) => {
  await page.getByRole("button", { name: "回忆", exact: true }).click();

  // The picker used to open here and then toast 请先登录并连接双人小铺.
  await expect(page.getByRole("button", { name: /收藏第一张合照/ })).toHaveCount(0);
  await expect(page.getByText(/照片回忆需要双人空间|本地体验模式没有相册/)).toBeVisible();
  await expect(page.getByText(/加密/)).toHaveCount(0);
});

test("privacy center explains security and data portability", async ({ page }) => {
  await page.getByRole("button", { name: "我们", exact: true }).click();
  await page.getByRole("button", { name: /隐私协议与账户安全/ }).click();

  await expect(page.getByRole("dialog", { name: "隐私与账户安全" })).toBeVisible();
  await expect(page.getByText("订单、任务、签到", { exact: true })).toBeVisible();
  await expect(page.getByText("关键操作留痕")).toBeVisible();
  await expect(page.getByRole("button", { name: "导出我的数据" })).toBeVisible();
});

test("每种账户模式的标题、说明和主按钮说的是同一件事", async ({ page }) => {
  await page.getByRole("button", { name: "我们", exact: true }).click();
  await page.getByRole("button", { name: /登录或注册账户|升级试用账户/ }).click();

  const sheet = page.getByRole("dialog");
  // Registering: nothing to preserve, so no promise about keeping data.
  await expect(sheet.getByText("注册后换手机登录即可回到这间小铺")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "注册账户", exact: true })).toBeVisible();
  await expect(sheet.getByLabel("设置密码")).toBeVisible();

  await sheet.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "登录账户" })).toBeVisible();
  await expect(sheet.getByText("用注册过的邮箱登录，回到你们的小铺")).toBeVisible();
  // The tab already says 登录; the button must not be the same word.
  await expect(sheet.getByRole("button", { name: "登录并进入小铺" })).toBeVisible();
  await expect(sheet.getByLabel("密码", { exact: true })).toBeVisible();

  await sheet.getByRole("button", { name: "忘记密码？找回账户" }).click();
  await expect(page.getByRole("dialog", { name: "找回账户" })).toBeVisible();
  // The old subtitle talked about anonymous accounts on every one of these.
  await expect(sheet.getByText("输入注册邮箱，我们发一封重置邮件给你")).toBeVisible();
  await expect(sheet.getByText("不再依赖匿名账户")).toHaveCount(0);
});

import { expect, test } from "@playwright/test";

/**
 * Pairing, from the other person's side.
 *
 * The couple code still works, but reading six digits out loud is the slowest
 * way two people who are already texting each other could do this. These hold
 * the shorter route: a link that lands on the page that can act on it, with the
 * code already in the field.
 *
 * The invite sheet's QR is covered by `tests/qr.test.mjs`, which checks the
 * rendered path against a second encode — reaching the sheet here would need a
 * real signed-in cloud session.
 */
const seed = async (page: import("@playwright/test").Page) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("couple-shop-lang", "zh");
    localStorage.setItem("couple-shop-onboarded", "1");
    localStorage.setItem("couple-shop-opening-dismissed", "1");
    localStorage.setItem("couple-shop-identity", "大宝");
  });
};

test("an invitation lands on the page that can act on it, with the code filled in", async ({ page }) => {
  await seed(page);
  await page.goto("/?join=024719");

  // Not the shop: the person who opened this link is here to pair.
  await expect(page.getByRole("button", { name: /小铺设置/ })).toBeVisible();
  await expect(page.getByPlaceholder("输入 6 位情侣码")).toHaveValue("024719");
  await expect(page.getByRole("button", { name: "加入", exact: true })).toBeEnabled();

  // Filled in, never submitted: joining needs an account, and pairing somebody
  // into a shop without them tapping anything is worse than one extra tap.
  await expect(page.getByText("情侣码已填好")).toBeVisible();
  expect(new URL(page.url()).search).toBe("");
});

test("a mangled invitation is ignored rather than half-accepted", async ({ page }) => {
  await seed(page);
  await page.goto("/?join=0247");

  // A part-filled field looks like it came from the invitation.
  await expect(page.getByRole("heading", { name: "点吃的" })).toBeVisible();
  await page.getByRole("button", { name: "我们", exact: true }).click();
  await expect(page.getByPlaceholder("输入 6 位情侣码")).toHaveValue("");
});

test("changing phones is answered on the page, not left to guesswork", async ({ page }) => {
  await seed(page);
  await page.reload();
  await page.getByRole("button", { name: "我们", exact: true }).click();
  await page.getByRole("button", { name: /换手机/ }).click();

  // Without an account there is nothing for the data to follow, and saying so
  // is more use than four steps that would not work.
  await expect(page.getByText("这台手机还没有真正的账号")).toBeVisible();
  await expect(page.getByRole("button", { name: /去注册/ })).toBeVisible();
});

test("push that cannot arrive says what happens instead", async ({ page }) => {
  await seed(page);
  await page.reload();
  await page.getByRole("button", { name: "我们", exact: true }).click();
  // There is no email or SMS channel to fall back to, so the honest answer is
  // where the request still shows up.
  await expect(page.getByText(/没回应的心愿仍然会出现在小铺首页最上面/)).toBeVisible();
});

import { expect, test } from "@playwright/test";

/**
 * Contrast and touch targets, measured on what the browser actually paints
 * rather than on what the stylesheet says: several colours reach the screen
 * through variables and tinted card backgrounds, so only the computed pair is
 * the truth.
 *
 * The secondary palette used to sit at 2.2–2.9:1 against near-white at 11–12px,
 * where AA asks for 4.5:1, and three controls were under the 44pt floor.
 */
const TABS = ["小铺", "任务", "订单", "回忆", "我们"] as const;

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

test("every piece of text meets AA contrast against what is behind it", async ({ page }) => {
  await enter(page);
  const failures: Array<{ fg: string; bg: string; size: number; ratio: number; sample: string }> = [];

  for (const tab of TABS) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    failures.push(...await page.evaluate(() => {
      const luminance = (hex: string) => {
        const parts = hex.match(/\w\w/g)!.map((pair) => {
          const value = parseInt(pair, 16) / 255;
          return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
      };
      const contrast = (a: string, b: string) => {
        const [x, y] = [luminance(a), luminance(b)];
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
      };
      const toHex = (colour: string) => {
        const parts = colour.match(/\d+/g);
        return parts ? parts.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("") : null;
      };

      const bad: Array<{ fg: string; bg: string; size: number; ratio: number; sample: string }> = [];
      for (const element of document.querySelectorAll<HTMLElement>(".screen-content *")) {
        const styles = getComputedStyle(element);
        if (!element.textContent?.trim() || element.children.length) continue;
        let backdrop = "rgb(255, 255, 255)";
        for (let node: HTMLElement | null = element; node && node !== document.body; node = node.parentElement) {
          const painted = getComputedStyle(node).backgroundColor;
          if (painted && painted !== "rgba(0, 0, 0, 0)") { backdrop = painted; break; }
        }
        const fg = toHex(styles.color);
        const bg = toHex(backdrop);
        // White on a gradient reads as white-on-page-background here; the probe
        // cannot see gradients, so those are left to the eye.
        if (!fg || !bg || fg === bg || fg === "ffffff") continue;
        const size = parseFloat(styles.fontSize);
        const ratio = contrast(fg, bg);
        if (ratio < (size >= 18 ? 3 : 4.5)) {
          bad.push({ fg: `#${fg}`, bg: `#${bg}`, size, ratio: Number(ratio.toFixed(2)), sample: element.textContent.trim().slice(0, 12) });
        }
      }
      return bad;
    }));
  }

  expect(failures, `low-contrast text: ${JSON.stringify(failures.slice(0, 5))}`).toEqual([]);
});

test("every control is at least 44pt in both directions", async ({ page }) => {
  await enter(page);
  const small: string[] = [];

  for (const tab of TABS) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    small.push(...await page.evaluate(() => {
      const tooSmall: string[] = [];
      for (const element of document.querySelectorAll<HTMLElement>(".screen-content button, .screen-content a, .screen-content input, .bottom-nav button")) {
        const box = element.getBoundingClientRect();
        if (!box.width) continue;
        if (box.width < 44 || box.height < 44) {
          const label = (element.getAttribute("aria-label") ?? element.innerText ?? "").trim().slice(0, 14);
          tooSmall.push(`${label || element.tagName} ${Math.round(box.width)}x${Math.round(box.height)}`);
        }
      }
      return tooSmall;
    }));
  }

  expect([...new Set(small)]).toEqual([]);
});

test("controls carry a name a screen reader can announce", async ({ page }) => {
  await enter(page);
  for (const tab of TABS) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    const unnamed = await page.evaluate(() => {
      const missing: string[] = [];
      for (const element of document.querySelectorAll<HTMLElement>(".screen-content button, .screen-content input")) {
        if (!element.getBoundingClientRect().width) continue;
        const label = element.getAttribute("aria-label")
          ?? element.getAttribute("placeholder")
          ?? (element.id ? document.querySelector(`label[for="${element.id}"]`)?.textContent : null)
          ?? element.closest("label")?.textContent
          ?? element.innerText;
        if (!label?.trim()) missing.push(`${element.tagName}.${element.className}`);
      }
      return missing;
    });
    expect(unnamed, `${tab} has unnamed controls`).toEqual([]);
  }
});

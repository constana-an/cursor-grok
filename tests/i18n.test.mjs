import assert from "node:assert/strict";
import test from "node:test";

const { LANGS, STRINGS, translate } = await import("../src/lib/i18n.ts");
const { DEFAULT_PROFILE, DEFAULT_PROFILE_EN, localizedPersonName, localizedProfile } = await import("../src/lib/storage.ts");
const {
  MENU,
  TASKS,
  MILESTONES,
  DAILY_PROMPTS,
  WISH_TEMPLATES,
  categoryMeta,
  STATUS_TEXT,
  REQUIREMENT_HINTS,
  MILESTONE_UNITS,
  DESIRED_TIME_OPTIONS,
  localizeDesiredTime,
  localizedItemName,
  milestoneUnitOf,
} = await import("../src/lib/catalog.ts");

/** `{name}` and `{name#one#many}` both name a variable the caller has to supply. */
const variablesIn = (template) => new Set(
  [...template.matchAll(/\{(\w+)(?:#[^#{}]*#[^#{}]*)?\}/g)].map((match) => match[1]),
);

test("both languages answer for exactly the same keys", () => {
  const zhKeys = Object.keys(STRINGS.zh).sort();
  for (const lang of LANGS) {
    assert.deepEqual(Object.keys(STRINGS[lang]).sort(), zhKeys, `${lang} has a different key set`);
  }
});

test("no string is left empty in either language", () => {
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(STRINGS[lang])) {
      // install.step3Post is deliberately empty: Chinese ends the sentence at
      // the bolded words and so does English.
      if (key === "install.step3Post") continue;
      assert.ok(value.trim().length > 0, `${lang}/${key} is empty`);
    }
  }
});

test("a translation never silently drops a value the other language shows", () => {
  // One-directional on purpose: English may add a variable of its own, because
  // "1 wish" and "2 wishes" need the count twice while Chinese needs it once.
  for (const [key, zhValue] of Object.entries(STRINGS.zh)) {
    const expected = variablesIn(zhValue);
    const actual = variablesIn(STRINGS.en[key]);
    for (const name of expected) {
      assert.ok(actual.has(name), `en/${key} drops {${name}}`);
    }
  }
});

test("counted English nouns agree with their number", () => {
  assert.equal(translate("en", "shop.wishCount", { count: 1 }), "1 wish");
  assert.equal(translate("en", "shop.wishCount", { count: 12 }), "12 wishes");
  assert.equal(translate("en", "shop.wishCount", { count: 0 }), "0 wishes");
  assert.equal(translate("zh", "shop.wishCount", { count: 1 }), "1 个心愿");
  assert.equal(translate("en", "anniv.daysLeft", { days: 1 }), "1 day to go");
  assert.equal(translate("en", "anniv.daysLeft", { days: 80 }), "80 days to go");
  assert.equal(milestoneUnitOf("en", "wishes", 1), "wish");
  assert.equal(milestoneUnitOf("en", "wishes", 10), "wishes");
  assert.equal(milestoneUnitOf("zh", "wishes", 1), "个心愿");
});

test("a missing value stays visible instead of printing undefined", () => {
  assert.equal(translate("en", "shop.wishCount", {}), "{count} {count#wish#wishes}");
  assert.equal(translate("zh", "toast.randomPick"), "今天就选「{name}」");
});

test("every shipped catalogue entry carries both languages", () => {
  for (const item of MENU) {
    assert.ok(item.en?.name?.trim(), `${item.id} has no English name`);
    assert.ok(item.en?.description?.trim(), `${item.id} has no English description`);
  }
  for (const task of TASKS) {
    assert.ok(task.en?.title?.trim() && task.en?.description?.trim(), `${task.id} is missing English`);
  }
  for (const milestone of MILESTONES) {
    assert.ok(milestone.en?.title?.trim() && milestone.en?.body?.trim(), `${milestone.id} is missing English`);
  }
  for (const prompt of DAILY_PROMPTS) {
    assert.ok(prompt.en?.topic?.trim() && prompt.en?.action?.trim(), `"${prompt.topic}" is missing English`);
  }
  for (const template of WISH_TEMPLATES) {
    assert.ok(template.en?.name?.trim() && template.en?.description?.trim(), `"${template.name}" is missing English`);
  }
  for (const meta of categoryMeta) {
    assert.ok(meta.en?.label?.trim() && meta.en?.subtitle?.trim(), `${meta.id} is missing English`);
  }
  for (const lang of LANGS) {
    for (const status of ["pending", "accepted", "doing", "done", "rejected", "cancelled"]) {
      assert.ok(STATUS_TEXT[lang][status]?.trim(), `${lang} has no ${status} label`);
    }
    for (const requirement of ["photo", "order-done", "date-done"]) {
      assert.ok(REQUIREMENT_HINTS[lang][requirement]?.trim(), `${lang} has no ${requirement} hint`);
    }
    for (const kind of ["days", "wishes", "streak"]) {
      assert.ok(MILESTONE_UNITS[lang][kind]?.trim(), `${lang} has no ${kind} unit`);
    }
    for (const option of DESIRED_TIME_OPTIONS) {
      assert.ok(option[lang]?.trim(), `a desired time is missing ${lang}`);
    }
  }
});

test("an order placed in one language is readable in the other", () => {
  // Both phones write into the same rows, so what one partner stored has to
  // come back out in whichever language the other is reading.
  assert.equal(localizedItemName({ itemId: "fruit-tea", itemName: "缤纷水果茶" }, "en"), "Fruit Tea, Full Cup");
  assert.equal(localizedItemName({ itemId: "fruit-tea", itemName: "缤纷水果茶" }, "zh"), "缤纷水果茶");
  assert.equal(localizeDesiredTime("今晚", "en"), "Tonight");
  assert.equal(localizeDesiredTime("Tonight", "zh"), "今晚");
});

test("words the couple wrote themselves are never restated", () => {
  // A custom wish has no `en`, and a time they typed matches no option, so both
  // come back exactly as written whichever language is on screen.
  assert.equal(localizedItemName({ itemId: "custom-123", itemName: "陪我去菜市场" }, "en"), "陪我去菜市场");
  assert.equal(localizeDesiredTime("周六下午三点", "en"), "周六下午三点");
});

test("the shipped default names are the shop's words, and carry both languages", () => {
  // Nobody typed 大宝 / 二宝 / 我们的小铺 — they are what a brand-new shop is
  // handed, so they are shipped copy and read in the reader's language.
  assert.equal(localizedPersonName(DEFAULT_PROFILE.firstName, "en"), DEFAULT_PROFILE_EN.firstName);
  assert.equal(localizedPersonName(DEFAULT_PROFILE.secondName, "en"), DEFAULT_PROFILE_EN.secondName);
  assert.equal(localizedPersonName(DEFAULT_PROFILE.firstName, "zh"), DEFAULT_PROFILE.firstName);

  const shown = localizedProfile({ ...DEFAULT_PROFILE, startedOn: "2026-01-01" }, "en");
  assert.equal(shown.shopName, DEFAULT_PROFILE_EN.shopName);
  assert.equal(shown.startedOn, "2026-01-01");
});

test("a name either of them typed is never restated, in either direction", () => {
  assert.equal(localizedPersonName("阿梨", "en"), "阿梨");
  assert.equal(localizedPersonName("Sweetie", "zh"), "Sweetie");
  const renamed = localizedProfile({ shopName: "梨子铺", firstName: "阿梨", secondName: "小满", startedOn: "2026-01-01" }, "en");
  assert.deepEqual(renamed, { shopName: "梨子铺", firstName: "阿梨", secondName: "小满", startedOn: "2026-01-01" });
});

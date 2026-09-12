/**
 * End-to-end checks against a real Supabase project, with two accounts that
 * actually pair with each other. Everything the local suites cannot reach lives
 * here: RLS between the two partners, the SECURITY DEFINER economy, the direct
 * write lockdown, shared anniversary management and the push subscription table.
 *
 * Opt-in — `npm run test:cloud` with a **test** project's credentials:
 *
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_ANON_KEY=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   npm run test:cloud
 *
 * The service role key creates and later deletes the throwaway accounts and
 * tops up a wallet, because a fresh profile opens at 8 coins and the cheapest
 * wish costs 28. Never point this at the project two real people are using: it
 * creates orders, memories and anniversaries, and it deletes the accounts it
 * made on the way out.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = url && anonKey && serviceKey
  ? false
  : "set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY to run";

const PASSWORD = "couple-shop-test-9F2x";
const stamp = Date.now();
const emails = {
  a: `couple-shop-a-${stamp}@example.com`,
  b: `couple-shop-b-${stamp}@example.com`,
  outsider: `couple-shop-c-${stamp}@example.com`,
};

describe("cloud integration", { skip }, () => {
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const session = { a: null, b: null, outsider: null };
  const users = { a: null, b: null, outsider: null };
  let coupleId = null;
  let orderId = null;

  const signedInClient = async (email) => {
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    assert.equal(error, null, `sign-in failed for ${email}: ${error?.message}`);
    return client;
  };

  const placeOrder = async (client, { itemId = "fruit-tea", itemName = "缤纷水果茶", price = 28, from, to }) => {
    const id = crypto.randomUUID();
    const { data, error } = await client
      .rpc("place_couple_order", {
        p_id: id,
        p_item_id: itemId,
        p_item_name: itemName,
        p_image_url: null,
        p_price: price,
        p_note: "",
        p_desired_time: "尽快",
        p_from_name: from,
        p_to_name: to,
      })
      .single();
    return { id, data, error };
  };

  const balanceOf = async (client) => {
    const { data } = await client.from("profiles").select("coin_balance").maybeSingle();
    return data?.coin_balance ?? null;
  };

  before(async () => {
    for (const key of ["a", "b", "outsider"]) {
      const { data, error } = await admin.auth.admin.createUser({ email: emails[key], password: PASSWORD, email_confirm: true });
      assert.equal(error, null, `could not create ${emails[key]}: ${error?.message}`);
      users[key] = data.user;
      session[key] = await signedInClient(emails[key]);
    }

    const { data: created, error: createError } = await session.a.rpc("create_couple_space", { display_name: "大宝" }).single();
    assert.equal(createError, null, `create_couple_space failed: ${createError?.message}`);
    coupleId = created.couple_id;

    const { error: joinError } = await session.b.rpc("join_couple_space", { code: created.invite_code, display_name: "二宝" }).single();
    assert.equal(joinError, null, `join_couple_space failed: ${joinError?.message}`);

    // A fresh wallet holds 8 coins; the wishes below cost more than that.
    const { error: topUpError } = await admin.from("profiles").update({ coin_balance: 400 }).eq("user_id", users.a.id);
    assert.equal(topUpError, null);
  });

  after(async () => {
    // delete_my_account removes the account and, once the shop is empty, the
    // couple's shared rows with it.
    for (const key of ["a", "b", "outsider"]) {
      await session[key]?.rpc("delete_my_account").then(undefined, () => undefined);
      await admin.auth.admin.deleteUser(users[key]?.id ?? "").catch(() => undefined);
    }
  });

  it("pairs the two accounts into one couple", async () => {
    const { data: profileA } = await session.a.from("profiles").select("couple_id, display_name").maybeSingle();
    const { data: profileB } = await session.b.from("profiles").select("couple_id, display_name").maybeSingle();
    assert.equal(profileA.couple_id, coupleId);
    assert.equal(profileB.couple_id, coupleId);
    assert.equal(profileA.display_name, "大宝");
    assert.equal(profileB.display_name, "二宝");
  });

  it("pays both partners the pairing bonus exactly once", async () => {
    // 8 opening coins + 20 makes the cheapest wish reachable the same evening,
    // which is the difference between a first run that ends in an order and one
    // that ends in "come back in four days".
    const { data: rows } = await admin.from("profiles").select("user_id, coin_balance")
      .in("user_id", [users.a.id, users.b.id]);
    // The 400-coin top-up in `before` lands on A, so check B and the couple row.
    assert.equal(rows.find((row) => row.user_id === users.b.id).coin_balance, 28);
    const { data: couple } = await admin.from("couples").select("pairing_bonus_at").eq("id", coupleId).single();
    assert.notEqual(couple.pairing_bonus_at, null);

    // Re-joining the same couple must not pay it again.
    const { data: inviteRow } = await admin.from("couples").select("invite_code").eq("id", coupleId).single();
    await session.b.rpc("join_couple_space", { code: inviteRow.invite_code, display_name: "二宝" });
    const { data: after } = await admin.from("profiles").select("coin_balance").eq("user_id", users.b.id).single();
    assert.equal(after.coin_balance, 28, "the bonus must be once per couple, not once per join");
  });

  it("keeps each wallet private to its owner", async () => {
    // profiles RLS is `user_id = auth.uid()`, so a select returns one row: mine.
    const { data: rows } = await session.a.from("profiles").select("user_id, coin_balance");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_id, users.a.id);
  });

  it("shows each partner the other's week without their wallet", async () => {
    // B earns something so there is a number to see.
    const { error: claimError } = await session.b.rpc("claim_couple_task", { p_task_id: "morning" }).single();
    assert.equal(claimError, null, `claim_couple_task failed: ${claimError?.message}`);
    await session.b.rpc("daily_checkin").single();

    const { data, error } = await session.a.rpc("get_partner_status").maybeSingle();
    assert.equal(error, null, `get_partner_status failed: ${error?.message}`);
    assert.equal(data.display_name, "二宝");
    assert.equal(data.earned_this_week, 1, "the +1 morning task is this week's only claim");
    assert.equal(data.checked_today, true);
    assert.ok(data.streak >= 1);
    // The whole point of the function: it is a window, not an open door.
    assert.equal("coin_balance" in data, false, "the partner window must never carry a balance");
  });

  it("caps how many wishes one couple can write", async () => {
    const { data: existing } = await session.a.from("custom_menu_items").select("id");
    const room = 30 - existing.length;
    const rows = Array.from({ length: room }, (_, index) => ({
      couple_id: coupleId, created_by: users.a.id, category: "food",
      name: `填充心愿 ${index}`, description: "", price: 30,
    }));
    if (rows.length) {
      const { error } = await session.a.from("custom_menu_items").insert(rows);
      assert.equal(error, null, `filling to the cap failed: ${error?.message}`);
    }
    const { error: overflow } = await session.a.from("custom_menu_items").insert({
      couple_id: coupleId, created_by: users.a.id, category: "food",
      name: "第 31 个", description: "", price: 30,
    });
    assert.match(overflow?.message ?? "", /custom wish limit reached/);
    await admin.from("custom_menu_items").delete().eq("couple_id", coupleId);
  });

  it("debits the sender's own wallet when an order is placed", async () => {
    const before = await balanceOf(session.a);
    // Measured, not assumed: the opening balance, the pairing bonus and any
    // task an earlier case claimed all move this number, and hard-coding it
    // makes the test fail for reasons that have nothing to do with paying.
    const partnerBefore = await balanceOf(session.b);
    const { id, error } = await placeOrder(session.a, { from: "大宝", to: "二宝" });
    assert.equal(error, null, `place_couple_order failed: ${error?.message}`);
    orderId = id;
    assert.equal(await balanceOf(session.a), before - 28);
    // The recipient never pays for a wish they were given.
    assert.equal(await balanceOf(session.b), partnerBefore);
  });

  it("shows the order to the partner and to nobody else", async () => {
    const { data: partnerView } = await session.b.from("orders").select("id").eq("id", orderId);
    assert.equal(partnerView.length, 1);
    const { data: outsiderView } = await session.outsider.from("orders").select("id").eq("id", orderId);
    assert.equal(outsiderView.length, 0);
  });

  it("refuses every direct write to orders", async () => {
    // The insert/update privileges are revoked, so PostgREST rejects these
    // outright rather than silently filtering them.
    const { error: updateError } = await session.b.from("orders").update({ status: "done" }).eq("id", orderId);
    assert.notEqual(updateError, null, "a direct status update must be denied");
    const { error: insertError } = await session.a.from("orders").insert({
      id: crypto.randomUUID(),
      couple_id: coupleId,
      created_by: users.a.id,
      item_id: "fruit-tea",
      item_name: "缤纷水果茶",
      price: 0,
      desired_time: "尽快",
      from_name: "大宝",
      to_name: "二宝",
    });
    assert.notEqual(insertError, null, "a free hand-written order must be denied");
  });

  it("lets only the recipient move an order, one legal step at a time", async () => {
    const { error: senderError } = await session.a.rpc("update_order_status", { p_order_id: orderId, p_status: "accepted" });
    assert.match(senderError?.message ?? "", /not the recipient/);

    const { error: jumpError } = await session.b.rpc("update_order_status", { p_order_id: orderId, p_status: "done" });
    assert.match(jumpError?.message ?? "", /invalid transition/);

    for (const status of ["accepted", "doing", "done"]) {
      const { error } = await session.b.rpc("update_order_status", { p_order_id: orderId, p_status: status });
      assert.equal(error, null, `${status} failed: ${error?.message}`);
    }
    const { data: finished } = await session.b.from("orders").select("status, completed_at").eq("id", orderId).single();
    assert.equal(finished.status, "done");
    assert.notEqual(finished.completed_at, null, "finishing an order must stamp completed_at");
  });

  it("lets the sender withdraw an unanswered wish, and nobody else", async () => {
    const before = await balanceOf(session.a);
    const { id, error } = await placeOrder(session.a, { from: "大宝", to: "二宝" });
    assert.equal(error, null);

    // The recipient may decline it, but withdrawing belongs to whoever paid.
    const { error: partnerError } = await session.b.rpc("cancel_couple_order", { p_order_id: id });
    assert.match(partnerError?.message ?? "", /not the sender/);

    const { data, error: cancelError } = await session.a.rpc("cancel_couple_order", { p_order_id: id }).single();
    assert.equal(cancelError, null, `cancel failed: ${cancelError?.message}`);
    assert.equal(data.order_status, "cancelled");
    assert.equal(await balanceOf(session.a), before);

    // Only while it is still unanswered — an accepted wish is a promise.
    const { error: repeat } = await session.a.rpc("cancel_couple_order", { p_order_id: id });
    assert.match(repeat?.message ?? "", /invalid transition/);
  });

  it("releases a limited coupon when its order is withdrawn", async () => {
    const coupon = { itemId: "wish", itemName: "任性愿望券", price: 360 };
    const { id, error } = await placeOrder(session.a, { ...coupon, from: "大宝", to: "二宝" });
    assert.equal(error, null, `coupon order failed: ${error?.message}`);

    const { error: blocked } = await placeOrder(session.a, { ...coupon, from: "大宝", to: "二宝" });
    assert.match(blocked?.message ?? "", /limited item already used/);

    await session.a.rpc("cancel_couple_order", { p_order_id: id });
    // Withdrawing must give the once-per-couple coupon back, not burn it.
    const { id: retryId, error: retryError } = await placeOrder(session.a, { ...coupon, from: "大宝", to: "二宝" });
    assert.equal(retryError, null, `the coupon should be available again: ${retryError?.message}`);
    await session.a.rpc("cancel_couple_order", { p_order_id: retryId });
  });

  it("records the reason a wish was declined", async () => {
    const { id, error } = await placeOrder(session.a, { from: "大宝", to: "二宝" });
    assert.equal(error, null);
    const { error: declineError } = await session.b.rpc("update_order_status", {
      p_order_id: id,
      p_status: "rejected",
      p_note: "今天太累了，明天补给你",
    });
    assert.equal(declineError, null, `decline with a note failed: ${declineError?.message}`);
    const { data } = await session.a.from("orders").select("decline_note").eq("id", id).single();
    assert.equal(data.decline_note, "今天太累了，明天补给你");
  });

  it("refunds the payer when the recipient declines", async () => {
    const before = await balanceOf(session.a);
    const { id, error } = await placeOrder(session.a, { from: "大宝", to: "二宝" });
    assert.equal(error, null);
    assert.equal(await balanceOf(session.a), before - 28);
    const { error: rejectError } = await session.b.rpc("update_order_status", { p_order_id: id, p_status: "rejected" });
    assert.equal(rejectError, null);
    assert.equal(await balanceOf(session.a), before);
  });

  it("pays the weekly order task only to the partner who finished a wish", async () => {
    // 大宝 only asked for it, so 大宝's copy of the task is not earned.
    const { error: senderClaim } = await session.a.rpc("claim_couple_task", { p_task_id: "order-task" });
    assert.match(senderClaim?.message ?? "", /requirement not met/);

    const before = await balanceOf(session.b);
    const { data, error } = await session.b.rpc("claim_couple_task", { p_task_id: "order-task" }).single();
    assert.equal(error, null, `claim failed: ${error?.message}`);
    assert.equal(data.coin_balance, before + 8);

    // The same period cannot be claimed twice.
    const { error: repeat } = await session.b.rpc("claim_couple_task", { p_task_id: "order-task" });
    assert.notEqual(repeat, null);
  });

  it("refuses the date task until a 去约会 wish has been finished", async () => {
    const { error } = await session.b.rpc("claim_couple_task", { p_task_id: "date-task" });
    assert.match(error?.message ?? "", /requirement not met/);

    const { id, error: orderError } = await placeOrder(session.a, { itemId: "movie", itemName: "电影之夜", price: 88, from: "大宝", to: "二宝" });
    assert.equal(orderError, null, `date order failed: ${orderError?.message}`);
    for (const status of ["accepted", "doing", "done"]) {
      await session.b.rpc("update_order_status", { p_order_id: id, p_status: status });
    }
    const { error: afterError } = await session.b.rpc("claim_couple_task", { p_task_id: "date-task" });
    assert.equal(afterError, null, `date task should unlock: ${afterError?.message}`);
  });

  it("refuses the photo task until this person has uploaded a photo", async () => {
    const { error: before } = await session.b.rpc("claim_couple_task", { p_task_id: "photo" });
    assert.match(before?.message ?? "", /requirement not met/);

    const { error: insertError } = await session.b.from("memory_entries").insert({
      couple_id: coupleId,
      created_by: users.b.id,
      caption: "本周合照",
      happened_on: new Date().toISOString().slice(0, 10),
    });
    assert.equal(insertError, null, `memory insert failed: ${insertError?.message}`);

    const { error: after } = await session.b.rpc("claim_couple_task", { p_task_id: "photo" });
    assert.equal(after, null, `photo task should unlock: ${after?.message}`);
  });

  it("lets only the uploader edit or delete a memory", async () => {
    const { data: mine } = await session.b.from("memory_entries").select("id").eq("created_by", users.b.id).limit(1).single();

    const { data: partnerEdit } = await session.a.from("memory_entries").update({ caption: "改别人的" }).eq("id", mine.id).select("id");
    assert.equal(partnerEdit.length, 0, "the partner must not rewrite someone else's caption");
    const { data: partnerDelete } = await session.a.from("memory_entries").delete().eq("id", mine.id).select("id");
    assert.equal(partnerDelete.length, 0, "the partner must not delete someone else's memory");

    const { data: ownEdit, error } = await session.b.from("memory_entries").update({ caption: "改我自己的" }).eq("id", mine.id).select("caption");
    assert.equal(error, null, `own update failed — is the update grant missing? ${error?.message}`);
    assert.equal(ownEdit[0].caption, "改我自己的");

    const { data: outsiderView } = await session.outsider.from("memory_entries").select("id").eq("id", mine.id);
    assert.equal(outsiderView.length, 0);
  });

  it("lets both partners manage a shared anniversary", async () => {
    const id = crypto.randomUUID();
    const { error: insertError } = await session.a.from("anniversaries").insert({
      id,
      couple_id: coupleId,
      created_by: users.a.id,
      title: "第一次见面",
      event_date: "2024-05-20",
      repeats_yearly: true,
      reminder_days: 3,
    });
    assert.equal(insertError, null, `anniversary insert failed: ${insertError?.message}`);

    // Regression: the original policy only let the author edit it.
    const { data: partnerEdit, error: updateError } = await session.b
      .from("anniversaries").update({ reminder_days: 7 }).eq("id", id).select("reminder_days");
    assert.equal(updateError, null, `partner update failed: ${updateError?.message}`);
    assert.equal(partnerEdit[0].reminder_days, 7);

    const { data: outsiderView } = await session.outsider.from("anniversaries").select("id").eq("id", id);
    assert.equal(outsiderView.length, 0);

    const { data: partnerDelete } = await session.b.from("anniversaries").delete().eq("id", id).select("id");
    assert.equal(partnerDelete.length, 1);
  });

  it("charges a custom wish at the price stored on the row, not the one sent", async () => {
    const { data: wish, error: insertError } = await session.a
      .from("custom_menu_items")
      .insert({ couple_id: coupleId, created_by: users.a.id, category: "date", name: "夜市散步", description: "吃一路，走一路", price: 40 })
      .select("id")
      .single();
    assert.equal(insertError, null, `custom wish insert failed: ${insertError?.message}`);

    const { data: partnerView } = await session.b.from("custom_menu_items").select("id, price").eq("id", wish.id);
    assert.equal(partnerView.length, 1, "the partner shops from the same menu");
    const { data: outsiderView } = await session.outsider.from("custom_menu_items").select("id").eq("id", wish.id);
    assert.equal(outsiderView.length, 0);

    const before = await balanceOf(session.a);
    // The caller claims it costs 1 coin. The row says 40, and the row wins.
    const { id, error } = await placeOrder(session.a, { itemId: wish.id, itemName: "夜市散步", price: 1, from: "大宝", to: "二宝" });
    assert.equal(error, null, `custom order failed: ${error?.message}`);
    assert.equal(await balanceOf(session.a), before - 40);

    const { data: placed } = await session.a.from("orders").select("price, item_category").eq("id", id).single();
    assert.equal(placed.price, 40);
    assert.equal(placed.item_category, "date", "the order must remember what kind of wish it was");

    // Either partner may retire a wish they share.
    const { data: retired } = await session.b.from("custom_menu_items").delete().eq("id", wish.id).select("id");
    assert.equal(retired.length, 1);
    const { data: history } = await session.a.from("orders").select("item_name, price").eq("id", id).single();
    assert.equal(history.item_name, "夜市散步", "retiring a wish must not rewrite orders already placed");
    assert.equal(history.price, 40);
  });

  it("refuses an order for a wish belonging to another couple", async () => {
    const { data: wish } = await session.a
      .from("custom_menu_items")
      .insert({ couple_id: coupleId, created_by: users.a.id, category: "food", name: "只属于我们", description: "", price: 20 })
      .select("id")
      .single();
    const { error } = await placeOrder(session.outsider, { itemId: wish.id, itemName: "偷来的", price: 20, from: "路人", to: "路人" });
    assert.notEqual(error, null, "an outsider must not be able to order it");
    await session.a.from("custom_menu_items").delete().eq("id", wish.id);
  });

  it("keeps a push subscription readable only by the device that made it", async () => {
    const endpoint = `https://example.com/push/${stamp}`;
    const { error } = await session.a.from("push_subscriptions").upsert(
      { user_id: users.a.id, couple_id: coupleId, endpoint, p256dh: "test-key", auth: "test-auth" },
      { onConflict: "endpoint" },
    );
    assert.equal(error, null, `push subscription upsert failed: ${error?.message}`);

    const { data: partnerView } = await session.b.from("push_subscriptions").select("endpoint").eq("endpoint", endpoint);
    assert.equal(partnerView.length, 0, "a partner must not read the other's push endpoint");

    const { error: hijack } = await session.b.from("push_subscriptions").upsert(
      { user_id: users.a.id, couple_id: coupleId, endpoint, p256dh: "stolen", auth: "stolen" },
      { onConflict: "endpoint" },
    );
    assert.notEqual(hijack, null, "a partner must not overwrite the other's subscription");
  });

  it("reaches the notify-partner function and reports what it actually sent", async () => {
    const { id, error } = await placeOrder(session.a, { itemId: "hug", itemName: "十分钟抱抱", price: 48, from: "大宝", to: "二宝" });
    assert.equal(error, null);
    const { data, error: invokeError } = await session.a.functions.invoke("notify-partner", { body: { orderId: id } });
    assert.equal(
      invokeError,
      null,
      `notify-partner rejected the call — deploy the Edge Function and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY: ${invokeError?.message}`,
    );
    // The client can only tell the truth about delivery if the function reports it.
    assert.deepEqual(Object.keys(data).sort(), ["delivered", "pruned", "subscribed"]);

    // Status events go back to the sender, which is what the app now relies on.
    const { error: statusError } = await session.b.functions.invoke("notify-partner", { body: { orderId: id, event: "order.rejected" } });
    assert.equal(statusError, null, `a status event must be accepted: ${statusError?.message}`);

    const { error: unknownEvent } = await session.a.functions.invoke("notify-partner", { body: { orderId: id, event: "order.exploded" } });
    assert.notEqual(unknownEvent, null, "an unknown event must be refused");

    // maybeSingle: this used to throw and surface as a 500 instead of a 403.
    const { error: outsiderError } = await session.outsider.functions.invoke("notify-partner", { body: { orderId: id } });
    assert.notEqual(outsiderError, null, "an outsider must not be able to notify this couple");
  });

  it("prunes a push endpoint the push service has retired", async () => {
    // The fake endpoint inserted earlier cannot receive anything; web-push
    // reports it gone, and the row has to go with it — otherwise the app keeps
    // reporting that it notified a device that no longer exists.
    const endpoint = `https://example.com/push/${stamp}`;
    const { data: before } = await session.a.from("push_subscriptions").select("endpoint").eq("endpoint", endpoint);
    assert.equal(before.length, 1, "the earlier test should have left this row in place");

    // 二宝's wallet only holds the task rewards earned above, so keep it cheap.
    const { id } = await placeOrder(session.b, { from: "二宝", to: "大宝" });
    await session.b.functions.invoke("notify-partner", { body: { orderId: id } });

    const { data: after } = await session.a.from("push_subscriptions").select("endpoint").eq("endpoint", endpoint);
    assert.equal(after.length, 0, "a dead endpoint must be deleted, not retried forever");
  });
});

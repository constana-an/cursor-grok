import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n")
  .filter(l => l.includes("=") && !l.startsWith("#")).map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const email = `probe-${Date.now()}@couple-shop-probe.test`;
const { data: su, error: se } = await c.auth.signUp({ email, password: "probe-pass-12345" });
if (se) { console.log("注册失败:", se.message); process.exit(1); }
if (!su.session) { console.log("注册成功但需邮箱验证，无法继续（残留账号:", email, "）"); process.exit(2); }
console.log("一次性账号已建立并登录\n");

const { error: ce } = await c.rpc("create_couple_space", { display_name: "探针" }).single();
console.log(`  create_couple_space  -> ${ce ? "✗ " + ce.message : "✓"}`);
for (const t of ["profiles", "orders", "couples", "task_claims", "menu_catalog", "custom_menu_items", "anniversaries", "memory_entries", "daily_checkins"]) {
  const { error } = await c.from(t).select("*").limit(1);
  console.log(`  select ${t.padEnd(18)} -> ${error ? "✗ " + error.message : "✓"}`);
}
const { data: ps, error: pe } = await c.rpc("get_partner_status").maybeSingle();
console.log(`  get_partner_status   -> ${pe ? "✗ " + pe.message : `✓ 未配对时返回 ${JSON.stringify(ps)}`}`);
const { error: oe } = await c.rpc("place_couple_order", {
  p_id: crypto.randomUUID(), p_item_id: "fruit-tea", p_item_name: "x", p_image_url: null,
  p_price: 28, p_note: "", p_desired_time: "尽快", p_from_name: "探针", p_to_name: "对方" });
console.log(`  place_couple_order   -> ${oe ? (/insufficient balance/.test(oe.message) ? "✓ 函数在，按预期拒绝（8 币买不起 28）" : "✗ " + oe.message) : "✓ 下单成功"}`);
const { error: we } = await c.from("profiles").update({ coin_balance: 9999 }).neq("user_id", "00000000-0000-0000-0000-000000000000");
console.log(`  直接改余额（应被拒） -> ${we ? "✓ 已拒绝: " + we.message.slice(0, 40) : "✗ 居然成功了！"}`);

const { error: de } = await c.rpc("delete_my_account");
console.log(`\n清理: ${de ? "✗ " + de.message + "（残留 " + email + "）" : "✓ 一次性账号已删除"}`);

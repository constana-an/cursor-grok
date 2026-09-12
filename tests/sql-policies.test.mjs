import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");

/** The SQL a fresh project runs, in the order the README tells you to run it. */
function sqlInApplyOrder() {
  const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
  return files.map((name) => readFileSync(join(migrationsDir, name), "utf8")).join("\n");
}

/**
 * Replays every create/drop policy statement in order and returns the policies
 * a project ends up with, as `table -> policy name -> command`.
 */
function finalPolicies() {
  const statement = /(create|drop)\s+policy(?:\s+if\s+exists)?\s+"([^"]+)"\s+on\s+public\.(\w+)(?:\s+for\s+(select|insert|update|delete|all))?/gi;
  const tables = new Map();
  for (const [, action, name, table, command] of sqlInApplyOrder().matchAll(statement)) {
    if (!tables.has(table)) tables.set(table, new Map());
    if (action.toLowerCase() === "drop") tables.get(table).delete(name);
    else tables.get(table).set(name, command.toLowerCase());
  }
  return tables;
}

const commandsOn = (table) => [...(finalPolicies().get(table) ?? new Map()).values()];

/** The policy body a project ends up with — later migrations replace earlier ones. */
function lastPolicyStatement(table, command) {
  const statements = [...sqlInApplyOrder().matchAll(
    new RegExp(`create policy "[^"]+" on public\\.${table} for ${command}[\\s\\S]*?;`, "gi"),
  )];
  return statements.at(-1)?.[0] ?? null;
}

/**
 * Replays the table-level grants and revokes for `authenticated`, which is the
 * role PostgREST uses for a signed-in client.
 */
function grantsFor(table) {
  const statement = /(grant|revoke)\s+((?:select|insert|update|delete|all)(?:\s*,\s*(?:select|insert|update|delete|all))*)\s+on\s+((?:public\.\w+\s*,?\s*)+?)\s+(?:to|from)\s+([\w\s,]+);/gi;
  const granted = new Set();
  for (const [, action, commands, tables, roles] of sqlInApplyOrder().matchAll(statement)) {
    if (!tables.split(",").some((name) => name.trim() === `public.${table}`)) continue;
    if (!roles.split(",").some((role) => role.trim() === "authenticated")) continue;
    for (const command of commands.split(",").map((value) => value.trim().toLowerCase())) {
      if (action.toLowerCase() === "grant") granted.add(command);
      else granted.delete(command);
    }
  }
  return granted;
}

test("every client write policy is backed by the matching table grant", () => {
  // Regression: Postgres checks table privileges *before* RLS. The first
  // version of the memory editor shipped an `update own memories` policy while
  // 20260910060000 only granted `insert, delete` on memory_entries, so the edit
  // died as "permission denied for table memory_entries" wherever Supabase's
  // default privileges were not in force — the policy alone proves nothing.
  for (const [table, policies] of finalPolicies()) {
    for (const command of new Set(policies.values())) {
      if (command === "select" || command === "all") continue;
      const granted = grantsFor(table);
      assert.ok(
        granted.has(command) || granted.has("all"),
        `public.${table} has a ${command} policy but no GRANT ${command} to authenticated`,
      );
    }
  }
});

test("a device can retire its own push subscription", () => {
  // The `for all` policy always allowed it, but the table privilege was never
  // granted explicitly — so sign-out could not delete the row, and the phone
  // kept receiving that couple's pushes. The grant test above skips `all`
  // policies, which is why this needs its own case.
  const granted = grantsFor("push_subscriptions");
  for (const command of ["select", "insert", "update", "delete"]) {
    assert.ok(granted.has(command) || granted.has("all"), `push_subscriptions needs GRANT ${command}`);
  }
});

test("orders can only be written through the audited RPCs", () => {
  // place_couple_order and update_order_status are SECURITY DEFINER: they debit
  // the wallet, enforce the state machine and refund a decline. A direct write
  // path would bypass all of it, so the table stays read-only to clients.
  assert.deepEqual(commandsOn("orders"), ["select"]);
  for (const command of ["insert", "update", "delete"]) {
    assert.ok(!grantsFor("orders").has(command), `orders must not grant ${command} to authenticated`);
  }
});

test("balances and reward ledgers are read-only to the client", () => {
  // Every coin movement runs inside a SECURITY DEFINER function. A write policy
  // on any of these would let an account credit its own wallet over PostgREST.
  for (const table of ["profiles", "task_claims", "daily_checkins", "memberships", "membership_plans"]) {
    assert.deepEqual(commandsOn(table), ["select"], `${table} must stay select-only`);
  }
});

test("both partners can manage the couple's shared anniversaries", () => {
  // The original `for all` policy checked created_by in its WITH CHECK, which
  // UPDATE also evaluates, so one partner's "管理" button silently did nothing.
  assert.deepEqual([...finalPolicies().get("anniversaries").values()].sort(), ["delete", "insert", "select", "update"]);
  // Neither half of the update rule may narrow to the row's author.
  assert.doesNotMatch(lastPolicyStatement("anniversaries", "update"), /created_by/i);
  assert.doesNotMatch(lastPolicyStatement("anniversaries", "delete"), /created_by/i);
  // Creating one still pins authorship to the caller.
  assert.match(lastPolicyStatement("anniversaries", "insert"), /created_by = auth\.uid\(\)/i);
});

test("a couple's own wishes are shared, and priced by the server", () => {
  assert.deepEqual([...finalPolicies().get("custom_menu_items").values()].sort(), ["delete", "insert", "select", "update"]);
  // Either partner runs the shop, so neither edit nor delete narrows to the author.
  assert.doesNotMatch(lastPolicyStatement("custom_menu_items", "update"), /created_by/i);
  assert.doesNotMatch(lastPolicyStatement("custom_menu_items", "delete"), /created_by/i);
  const sql = sqlInApplyOrder();
  // place_couple_order must read the price off the row it found, never p_price.
  const rpc = sql.slice(sql.lastIndexOf("create or replace function public.place_couple_order"));
  assert.match(rpc, /select c\.name, c\.category, c\.price/i);
  assert.doesNotMatch(rpc.slice(0, rpc.indexOf("$$;")), /coin_balance - p_price/i);
});

test("every table the client reads is granted select", () => {
  // Postgres checks the table grant before RLS, so a read policy without a
  // matching grant is dead code. profiles, orders, couples and task_claims had
  // policies and no grant for months: applying the schema to an empty database
  // produced a shop where every screen failed with "permission denied", and
  // nothing here noticed because this file only ever checked write paths.
  // Comments first: these migrations explain themselves at length, and prose
  // about granting reads matches the same pattern as an actual grant.
  const sql = sqlInApplyOrder().replace(/--[^\n]*/g, "");
  const granted = new Set();
  for (const [, columns] of sql.matchAll(/grant\s+([^;]*?)\s+to\s+[^;]*authenticated[^;]*;/gis)) {
    if (!/\bselect\b/i.test(columns.split(/\bon\b/i)[0])) continue;
    for (const [, table] of columns.matchAll(/public\.(\w+)/g)) granted.add(table);
  }
  // `grant all ... to service_role` does not help the signed-in user.
  for (const table of ["profiles", "orders", "couples", "task_claims", "menu_catalog", "memory_entries", "anniversaries", "custom_menu_items", "push_subscriptions", "daily_checkins"]) {
    assert.ok(granted.has(table), `${table} is read by the client but never granted select to authenticated`);
  }
});

test("the partner window never widens into a wallet", () => {
  const sql = sqlInApplyOrder();
  const rpc = sql.slice(sql.lastIndexOf("create or replace function public.get_partner_status"));
  const body = rpc.slice(0, rpc.indexOf("$$;"));
  // The whole reason this function exists is that `profiles` may not be opened
  // up: the balance lives on the row a wider select policy would expose.
  assert.doesNotMatch(body, /coin_balance/i, "get_partner_status must never return a balance");
  assert.match(body, /security definer/i);
  // And the policy it exists to avoid relaxing must still be select-only and
  // scoped to the caller's own row.
  assert.deepEqual(commandsOn("profiles"), ["select"]);
  assert.match(lastPolicyStatement("profiles", "select"), /user_id = auth\.uid\(\)/i);
});

test("a couple cannot bury their own shop under self-written wishes", () => {
  const sql = sqlInApplyOrder();
  // Row-level CHECKs guard every field of a wish; only a trigger can guard the
  // number of them.
  assert.match(sql, /create trigger custom_wish_cap[\s\S]*?before insert on public\.custom_menu_items/i);
  assert.match(sql, /custom wish limit reached/i);
});

test("memory entries are editable and deletable only by their uploader", () => {
  assert.deepEqual([...finalPolicies().get("memory_entries").values()].sort(), ["delete", "insert", "select", "update"]);
  assert.match(lastPolicyStatement("memory_entries", "update"), /using \(\s*created_by = auth\.uid\(\)/i);
  assert.match(lastPolicyStatement("memory_entries", "delete"), /using \(created_by = auth\.uid\(\)\)/i);
});

test("the README lists every migration a fresh project has to run", () => {
  const readme = readFileSync(join(root, "README.md"), "utf8");
  for (const name of readdirSync(migrationsDir).filter((file) => file.endsWith(".sql"))) {
    assert.ok(readme.includes(name), `README is missing ${name}`);
  }
});

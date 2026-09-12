#!/usr/bin/env node
/**
 * Every migration has to survive being replayed.
 *
 * The whole folder is applied in filename order by `supabase db push`, and a
 * project that was set up by hand needs the same files pasted into the SQL
 * editor. Either way a statement that only works on an empty database — a bare
 * `create policy`, a `create table` without `if not exists` — turns the first
 * re-run into an error halfway through, leaving the schema half migrated.
 *
 * This is a lint, not a database: it reads the SQL and reports the statements
 * that could not run twice.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "supabase", "migrations");
const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
const failures = [];

/** Statement starts that are only safe when guarded. */
const RULES = [
  {
    // A policy has no `if not exists`, so it must be dropped first.
    match: /create policy "([^"]+)" on ([\w.]+)/gi,
    check: (sql, [, name, table]) => new RegExp(`drop policy if exists "${name}" on ${table.replace(".", "\\.")}`, "i").test(sql),
    describe: ([, name, table]) => `create policy "${name}" on ${table} needs a preceding "drop policy if exists"`,
  },
  {
    match: /create table (?!if not exists)([\w.]+)/gi,
    check: () => false,
    describe: ([, table]) => `create table ${table} needs "if not exists"`,
  },
  {
    match: /alter table [\w.]+\s+add column (?!if not exists)(\w+)/gi,
    // Or guarded by an information_schema lookup, which is what a migration
    // that has to backfill the new column at the same time does.
    check: (sql, [, column]) => new RegExp(`column_name = '${column}'`, "i").test(sql),
    describe: ([, column]) => `add column ${column} needs "if not exists", or an information_schema guard`,
  },
  {
    // A hosted project adds new tables to `supabase_realtime` by itself, so an
    // unguarded add raises "already member of publication" and leaves the
    // migration half-applied. The local stack does not, which is exactly how
    // this survived in the very first migration until it met a real project.
    match: /alter publication (\w+) add table ([\w.]+)/gi,
    check: (sql, [, , table]) => new RegExp(`tablename = '${table.split(".").pop()}'`, "i").test(sql),
    describe: ([, , table]) => `alter publication ... add table ${table} needs a pg_publication_tables guard`,
  },
  {
    match: /create index (?!if not exists|concurrently if not exists)(\w+)/gi,
    check: () => false,
    describe: ([, index]) => `create index ${index} needs "if not exists"`,
  },
  {
    match: /^create function ([\w.]+)/gim,
    // A plain `create function` is fine when the file drops it first, which is
    // what changing a return type requires.
    check: (sql, [, fn]) => new RegExp(`drop function if exists ${fn.replace(/\./g, "\\.")}\\s*\\(`, "i").test(sql),
    describe: ([, fn]) => `create function ${fn} must be "create or replace", or be preceded by "drop function if exists"`,
  },
];

if (files.length === 0) failures.push("supabase/migrations holds no .sql files");

for (const file of files) {
  const sql = readFileSync(path.join(migrationsDir, file), "utf8");
  // Filenames drive the apply order, so they have to sort the way they run.
  if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(file)) {
    failures.push(`${file}: name must be <14-digit timestamp>_<snake_case>.sql`);
  }
  for (const rule of RULES) {
    for (const found of sql.matchAll(rule.match)) {
      if (!rule.check(sql, found)) failures.push(`${file}: ${rule.describe(found)}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Migrations are not replayable:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error("\nEvery migration must be safe to run twice: the folder is replayed in full on any project set up by hand.");
  process.exit(1);
}

console.log(`Migration replay check passed (${files.length} migrations).`);

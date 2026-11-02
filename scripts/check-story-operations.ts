import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { locked } from "../src/lib/stage-operation";
import { registrationCollection } from "../src/lib/chain-service";
const original = process.env.DATABASE_URL;
if (!original) throw new Error("DATABASE_URL required");
const root = neon(original),
  database = `story_test_${randomUUID().replaceAll("-", "")}`;
await root.query(`CREATE DATABASE ${database}`);
try {
  const url = new URL(original);
  url.pathname = `/${database}`;
  process.env.DATABASE_URL = url.toString();
  const sql = neon(process.env.DATABASE_URL);
  assert.equal(
    (await sql`SELECT current_database() AS name`)[0].name,
    database,
  );
  for (const f of (await readdir("db"))
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort())
    await sql.transaction(
      (await readFile(`db/${f}`, "utf8"))
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => sql.query(s)),
    );
  let calls = 0;
  assert.deepEqual(
    await locked("confirmed", async () => {
      calls++;
      return { marker: "isolated-test" };
    }),
    { marker: "isolated-test" },
  );
  assert.deepEqual(
    await locked("confirmed", async () => {
      throw new Error("Must not execute");
    }),
    { marker: "isolated-test" },
  );
  assert.equal(calls, 1);
  await sql`INSERT INTO jobs(id,state,document) VALUES('pending','pending','{}')`;
  await assert.rejects(
    locked("pending", async () => {
      calls++;
      return {};
    }),
    /reconcile/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    locked("uncertain", async () => {
      calls++;
      throw new Error("Simulated uncertainty");
    }),
    /Simulated uncertainty/,
  );
  await assert.rejects(
    locked("uncertain", async () => {
      calls++;
      return {};
    }),
    /reconcile/,
  );
  assert.equal(calls, 2);
  delete process.env.STORY_SPG_NFT_CONTRACT;
  assert.equal(await registrationCollection(), null);
  const address = "0x1111111111111111111111111111111111111111";
  await sql`INSERT INTO jobs(id,state,document) VALUES('story-collection:aeneid:v1','confirmed',${JSON.stringify({ spgNftContract: address })}::jsonb)`;
  assert.equal(await registrationCollection(), address);
  await sql`UPDATE jobs SET state='needs-review' WHERE id='story-collection:aeneid:v1'`;
  assert.equal(await registrationCollection(), null);
  console.log(
    "Isolated Story operation tests passed: confirmed replay, pending/uncertain locks, and receipt-backed collection lookup. No blockchain transaction was sent.",
  );
} finally {
  process.env.DATABASE_URL = original;
  await root.query(`DROP DATABASE ${database} WITH (FORCE)`);
}

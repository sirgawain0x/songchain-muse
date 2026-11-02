import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { activeSessionOwner } from "../src/lib/auth";
import {
  resolvePrivyAccount,
  privySignIn,
  privyConnection,
} from "../src/lib/privy";
const original = process.env.DATABASE_URL;
if (!original) throw new Error("DATABASE_URL required");
const root = neon(original);
const database = `auth_test_${randomUUID().replaceAll("-", "")}`;
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
  for (const file of (await readdir("db"))
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort()) {
    await sql.transaction(
      (await readFile(`db/${file}`, "utf8"))
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => sql.query(s)),
    );
  }
  const admin = { id: "team-admin", name: "G2", role: "admin" as const };
  await sql`INSERT INTO users(id,name,role) VALUES(${admin.id},${admin.name},${admin.role})`;
  await sql`INSERT INTO events(id,document) VALUES('event','{}')`;
  await sql`INSERT INTO entries(id,event_id,owner_id,document) VALUES('entry','event','team-admin','{}')`;
  await sql`INSERT INTO votes(event_id,entry_id,owner_id,lane) VALUES('event','entry','team-admin','human')`;
  await assert.rejects(resolvePrivyAccount("subject-a", null, true));
  process.env.APP_INVITES = JSON.stringify([admin]);
  const accidentalFan = await resolvePrivyAccount("subject-a", null, false);
  assert.equal(accidentalFan.role, "fan");
  await assert.rejects(
    resolvePrivyAccount("subject-a", admin, false),
    /already signed in/,
  );
  assert.deepEqual(await resolvePrivyAccount("subject-a", admin, true), admin);
  assert.equal(
    await activeSessionOwner(accidentalFan.id),
    null,
    "Old fan cookies must lose access after recovery",
  );
  assert.deepEqual(await activeSessionOwner(admin.id), admin);

  assert.deepEqual(await resolvePrivyAccount("subject-a", null, false), admin);
  await assert.rejects(resolvePrivyAccount("subject-b", admin, true));
  const fan = await resolvePrivyAccount("subject-fan", null, false);
  assert.equal(fan.role, "fan");
  await assert.rejects(resolvePrivyAccount("subject-a", fan, true));
  const otherAdmin = {
    id: "other-admin",
    name: "Other admin",
    role: "admin" as const,
  };
  process.env.APP_INVITES = JSON.stringify([admin, otherAdmin]);
  await sql`INSERT INTO users(id,name,role) VALUES(${otherAdmin.id},${otherAdmin.name},${otherAdmin.role})`;
  await sql`INSERT INTO votes(event_id,entry_id,owner_id,lane) VALUES('event','entry',${fan.id},'human')`;
  await assert.rejects(
    resolvePrivyAccount("subject-fan", otherAdmin, true),
    /activity to preserve/,
  );
  assert.equal(
    (await resolvePrivyAccount("subject-fan", null, false)).id,
    fan.id,
  );
  const race = await Promise.all([
    resolvePrivyAccount("race", null, false),
    resolvePrivyAccount("race", null, false),
  ]);
  assert.equal(race[0].id, race[1].id);
  assert.equal(
    (await sql`SELECT owner_id FROM votes WHERE owner_id='team-admin'`)[0]
      .owner_id,
    admin.id,
  );
  assert.equal((await sql`SELECT owner_id FROM entries`)[0].owner_id, admin.id);
  assert.equal((await privyConnection(admin.id)).connected, true);
  assert.ok((await privyConnection(admin.id)).linkedAt);
  assert.deepEqual(await privyConnection(accidentalFan.id), {
    connected: false,
    linkedAt: null,
  });
  assert.deepEqual(await privyConnection("unknown"), {
    connected: false,
    linkedAt: null,
  });
  process.env.NEXT_PUBLIC_PRIVY_APP_ID ||= "invalid-test-app";
  process.env.PRIVY_APP_SECRET ||= "invalid-test-secret";
  await assert.rejects(
    privySignIn("forged.token.value", null, false),
    /could not be verified/,
  );
  assert.equal(
    (await sql`SELECT count(*)::int AS n FROM privy_accounts`)[0].n,
    3,
  );
  console.log(
    "Privy account tests passed: verified-token gate, stable owner IDs, role preservation, link conflicts, concurrent login, existing votes/entries preserved.",
  );
} finally {
  process.env.DATABASE_URL = original;
  await root.query(`DROP DATABASE ${database} WITH (FORCE)`);
}

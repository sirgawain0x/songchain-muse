import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { savedTranscript, transcribeEntry } from "../src/lib/transcription";
import {
  getListeningPreview,
  runListeningPreview,
  publishedListeningPreview,
  publishListeningPreview,
} from "../src/lib/listening-preview";
const original = process.env.DATABASE_URL;
if (!original) throw new Error("DATABASE_URL required");
const root = neon(original);
const database = `preview_test_${randomUUID().replaceAll("-", "")}`;
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
    .sort())
    await sql.transaction(
      (await readFile(`db/${file}`, "utf8"))
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => sql.query(s)),
    );
  const admin = { id: "admin", name: "Test admin", role: "admin" as const };
  const stranger = { id: "stranger", name: "Test fan", role: "fan" as const };
  await sql`INSERT INTO users(id,name,role) VALUES('admin','Test admin','admin')`;
  await sql`INSERT INTO events(id,document) VALUES('event','{}')`;
  await sql`INSERT INTO entries(id,event_id,owner_id,document) VALUES('entry','event','admin',${JSON.stringify({ id: "entry", ownerId: "admin", state: "submitted" })}::jsonb)`;
  await assert.rejects(getListeningPreview("entry", stranger), /not found/);
  await assert.rejects(runListeningPreview("entry", stranger), /administrator/);
  assert.equal(
    (await getListeningPreview("entry", admin)).state,
    "not-started",
  );
  // Isolated cache fixture tests replay behavior without calling or impersonating Meta.
  const fixture = {
    mode: "non-voting-preview",
    affectsStandings: false,
    card: { vote: false },
    marker: "isolated-test-only",
  };
  await sql`INSERT INTO jobs(id,state,document) VALUES('listening-preview:entry','complete',${JSON.stringify(fixture)}::jsonb)`;
  assert.deepEqual(
    (await runListeningPreview("entry", admin)).preview,
    fixture,
  );
  const publishable = {
    ...fixture,
    entryId: "entry",
    model: "isolated-test-model",
    responseId: "isolated-fixture-only",
    generatedAt: new Date().toISOString(),
    limitation: "Test fixture, never public app data.",
    transcript: "private unverified text",
    storageUrl: "private-location",
    card: {
      vote: false,
      criteria: ["Songwriting", "Performance", "Originality", "Production"].map(
        (name) => ({ name, score: 50, rationale: "Isolated test evidence" }),
      ),
    },
    audio: [
      { role: "seed", durationSeconds: 100 },
      { role: "mix", durationSeconds: 95 },
    ],
  };
  await sql`UPDATE jobs SET document=${JSON.stringify(publishable)}::jsonb WHERE id='listening-preview:entry'`;
  assert.equal((await publishedListeningPreview("entry")).preview, null);
  await assert.rejects(
    publishListeningPreview("entry", stranger),
    /administrators/,
  );
  const published = await publishListeningPreview("entry", admin);
  assert.equal(JSON.stringify(published).includes("private"), false);
  assert.deepEqual(await publishedListeningPreview("entry"), published);
  assert.deepEqual(await publishListeningPreview("entry", admin), published);
  await sql`UPDATE entries SET document=jsonb_set(document,'{state}','"disqualified"'::jsonb) WHERE id='entry'`;
  assert.equal((await publishedListeningPreview("entry")).preview, null);
  await sql`UPDATE entries SET document=jsonb_set(document,'{state}','"submitted"'::jsonb) WHERE id='entry'`;
  await sql`UPDATE jobs SET state='processing' WHERE id='listening-preview:entry'`;
  await assert.rejects(runListeningPreview("entry", admin), /already running/);
  await sql`UPDATE jobs SET state='failed' WHERE id='listening-preview:entry'`;
  delete process.env.META_API_KEY;
  await assert.rejects(runListeningPreview("entry", admin), /META_API_KEY/);
  assert.equal((await getListeningPreview("entry", admin)).state, "failed");
  assert.equal((await sql`SELECT count(*)::int AS n FROM votes`)[0].n, 0);
  assert.equal((await sql`SELECT count(*)::int AS n FROM scorecards`)[0].n, 0);
  assert.equal(
    (await sql`SELECT count(*)::int AS n FROM review_assignments`)[0].n,
    0,
  );
  const asr = {
    transcript: "Saved fixture words",
    turns: [{ transcript: "Saved fixture words" }],
    audioDurationMs: 95000,
    sessionId: "private-provider-session",
  };
  await sql`INSERT INTO jobs(id,state,document) VALUES('transcription:entry','complete',${JSON.stringify(asr)}::jsonb)`;
  await assert.rejects(savedTranscript("entry", stranger), /not found/);
  assert.equal(
    (await savedTranscript("entry", admin)).transcript?.text,
    asr.transcript,
  );
  assert.equal(
    (await savedTranscript("entry", { ...admin, role: "artist" })).transcript
      ?.text,
    asr.transcript,
  );
  assert.equal(
    JSON.stringify(await savedTranscript("entry", admin)).includes(
      asr.sessionId,
    ),
    false,
  );
  assert.deepEqual(
    await transcribeEntry("entry"),
    asr,
    "Saved transcription must be reused without an API key or provider request",
  );
  console.log(
    "Preview service tests passed: access controls, cached replay, concurrent-run blocking, failure recovery, and zero contest scores/votes/assignments. No provider call or app-database fixture was used.",
  );
} finally {
  process.env.DATABASE_URL = original;
  await root.query(`DROP DATABASE ${database} WITH (FORCE)`);
}

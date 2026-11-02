import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import {
  setReviewProgram,
  assignReview,
  persistAssignedReview,
  evaluateReview,
  showcaseEntry,
} from "../src/lib/review-service";
import type { Scorecard, Identity } from "../src/lib/domain";
import { stageData } from "../src/lib/repository";

const original = process.env.DATABASE_URL;
if (!original) throw new Error("DATABASE_URL required");
const root = neon(original);
const schema = `review_test_${randomUUID().replaceAll("-", "")}`;
await root.query(`CREATE DATABASE ${schema}`);
try {
  const url = new URL(original);
  url.pathname = `/${schema}`;
  process.env.DATABASE_URL = url.toString();
  const sql = neon(process.env.DATABASE_URL);
  assert.equal(
    (await sql`SELECT current_database() AS schema`)[0].schema,
    schema,
    "Tests must never use the application database",
  );
  for (const file of (await readdir("db"))
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort()) {
    const statements = (await readFile(`db/${file}`, "utf8"))
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean);
    await sql.transaction(statements.map((s) => sql.query(s)));
  }
  const admin: Identity = { id: "admin", name: "Test admin", role: "admin" };
  const juror: Identity = { id: "juror", name: "Test juror", role: "juror" };
  process.env.APP_INVITES = JSON.stringify([
    admin,
    juror,
    { id: "artist", name: "Test artist", role: "artist" },
    ...["a", "b", "assisted"].map((id) => ({
      id,
      name: `Test ${id}`,
      role: "artist",
    })),
  ]);
  process.env.AGENT_IDENTITIES = JSON.stringify(
    ["a", "a-alt", "b", "artist", "assisted"].map((id) => ({
      id,
      ownerId: id === "a-alt" ? "a" : id,
      name: `Test ${id}`,
      focus: "Isolated test",
      key: randomUUID(),
    })),
  );
  for (const person of JSON.parse(process.env.APP_INVITES))
    await sql`INSERT INTO users(id,name,role) VALUES(${person.id},${person.name},${person.role})`;
  const event = {
    id: "event",
    name: "Isolated integration test",
    status: "voting",
    votingOpens: new Date(Date.now() - 60000).toISOString(),
    votingCloses: new Date(Date.now() + 3600000).toISOString(),
  };
  await sql`INSERT INTO events(id,document) VALUES('event',${JSON.stringify(event)}::jsonb)`;
  await sql`INSERT INTO entries(id,event_id,owner_id,document) VALUES('entry','event','artist',${JSON.stringify({ id: "entry", eventId: "event", ownerId: "artist", state: "submitted" })}::jsonb)`;
  await setReviewProgram("event", 1);
  const races = await Promise.allSettled([
    assignReview("entry", "a", admin),
    assignReview("entry", "b", admin),
  ]);
  assert.equal(
    races.filter((r) => r.status === "fulfilled").length,
    1,
    "Atomic capacity must stop over-allocation",
  );
  assert.equal(
    (await sql`SELECT slots_available FROM review_programs`)[0].slots_available,
    0,
  );
  const assignment = (await sql`SELECT * FROM review_assignments`)[0];
  await setReviewProgram("event", 2);
  await assert.rejects(
    assignReview("entry", assignment.owner_id === "a" ? "a-alt" : "b", admin),
  );
  assert.equal(
    (await sql`SELECT slots_available FROM review_programs`)[0].slots_available,
    1,
    "Duplicate owner must not consume capacity",
  );
  await assert.rejects(assignReview("entry", "artist", admin));
  await sql`INSERT INTO assistance(event_id,owner_id,artist_id,agent_id) VALUES('event','assisted','artist','assisted')`;
  await assert.rejects(assignReview("entry", "assisted", admin));
  const card: Scorecard = {
    id: randomUUID(),
    entryId: "entry",
    ownerId: assignment.owner_id,
    agentId: assignment.agent_id,
    agentName: "Isolated reviewer",
    model: "test-only",
    createdAt: new Date().toISOString(),
    criteria: ["Songwriting", "Performance", "Originality", "Production"].map(
      (name) => ({
        name,
        score: 0,
        rationale:
          "Concrete test rationale for an isolated integration fixture.",
      }),
    ),
    overall: 0,
    vote: true,
  };
  await persistAssignedReview(card, "event");
  await assert.rejects(
    persistAssignedReview({ ...card, id: randomUUID() }, "event"),
  );
  assert.equal((await sql`SELECT count(*)::integer AS n FROM votes`)[0].n, 1);
  const acceptance = {
    decision: "accepted",
    audioEvidence: true,
    rubricCoverage: true,
    independentReasoning: true,
    explanation:
      "Independent evidence checked in this isolated integration test.",
  };
  await assert.rejects(
    evaluateReview(assignment.id, acceptance, {
      id: assignment.owner_id,
      name: "Owner",
      role: "artist",
    }),
  );
  await assert.rejects(
    evaluateReview(assignment.id, acceptance, {
      id: "artist",
      name: "Entrant",
      role: "artist",
    }),
  );
  await evaluateReview(assignment.id, acceptance, juror);
  await assert.rejects(evaluateReview(assignment.id, acceptance, juror));
  assert.equal(
    (await sql`SELECT sum(points)::integer AS n FROM reviewer_reputation`)[0].n,
    10,
    "A low score can earn exactly one quality credit",
  );
  const other = assignment.owner_id === "a" ? "b" : "a";
  const otherAssignment = await assignReview("entry", other, admin);
  await persistAssignedReview(
    {
      ...card,
      id: randomUUID(),
      ownerId: other,
      agentId: other,
      overall: 100,
      criteria: card.criteria.map((c) => ({ ...c, score: 100 })),
    },
    "event",
  );
  await evaluateReview(
    otherAssignment.id,
    { ...acceptance, decision: "rejected", audioEvidence: false },
    juror,
  );
  assert.equal(
    (await sql`SELECT sum(points)::integer AS n FROM reviewer_reputation`)[0].n,
    10,
    "A high score does not earn credit when quality is rejected",
  );
  assert.equal(
    (await stageData()).votes.find((v) => v.lane === "agent")?.count,
    1,
    "Rejected review endorsements must not affect results",
  );
  await assert.rejects(
    showcaseEntry("entry", "An explanation long enough for a showcase.", {
      id: "artist",
      name: "Entrant",
      role: "artist",
    }),
  );
  await showcaseEntry(
    "entry",
    "An independent editorial showcase explanation.",
    juror,
  );
  console.log(
    "Isolated Neon checks passed: concurrent slot cap, owner limits, self/assistance conflicts, assigned scoring, one endorsement, independent quality review, exactly-once reputation, and showcase permissions. No public test entries were created.",
  );
} finally {
  process.env.DATABASE_URL = original;
  await root.query(`DROP DATABASE ${schema} WITH (FORCE)`);
}

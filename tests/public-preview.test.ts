import assert from "node:assert/strict";
import test from "node:test";
import { publicPreview } from "../src/lib/public-preview";
import { acceptsEntries, eventLifecycleLabel } from "../src/lib/domain";

const fixture = {
  entryId: "fixture-only",
  model: "test-model",
  responseId: "fixture-response",
  generatedAt: "2026-11-02T12:00:00.000Z",
  mode: "non-voting-preview",
  affectsStandings: false,
  limitation: "Experimental, not a contest score.",
  card: {
    vote: false,
    criteria: ["Songwriting", "Performance", "Originality", "Production"].map(
      (name) => ({
        name,
        score: 50,
        rationale: "Isolated test fixture",
        secret: "omit",
      }),
    ),
  },
  audio: [
    { role: "seed", durationSeconds: 100, url: "private" },
    { role: "mix", durationSeconds: 95, storageKey: "private" },
  ],
  transcript: "Unverified private transcript",
  requestedBy: "private-owner",
  credentials: "private",
};
test("public preview excludes private fields at every level and refuses competitive or incomplete output", () => {
  const visible = JSON.stringify(publicPreview(fixture));
  for (const privateText of [
    "private",
    "secret",
    "transcript",
    "credentials",
    "requestedBy",
  ])
    assert.ok(!visible.includes(privateText));
  assert.throws(() => publicPreview({ ...fixture, affectsStandings: true }));
  assert.throws(() =>
    publicPreview({ ...fixture, card: { ...fixture.card, vote: true } }),
  );
  assert.throws(() =>
    publicPreview({
      ...fixture,
      card: { ...fixture.card, criteria: fixture.card.criteria.slice(0, 3) },
    }),
  );
});
test("entry deadline is exclusive and Open eligibility never determines lifecycle", () => {
  const event = {
    status: "entries" as const,
    votingOpens: "2026-11-05T17:00:00Z",
    votingCloses: "2026-11-08T17:00:00Z",
  };
  const opens = Date.parse(event.votingOpens);
  assert.equal(acceptsEntries(event, opens - 1), true);
  assert.equal(acceptsEntries(event, opens), false);
  assert.equal(
    eventLifecycleLabel(event, opens),
    "Entries closed · awaiting voting",
  );
  assert.equal(
    eventLifecycleLabel({ ...event, status: "voting" }, opens),
    "Voting open",
  );
  assert.equal(
    eventLifecycleLabel(
      { ...event, status: "voting" },
      Date.parse(event.votingCloses),
    ),
    "Voting closed",
  );
});

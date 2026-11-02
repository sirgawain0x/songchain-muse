import { test } from "node:test";
import assert from "node:assert/strict";
import {
  breakdown,
  distribution,
  eligibility,
  entryInput,
  scoreInput,
  voteWindow,
  type Media,
} from "../src/lib/domain";
import { sniffAudio, sourceType } from "../src/lib/provenance";

function stem(
  source: Media["evidence"]["source"],
  trust: Media["evidence"]["trust"] = "trusted",
  role: Media["role"] = "stem",
): Media {
  return {
    id: Math.random().toString(),
    ownerId: "artist",
    name: "Test stem",
    mime: "audio/wav",
    size: 100,
    cid: "test",
    pinataId: "test",
    role,
    declaredSource: source,
    declaredTool: "Test",
    evidence: {
      source,
      trust,
      signature: "valid",
      level: "tool-credentialed",
      hash: "abc",
      manifest: null,
      tool: "Test",
      notes: [],
    },
  };
}
test("IPTC mapping never invents humanCreation", () => {
  assert.equal(
    sourceType("http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture"),
    "human",
  );
  assert.equal(sourceType("digitalCreation"), "human");
  assert.equal(sourceType("trainedAlgorithmicMedia"), "ai");
  assert.equal(sourceType("compositeSynthetic"), "ai-touched");
  assert.equal(sourceType("humanCreation"), "unknown");
  assert.equal(sourceType(""), "unknown");
});
test("stem breakdown preserves unknown sources", () => {
  assert.deepEqual(
    breakdown([stem("human"), stem("ai"), stem("unknown"), stem("ai-touched")]),
    { human: 1, ai: 1, unknown: 1, "ai-touched": 1, total: 4, aiPercent: 50 },
  );
});
test("Pure Human rejects untrusted or missing evidence and agent assistance", () => {
  assert.equal(
    eligibility({ ruleset: "Pure Human", aiCap: null }, [stem("human")], false)
      .length,
    0,
  );
  assert.ok(
    eligibility(
      { ruleset: "Pure Human", aiCap: null },
      [stem("human", "untrusted")],
      false,
    ).length,
  );
  assert.ok(
    eligibility(
      { ruleset: "Pure Human", aiCap: null },
      [stem("unknown")],
      false,
    ).length,
  );
  assert.ok(
    eligibility({ ruleset: "Pure Human", aiCap: null }, [stem("human")], true)
      .length,
  );
});
test("Assisted requires an explicit cap and proven human seed and lead", () => {
  const stems = [
    stem("human", "trusted", "seed"),
    stem("human", "trusted", "lead"),
    stem("ai"),
  ];
  assert.equal(
    eligibility({ ruleset: "Assisted", aiCap: 40 }, stems, true).length,
    0,
  );
  assert.ok(
    eligibility({ ruleset: "Assisted", aiCap: null }, stems, true).length,
  );
  assert.ok(
    eligibility({ ruleset: "Assisted", aiCap: 30 }, stems, true).length,
  );
  assert.ok(
    eligibility(
      { ruleset: "Assisted", aiCap: 100 },
      [stem("human", "untrusted", "seed"), stem("human", "trusted", "lead")],
      false,
    ).length,
  );
});
test("unknown stems cannot bypass the Assisted cap", () => {
  assert.ok(
    eligibility(
      { ruleset: "Assisted", aiCap: 20 },
      [
        stem("human", "trusted", "seed"),
        stem("human", "trusted", "lead"),
        stem("unknown"),
      ],
      false,
    ).some((x) => x.includes("exceed")),
  );
});
test("Open admits unknown-source material without relabeling it", () => {
  const unknown = stem("unknown");
  assert.deepEqual(
    eligibility({ ruleset: "Open", aiCap: null }, [unknown], true),
    [],
  );
  assert.equal(unknown.evidence.source, "unknown");
});
test("vote windows are inclusive at opening and exclusive at closing", () => {
  const event = {
    status: "voting" as const,
    votingOpens: "2026-11-01T12:00:00Z",
    votingCloses: "2026-11-02T12:00:00Z",
  };
  assert.ok(voteWindow(event, Date.parse(event.votingOpens)));
  assert.ok(!voteWindow(event, Date.parse(event.votingCloses)));
  assert.ok(
    !voteWindow({ ...event, status: "closed" }, Date.parse(event.votingOpens)),
  );
});
test("score distributions retain all values and do not fabricate a zero mean", () => {
  assert.equal(distribution([]).mean, null);
  assert.deepEqual(distribution([60, 80, 100]), {
    count: 3,
    mean: 80,
    min: 60,
    max: 100,
    scores: [60, 80, 100],
  });
});
const entry = {
  eventId: "event",
  title: "Test track",
  description: "",
  genre: "Test",
  lyrics: "",
  mixId: "mix",
  stemIds: ["lead"],
  shares: [
    {
      name: "Artist",
      ownerId: "artist-account",
      percentage: 100,
    },
  ],
  consent: true,
};
test("submission requires consent, unique stems and agreed shares totaling 100", () => {
  assert.ok(entryInput.safeParse(entry).success);
  assert.ok(!entryInput.safeParse({ ...entry, consent: false }).success);
  assert.ok(
    !entryInput.safeParse({ ...entry, stemIds: ["lead", "lead"] }).success,
  );
  assert.ok(
    !entryInput.safeParse({
      ...entry,
      shares: [{ ...entry.shares[0], percentage: 99 }],
    }).success,
  );
});
test("scorecards require four bounded scores and a rationale per criterion", () => {
  const card = {
    criteria: ["Songwriting", "Performance", "Originality", "Production"].map(
      (name) => ({
        name,
        score: 80,
        rationale: "A concrete reason grounded in the performance.",
      }),
    ),
    vote: false,
  };
  assert.ok(scoreInput.safeParse(card).success);
  assert.ok(
    !scoreInput.safeParse({
      ...card,
      criteria: card.criteria.map((c) => ({ ...c, score: 101 })),
    }).success,
  );
  assert.ok(
    !scoreInput.safeParse({
      ...card,
      criteria: card.criteria.map((c) => ({ ...c, rationale: "" })),
    }).success,
  );
});
test("file names and MIME declarations cannot disguise non-audio bytes", () => {
  assert.throws(() =>
    sniffAudio(Buffer.from("this is not an mp3"), "audio/mpeg"),
  );
  const wav = Buffer.alloc(44);
  wav.write("RIFF");
  wav.write("WAVE", 8);
  assert.doesNotThrow(() => sniffAudio(wav, "audio/wav"));
  assert.throws(() => sniffAudio(wav, "audio/flac"));
});

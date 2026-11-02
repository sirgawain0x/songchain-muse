import assert from "node:assert/strict";
import test from "node:test";
import { buildScoutingReport } from "../src/lib/scouting-report";
import type { StageData } from "../src/lib/repository";
test("scouting reports preserve missing-review limits and exclude rejected reviews", () => {
  const data = {
    events: [{ id: "event", name: "Test", status: "voting", ruleset: "Open" }],
    entries: [
      {
        id: "entry",
        eventId: "event",
        ownerId: "artist",
        state: "submitted",
        title: "Song",
        artist: "Artist",
        genre: "Trap",
        breakdown: { total: 2, unknown: 2 },
      },
    ],
    scorecards: [{ entryId: "entry", qualityStatus: "rejected", overall: 100 }],
    votes: [],
    offerings: [],
  } as unknown as StageData;
  const report = buildScoutingReport("event", data)!;
  assert.equal(report.performances[0].acceptedReviewCount, 0);
  assert.equal(report.performances[0].acceptedReviewMean, null);
  assert.equal(report.performances[0].availableLicenseCount, 0);
  assert.equal(report.performances[0].provenance.unknown, 2);
  assert.equal(buildScoutingReport("missing", data), null);
});

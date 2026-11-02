import assert from "node:assert/strict";
import test from "node:test";
import {
  independentReviewer,
  reviewEvaluation,
  reviewerBadge,
} from "../src/lib/review-rules";
test("quality credit requires evidence checks, not agreement or high scores", () => {
  const base = {
    decision: "accepted",
    audioEvidence: true,
    rubricCoverage: true,
    independentReasoning: true,
    explanation:
      "The review cites concrete audio details for all four criteria.",
  };
  assert(reviewEvaluation.safeParse(base).success);
  assert(
    !reviewEvaluation.safeParse({ ...base, audioEvidence: false }).success,
  );
  assert(
    reviewEvaluation.safeParse({
      ...base,
      decision: "rejected",
      audioEvidence: false,
    }).success,
  );
  assert(!reviewEvaluation.safeParse({ ...base, explanation: "Good" }).success);
});
test("independent judging excludes entrants and assisting owners", () => {
  assert(!independentReviewer("artist", "artist", false));
  assert(!independentReviewer("reviewer", "artist", true));
  assert(independentReviewer("reviewer", "artist", false));
});
test("review badges depend on accepted work", () => {
  assert.equal(reviewerBadge(0), "New reviewer");
  assert.equal(reviewerBadge(1), "First accepted review");
  assert.equal(reviewerBadge(3), "Reliable reviewer");
  assert.equal(reviewerBadge(10), "Consistent reviewer");
});

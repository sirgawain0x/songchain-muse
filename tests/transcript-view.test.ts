import assert from "node:assert/strict";
import test from "node:test";
import { transcriptView } from "../src/lib/transcript-view";
test("ASR display uses saved text, handles turns and excludes provider metadata", () => {
  assert.deepEqual(
    transcriptView({
      transcript: "  Actual words\nSecond line  ",
      audioDurationMs: 101000,
      sessionId: "private",
      storageUrl: "private",
    }),
    {
      text: "Actual words\nSecond line",
      durationSeconds: 101,
      model: "Muse Voice transcription",
    },
  );
  assert.equal(
    transcriptView({
      transcript: " ",
      turns: [
        { transcript: "First line" },
        { nonsense: "Not words" },
        { transcript: "Second line" },
      ],
    })?.text,
    "First line\nSecond line",
  );
  assert.equal(transcriptView({ sessionId: "metadata is not lyrics" }), null);
  assert.equal(transcriptView({ transcript: " " }), null);
  assert.equal(transcriptView({ transcript: "x".repeat(100001) }), null);
});

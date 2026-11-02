import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { prepareAnalysisAudio, ffmpegPath } from "../src/lib/audio-analysis";
test("analysis converts AAC to complete MP3, preserves input and rejects substitution", async () => {
  const dir = await mkdtemp(join(tmpdir(), "stage-conversion-test-"));
  try {
    const file = join(dir, "source.m4a");
    execFileSync(ffmpegPath(), [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=2",
      "-c:a",
      "aac",
      file,
    ]);
    const input = await readFile(file);
    const hash = createHash("sha256").update(input).digest("hex");
    const result = await prepareAnalysisAudio(input, hash);
    assert.ok(result.durationSeconds >= 2 && result.durationSeconds < 2.1);
    assert.equal(result.sourceHash, hash);
    assert.notEqual(result.analysisHash, hash);
    assert.equal(result.format, "mp3");
    assert.ok(result.bytes.length > 1000);
    assert.deepEqual(await readFile(file), input);
    await assert.rejects(
      prepareAnalysisAudio(input, "wrong-hash"),
      /hash does not match/,
    );
    await assert.rejects(
      prepareAnalysisAudio(Buffer.from("not audio")),
      /could not be converted/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("recordings longer than ten minutes are rejected rather than silently truncated", async () => {
  const dir = await mkdtemp(join(tmpdir(), "stage-length-test-"));
  try {
    const file = join(dir, "long.mp3");
    execFileSync(ffmpegPath(), [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=24000:cl=stereo",
      "-t",
      "601",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "32k",
      file,
    ]);
    await assert.rejects(
      prepareAnalysisAudio(await readFile(file)),
      /No truncated audio was submitted/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

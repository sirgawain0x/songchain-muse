import ffmpegStatic from "ffmpeg-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { HttpError } from "./auth";
const exec = promisify(execFile);
export function ffmpegPath() {
  const path = process.env.FFMPEG_PATH || ffmpegStatic;
  if (!path)
    throw new HttpError(503, "Audio conversion is unavailable on this server.");
  return path;
}
export const ANALYSIS_MAX_SECONDS = 600;
export async function prepareAnalysisAudio(
  source: Buffer,
  expectedHash?: string,
) {
  const sourceHash = createHash("sha256").update(source).digest("hex");
  if (expectedHash && sourceHash !== expectedHash)
    throw new HttpError(
      409,
      "The stored audio hash does not match. No review was requested.",
    );
  const dir = await mkdtemp(join(tmpdir(), "stage-analysis-"));
  try {
    const input = join(dir, "input");
    const pcm = join(dir, "audio.pcm");
    const output = join(dir, "analysis.mp3");
    await writeFile(input, source);
    const binary = ffmpegPath();
    await exec(
      binary,
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        input,
        "-map",
        "0:a:0",
        "-t",
        "601",
        "-ac",
        "2",
        "-ar",
        "24000",
        "-f",
        "s16le",
        pcm,
      ],
      { timeout: 60000, maxBuffer: 100000 },
    );
    const length = (await stat(pcm)).size;
    const durationSeconds = length / (24000 * 2 * 2);
    if (!length || durationSeconds > ANALYSIS_MAX_SECONDS)
      throw new HttpError(
        422,
        "Audio analysis supports non-empty recordings up to ten minutes. No truncated audio was submitted.",
      );
    await exec(
      binary,
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "s16le",
        "-ac",
        "2",
        "-ar",
        "24000",
        "-i",
        pcm,
        "-codec:a",
        "libmp3lame",
        "-b:a",
        "128k",
        output,
      ],
      { timeout: 60000, maxBuffer: 100000 },
    );
    const bytes = await readFile(output);
    return {
      bytes,
      sourceHash,
      analysisHash: createHash("sha256").update(bytes).digest("hex"),
      durationSeconds,
      format: "mp3" as const,
      conversion:
        "Stereo 24 kHz, MP3 128 kbps analysis copy; original unchanged.",
    };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(
      422,
      "Audio could not be converted for analysis. No scorecard was generated.",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

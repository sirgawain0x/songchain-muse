import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpError } from "./auth";
import { getEntry, getMedia } from "./repository";
import { privateAudio } from "./pinata";
import { ffmpegPath } from "./audio-analysis";
import { db } from "./db";
import { transcriptView } from "./transcript-view";
import type { Identity } from "./domain";

export async function savedTranscript(id: string, user: Identity) {
  const entry = await getEntry(id);
  if (!entry || (user.role !== "admin" && user.id !== entry.ownerId))
    throw new HttpError(404, "Transcript not found.");
  const rows =
    await db()`SELECT document FROM jobs WHERE id=${`transcription:${id}`} AND state='complete'`;
  return { transcript: rows[0] ? transcriptView(rows[0].document) : null };
}
const exec = promisify(execFile);
export async function transcribeEntry(id: string) {
  const saved =
    await db()`SELECT document FROM jobs WHERE id=${`transcription:${id}`} AND state='complete'`;
  if (saved[0] && transcriptView(saved[0].document)) return saved[0].document;
  if (!process.env.META_API_KEY)
    throw new HttpError(503, "Configure META_API_KEY for transcription.");
  const entry = await getEntry(id);
  const media = entry ? await getMedia(entry.mixId) : null;
  if (!media) throw new HttpError(404, "Performance audio not found.");
  const ffmpeg = ffmpegPath();
  const dir = await mkdtemp(join(tmpdir(), "agent-stage-"));
  try {
    const source = join(dir, "source");
    const destination = join(dir, "speech.wav");
    await writeFile(source, await privateAudio(media.cid));
    await exec(
      ffmpeg,
      [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        source,
        "-t",
        "601",
        "-ac",
        "1",
        "-ar",
        "24000",
        "-sample_fmt",
        "s16",
        destination,
      ],
      { timeout: 60000, maxBuffer: 100000 },
    );
    const wav = await readFile(destination);
    if (wav.length > 28800044)
      throw new HttpError(
        422,
        "Transcription supports recordings up to ten minutes. The recording was not truncated or submitted.",
      );
    const form = new FormData();
    form.append(
      "request",
      new Blob(
        [
          JSON.stringify({
            model:
              process.env.META_TRANSCRIBE_MODEL || "muse-voice-transcribe-1.0",
            audioEncoding: "WAV",
            mode: "DIARIZATION",
          }),
        ],
        { type: "application/json" },
      ),
    );
    form.append(
      "audio",
      new File([new Uint8Array(wav)], "speech.wav", { type: "audio/wav" }),
    );
    const response = await fetch("https://api.meta.ai/v1/asr/transcribe", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.META_API_KEY}`,
        Accept: "application/json",
      },
      body: form,
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok)
      throw new HttpError(
        502,
        `Transcription failed (${response.status}). No transcript was invented.`,
      );
    const transcript = {
      ...(await response.json()),
      model: process.env.META_TRANSCRIBE_MODEL || "muse-voice-transcribe-1.0",
    };
    if (!transcriptView(transcript))
      throw new HttpError(
        502,
        "The transcription returned no readable words. No transcript was invented.",
      );
    await db()`INSERT INTO jobs(id,state,document) VALUES(${`transcription:${id}`},'complete',${JSON.stringify(transcript)}::jsonb) ON CONFLICT(id) DO UPDATE SET document=EXCLUDED.document,state='complete'`;
    return transcript;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

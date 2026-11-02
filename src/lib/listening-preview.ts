import { randomUUID } from "node:crypto";
import { db } from "./db";
import { HttpError, type Identity } from "./auth";
import { getEntry } from "./repository";
import { nativeReview } from "./agent-service";
import { publicPreview } from "./public-preview";

export async function publishedListeningPreview(entryId: string) {
  const entry = await getEntry(entryId);
  if (!entry || entry.state !== "submitted") return { preview: null };
  const rows =
    await db()`SELECT document FROM jobs WHERE id=${`public-listening-preview:${entryId}`} AND state='complete'`;
  return { preview: rows[0] ? publicPreview(rows[0].document) : null };
}

export async function publishListeningPreview(entryId: string, user: Identity) {
  if (user.role !== "admin")
    throw new HttpError(
      403,
      "Only administrators can publish listening feedback.",
    );
  const entry = await getEntry(entryId);
  if (!entry || entry.state !== "submitted")
    throw new HttpError(404, "Performance not found.");
  const saved = await getListeningPreview(entryId, user);
  if (saved.state !== "complete")
    throw new HttpError(
      409,
      "Generate a complete preview before publishing it.",
    );
  const preview = publicPreview(saved.preview);
  if (preview.entryId !== entryId)
    throw new HttpError(409, "The preview belongs to a different performance.");
  await db()`INSERT INTO jobs(id,state,document) VALUES(${`public-listening-preview:${entryId}`},'complete',${JSON.stringify(preview)}::jsonb) ON CONFLICT(id) DO UPDATE SET document=EXCLUDED.document,state='complete'`;
  return { preview };
}
export async function metaModels() {
  if (!process.env.META_API_KEY)
    throw new HttpError(503, "Meta is not configured.");
  const response = await fetch("https://api.meta.ai/v1/models", {
    headers: { Authorization: `Bearer ${process.env.META_API_KEY}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    return { ok: false, status: response.status, models: [] as string[] };
  const payload = await response.json();
  return {
    ok: true,
    status: response.status,
    models: (payload.data || [])
      .map((m: { id: string }) => m.id)
      .filter((id: unknown) => typeof id === "string") as string[],
  };
}
export async function getListeningPreview(entryId: string, user: Identity) {
  const entry = await getEntry(entryId);
  if (!entry || (user.role !== "admin" && user.id !== entry.ownerId))
    throw new HttpError(404, "Preview not found.");
  const rows =
    await db()`SELECT state,document FROM jobs WHERE id=${`listening-preview:${entryId}`}`;
  if (!rows[0]) return { state: "not-started", preview: null };
  return {
    state: rows[0].state,
    preview: rows[0].state === "complete" ? rows[0].document : null,
    error: rows[0].state === "failed" ? rows[0].document.error : null,
  };
}
export async function runListeningPreview(entryId: string, user: Identity) {
  if (user.role !== "admin")
    throw new HttpError(
      403,
      "Only the stage administrator can request this pilot preview.",
    );
  const existing = await getListeningPreview(entryId, user);
  if (existing.state === "complete") return existing;
  const jobId = `listening-preview:${entryId}`;
  const requestId = randomUUID();
  const sql = db();
  const claimed =
    await sql`INSERT INTO jobs(id,state,document) VALUES(${jobId},'processing',${JSON.stringify({ requestId, requestedBy: user.id, startedAt: new Date().toISOString() })}::jsonb) ON CONFLICT(id) DO UPDATE SET state='processing',document=EXCLUDED.document WHERE jobs.state='failed' RETURNING id`;
  if (!claimed.length)
    throw new HttpError(
      409,
      "The listening preview is already running. Check its status before retrying.",
    );
  try {
    const review = await nativeReview(
      entryId,
      {
        name: "Meta listening preview",
        focus:
          "Specific audible evidence, changes from seed to remix, and practical production observations. This is experimental feedback, not an independent contest vote.",
      },
      true,
    );
    const preview = {
      ...review,
      entryId,
      generatedAt: new Date().toISOString(),
      mode: "non-voting-preview",
      affectsStandings: false,
      limitation:
        "Experimental AI listening feedback. Not an independent contest score, source verification, rights determination or human-approved assessment.",
    };
    await sql`UPDATE jobs SET state='complete',document=${JSON.stringify(preview)}::jsonb WHERE id=${jobId} AND document->>'requestId'=${requestId}`;
    return { state: "complete", preview };
  } catch (e) {
    const error =
      e instanceof HttpError
        ? e.message
        : "The listening preview failed. No score or vote was published.";
    await sql`UPDATE jobs SET state='failed',document=${JSON.stringify({ requestId, error, failedAt: new Date().toISOString() })}::jsonb WHERE id=${jobId} AND document->>'requestId'=${requestId}`;
    throw e;
  }
}
export type ListeningPreview = NonNullable<
  Awaited<ReturnType<typeof getListeningPreview>>["preview"]
>;

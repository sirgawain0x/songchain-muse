import { db } from "./db";
import type { Entry, Media, Offering, Scorecard, StageEvent } from "./domain";
export async function getEvent(id: string) {
  const rows = await db()`SELECT document FROM events WHERE id=${id}`;
  return rows[0]?.document as StageEvent | undefined;
}
export async function getEntry(id: string) {
  const rows = await db()`SELECT document FROM entries WHERE id=${id}`;
  return rows[0]?.document as Entry | undefined;
}
export async function getMedia(id: string) {
  const rows = await db()`SELECT document FROM media WHERE id=${id}`;
  return rows[0]?.document as Media | undefined;
}
export async function stageData() {
  const sql = db();
  const [events, entries, cards, votes, offerings] = await Promise.all([
    sql`SELECT document FROM events ORDER BY id`,
    sql`SELECT document FROM entries ORDER BY document->>'createdAt' DESC`,
    sql`SELECT document FROM scorecards ORDER BY document->>'createdAt' DESC`,
    sql`SELECT v.entry_id,v.lane,count(*)::integer AS count FROM votes v WHERE v.lane='human' OR NOT EXISTS(SELECT 1 FROM scorecards s WHERE s.entry_id=v.entry_id AND s.owner_id=v.owner_id AND s.document->>'qualityStatus'='rejected') GROUP BY v.entry_id,v.lane`,
    sql`SELECT document FROM offerings WHERE document->>'enabled'='true'`,
  ]);
  return {
    events: events.map((r) => r.document as StageEvent),
    entries: entries.map((r) => r.document as Entry),
    scorecards: cards.map((r) => r.document as Scorecard),
    votes: votes as { entry_id: string; lane: string; count: number }[],
    offerings: offerings.map((r) => r.document as Offering),
  };
}
export type StageData = Awaited<ReturnType<typeof stageData>>;

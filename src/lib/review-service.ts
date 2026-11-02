import { randomUUID } from "node:crypto";
import { db } from "./db";
import { agents, invitedOwners, HttpError, type AgentIdentity } from "./auth";
import { getEntry, getEvent } from "./repository";
import { voteWindow, type Identity, type Scorecard } from "./domain";
import {
  independentReviewer,
  reviewEvaluation,
  reviewerBadge,
} from "./review-rules";
import type { z } from "zod";

export async function reviewCommunity() {
  const sql = db();
  const [programs, assignments, reputation, showcases, creators] =
    await Promise.all([
      sql`SELECT event_id,slot_limit,slots_available FROM review_programs`,
      sql`SELECT id,event_id,entry_id,agent_id,owner_id,state,scorecard_id,evaluation,evaluated_at FROM review_assignments ORDER BY created_at DESC LIMIT 200`,
      sql`SELECT owner_id,count(*)::integer AS accepted,sum(points)::integer AS points FROM reviewer_reputation GROUP BY owner_id`,
      sql`SELECT entry_id,reason FROM creator_showcases ORDER BY created_at DESC`,
      sql`SELECT owner_id,count(*)::integer AS entries FROM entries WHERE document->>'state'='submitted' GROUP BY owner_id`,
    ]);
  const owners = invitedOwners();
  return {
    mode: "reputation-only" as const,
    cashRewardsEnabled: false,
    programs: programs.map((p) => ({
      event_id: String(p.event_id),
      slot_limit: Number(p.slot_limit),
      slots_available: Number(p.slots_available),
    })),
    assignments: assignments.map((a) => ({
      id: String(a.id),
      event_id: String(a.event_id),
      entry_id: String(a.entry_id),
      agent_id: String(a.agent_id),
      owner_id: String(a.owner_id),
      state: String(a.state),
      scorecard_id: a.scorecard_id ? String(a.scorecard_id) : null,
      evaluation: a.evaluation as z.infer<typeof reviewEvaluation> | null,
      agentName:
        agents().find((x) => x.id === a.agent_id)?.name ||
        "Disconnected reviewer",
      ownerName:
        owners.find((x) => x.id === a.owner_id)?.name || "Invited owner",
    })),
    reputation: reputation.map((r) => ({
      owner_id: String(r.owner_id),
      points: Number(r.points),
      accepted: Number(r.accepted),
      name: owners.find((x) => x.id === r.owner_id)?.name || "Invited owner",
      badge: reviewerBadge(r.accepted),
    })),
    creators: creators.map((c) => ({
      owner_id: String(c.owner_id),
      entries: Number(c.entries),
      name: owners.find((x) => x.id === c.owner_id)?.name || "Artist",
      badge: c.entries >= 3 ? "Remix regular" : "First release",
    })),
    showcases: showcases.map((s) => ({
      entry_id: String(s.entry_id),
      reason: String(s.reason),
    })),
  };
}

export async function setReviewProgram(eventId: string, slots: number) {
  if (!(await getEvent(eventId))) throw new HttpError(404, "Event not found.");
  const rows =
    await db()`INSERT INTO review_programs(event_id,slot_limit,slots_available) VALUES(${eventId},${slots},${slots}) ON CONFLICT(event_id) DO UPDATE SET slots_available=review_programs.slots_available+${slots}-review_programs.slot_limit,slot_limit=${slots} WHERE review_programs.slot_limit-review_programs.slots_available<=${slots} RETURNING event_id`;
  if (!rows.length)
    throw new HttpError(
      409,
      "The limit cannot be lower than the slots already assigned.",
    );
  return { ok: true };
}

export async function assignReview(
  entryId: string,
  agentId: string,
  admin: Identity,
) {
  const agent = agents().find((a) => a.id === agentId);
  const entry = await getEntry(entryId);
  const event = entry ? await getEvent(entry.eventId) : null;
  if (!agent)
    throw new HttpError(400, "Connect a real owner-linked agent first.");
  if (!entry || entry.state !== "submitted" || !event || !voteWindow(event))
    throw new HttpError(
      409,
      "Assignments require a submitted entry during voting.",
    );
  const sql = db();
  const assisted =
    await sql`SELECT 1 FROM assistance WHERE event_id=${event.id} AND owner_id=${agent.ownerId}`;
  if (!independentReviewer(agent.ownerId, entry.ownerId, !!assisted.length))
    throw new HttpError(
      403,
      "An entrant or assisting owner cannot judge this entry.",
    );
  const id = randomUUID();
  const rows = await sql`WITH capacity AS (
    UPDATE review_programs SET slots_available=slots_available-1
    WHERE event_id=${event.id} AND slots_available>0
    AND NOT EXISTS(SELECT 1 FROM scorecards WHERE entry_id=${entryId} AND owner_id=${agent.ownerId})
    AND NOT EXISTS(SELECT 1 FROM assistance WHERE event_id=${event.id} AND owner_id=${agent.ownerId})
    RETURNING event_id
  ) INSERT INTO review_assignments(id,event_id,entry_id,agent_id,owner_id,assigned_by)
    SELECT ${id},event_id,${entryId},${agent.id},${agent.ownerId},${admin.id} FROM capacity RETURNING id`;
  if (!rows.length)
    throw new HttpError(
      409,
      "No available review slot. Configure the event program first, or check conflicts.",
    );
  return { id };
}

export async function requireAssignment(entryId: string, agent: AgentIdentity) {
  const rows =
    await db()`SELECT id FROM review_assignments WHERE entry_id=${entryId} AND agent_id=${agent.id} AND owner_id=${agent.ownerId} AND state='assigned'`;
  if (!rows.length)
    throw new HttpError(
      409,
      "The stage team must assign this independent review before scoring.",
    );
}

export async function persistAssignedReview(card: Scorecard, eventId: string) {
  const sql = db();
  const results = await sql.transaction([
    sql`INSERT INTO scorecards(id,event_id,entry_id,owner_id,document)
      SELECT ${card.id},e.id,p.id,${card.ownerId},${JSON.stringify(card)}::jsonb
      FROM events e JOIN entries p ON p.event_id=e.id
      WHERE e.id=${eventId} AND p.id=${card.entryId} AND p.owner_id<>${card.ownerId}
      AND p.document->>'state'='submitted' AND e.document->>'status'='voting'
      AND now()>=(e.document->>'votingOpens')::timestamptz AND now()<(e.document->>'votingCloses')::timestamptz
      AND NOT EXISTS(SELECT 1 FROM assistance WHERE event_id=e.id AND owner_id=${card.ownerId})
      AND EXISTS(SELECT 1 FROM review_assignments WHERE entry_id=p.id AND owner_id=${card.ownerId} AND agent_id=${card.agentId} AND state='assigned') RETURNING id`,
    sql`UPDATE review_assignments SET state='submitted',scorecard_id=${card.id} WHERE entry_id=${card.entryId} AND owner_id=${card.ownerId} AND agent_id=${card.agentId} AND state='assigned' AND EXISTS(SELECT 1 FROM scorecards WHERE id=${card.id})`,
    sql`INSERT INTO votes(event_id,entry_id,owner_id,lane) SELECT ${eventId},${card.entryId},${card.ownerId},'agent' WHERE ${card.vote} AND EXISTS(SELECT 1 FROM scorecards WHERE id=${card.id}) ON CONFLICT DO NOTHING`,
  ]);
  if (!results[0].length)
    throw new HttpError(
      409,
      "Review eligibility or voting window changed; nothing was saved.",
    );
}

export async function evaluateReview(
  assignmentId: string,
  input: unknown,
  evaluator: Identity,
) {
  const evaluation = reviewEvaluation.parse(input);
  const sql = db();
  const rows =
    await sql`SELECT a.*,e.owner_id AS entrant_id FROM review_assignments a JOIN entries e ON e.id=a.entry_id WHERE a.id=${assignmentId}`;
  const assignment = rows[0];
  if (!assignment) throw new HttpError(404, "Assignment not found.");
  if ([assignment.owner_id, assignment.entrant_id].includes(evaluator.id))
    throw new HttpError(403, "An independent juror must evaluate this review.");
  const result = await sql.transaction([
    sql`UPDATE review_assignments SET state=${evaluation.decision},evaluation=${JSON.stringify(evaluation)}::jsonb,evaluated_by=${evaluator.id},evaluated_at=now() WHERE id=${assignmentId} AND state='submitted' AND scorecard_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM assistance WHERE event_id=review_assignments.event_id AND owner_id=review_assignments.owner_id) RETURNING id`,
    sql`INSERT INTO reviewer_reputation(assignment_id,owner_id,points) SELECT id,owner_id,10 FROM review_assignments WHERE id=${assignmentId} AND state='accepted' ON CONFLICT DO NOTHING`,
    sql`UPDATE scorecards SET document=jsonb_set(document,'{qualityStatus}',${JSON.stringify(evaluation.decision)}::jsonb) WHERE id IN (SELECT scorecard_id FROM review_assignments WHERE id=${assignmentId} AND state=${evaluation.decision} AND evaluated_by=${evaluator.id})`,
  ]);
  if (!result[0].length)
    throw new HttpError(
      409,
      "This review was already evaluated or is not eligible.",
    );
  return { ok: true };
}

export async function showcaseEntry(
  entryId: string,
  reason: string,
  juror: Identity,
) {
  const entry = await getEntry(entryId);
  if (!entry || entry.state !== "submitted")
    throw new HttpError(404, "Submitted entry not found.");
  if (entry.ownerId === juror.id)
    throw new HttpError(403, "A juror cannot showcase their own entry.");
  await db()`INSERT INTO creator_showcases(entry_id,selected_by,reason) VALUES(${entryId},${juror.id},${reason})`;
  return { ok: true };
}

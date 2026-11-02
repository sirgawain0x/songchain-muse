import { locked } from "@/lib/stage-operation";
import {
  certificateContentSecurityPolicy,
  renderLicenseCertificate,
} from "@/lib/license-certificate";
import {
  metaModels,
  getListeningPreview,
  runListeningPreview,
  publishedListeningPreview,
  publishListeningPreview,
} from "@/lib/listening-preview";
import { privyClient, privySignIn, privyConnection } from "@/lib/privy";
import { inheritedOffering } from "@/lib/story-policy";
import { checkAlchemy } from "@/lib/alchemy";
import { NextResponse, after } from "next/server";
import {
  notificationInbox,
  markNotificationRead,
  subscribePush,
  unsubscribePush,
  pushDeviceStatus,
  dispatchPush,
} from "@/lib/notifications";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  agents,
  constantEqual,
  configuredInvitations,
  HttpError,
  identity,
  invitedOwners,
  requireAgent,
  requireIdentity,
  sameOrigin,
  sessionToken,
  type Identity,
} from "@/lib/auth";
import {
  breakdown,
  eligibility,
  entryInput,
  eventInput,
  scoreInput,
  voteWindow,
  acceptsEntries,
  type Entry,
  type Media,
  type Offering,
  type Scorecard,
  type StageEvent,
} from "@/lib/domain";
import { getEntry, getEvent, getMedia, stageData } from "@/lib/repository";
import {
  audioTypes,
  MAX_AUDIO_BYTES,
  pinata,
  privateAudio,
} from "@/lib/pinata";
import { attestAudio, inspectAudio, signerConfigured } from "@/lib/provenance";
import { agentPackage, arrangementHelp, judge } from "@/lib/agent-service";
import {
  attachOffering,
  mintLicense,
  storySetupStatus,
  createStoryCollection,
  registerSeed,
  registerSong,
  ensureLicensingReady,
  registrationCollection,
} from "@/lib/chain-service";
import { transcribeEntry, savedTranscript } from "@/lib/transcription";
import { flushTrace } from "@/lib/trace";
import {
  reviewCommunity,
  setReviewProgram,
  assignReview,
  requireAssignment,
  persistAssignedReview,
  evaluateReview,
  showcaseEntry,
} from "@/lib/review-service";

export const runtime = "nodejs";
export const maxDuration = 300;
type Context = { params: Promise<{ path: string[] }> };
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
function sendActivityAfterResponse() {
  after(async () => {
    try {
      await dispatchPush();
    } catch {
      console.error("Notification dispatch needs retry.");
    }
  });
}
async function body(request: Request) {
  if (Number(request.headers.get("content-length")) > 100000)
    throw new HttpError(
      413,
      "Request too large. Upload audio directly to Pinata.",
    );
  const raw = await request.text();
  if (raw.length > 100000) throw new HttpError(413, "Request too large.");
  return JSON.parse(raw);
}

function fail(error: unknown) {
  if (error instanceof HttpError)
    return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError)
    return json({ error: error.issues.map((x) => x.message).join(" ") }, 400);
  if (error instanceof SyntaxError)
    return json({ error: "Invalid request." }, 400);
  const code = (error as { code?: string }).code;
  if (code === "23505")
    return json(
      {
        error: "This account has already submitted or voted in this division.",
      },
      409,
    );
  console.error(
    "Stage request failed:",
    error instanceof Error ? error.name : "unknown",
    code || "",
  );
  return json(
    {
      error:
        "The service is not ready. Check the integration status or ask the administrator to review server logs.",
    },
    503,
  );
}
export async function GET(request: Request, context: Context) {
  try {
    const [action, id] = (await context.params).path;
    if (action === "notifications") {
      const user = await requireIdentity();
      const inbox = await notificationInbox(user.id);
      after(async () => {
        try {
          await dispatchPush(user.id);
        } catch {
          console.error("Notification dispatch needs retry.");
        }
      });
      return json(inbox);
    }
    if (action === "transcript")
      return json(await savedTranscript(id, await requireIdentity()));
    if (action === "story-setup") {
      await requireIdentity(["admin"]);
      return json(await storySetupStatus());
    }
    if (action === "meta-models") {
      await requireIdentity(["admin"]);
      return json(await metaModels());
    }
    if (action === "public-listening-preview")
      return json(await publishedListeningPreview(id));
    if (action === "listening-preview")
      return json(await getListeningPreview(id, await requireIdentity()));
    if (action === "review-community") return json(await reviewCommunity());
    if (action === "wallet-health") {
      await requireIdentity(["admin"]);
      let privy = false;
      try {
        await privyClient().apps().getSettings();
        privy = true;
      } catch {}
      return json({ privy, chains: await checkAlchemy() });
    }
    if (action === "session") {
      const user = await identity();
      const votes = user
        ? await db()`SELECT event_id,entry_id FROM votes WHERE owner_id=${user.id} AND lane='human'`
        : [];
      return json({
        user,
        votes,
        privy: user
          ? await privyConnection(user.id)
          : { connected: false, linkedAt: null },
      });
    }
    if (action === "data") return json(await stageData());
    if (action === "status") {
      const checks = {
        database: !!process.env.DATABASE_URL,
        pinata: !!(process.env.PINATA_JWT && process.env.PINATA_GATEWAY),
        signer: signerConfigured(),
        meta: !!process.env.META_API_KEY,
        licensing: !!(
          process.env.STORY_PRIVATE_KEY &&
          (await registrationCollection()) &&
          process.env.CUSTODY_MASTER_KEY
        ),
        trace:
          process.env.TRACE_ENABLED === "true" && !!process.env.TRACE_API_KEY,
      };
      let databaseError = false;
      if (checks.database)
        try {
          await db()`SELECT id FROM events LIMIT 1`;
        } catch {
          databaseError = true;
          checks.database = false;
        }
      return json({
        checks,
        databaseError,
        agentCount: agents().length,
        automaticJudging:
          process.env.ENABLE_META_AUDIO_JUDGING === "true" &&
          !!process.env.META_API_KEY,
      });
    }
    if (action === "agents")
      return json({
        agents: agents().map(({ id, name, focus }) => ({ id, name, focus })),
      });
    if (action === "contributors") {
      await requireIdentity(["admin", "artist"]);
      return json({
        contributors: invitedOwners().filter((owner) =>
          ["admin", "artist"].includes(owner.role),
        ),
      });
    }
    if (action === "feed") {
      requireAgent(request);
      return json(await agentPackage(id));
    }
    if (action === "audio") {
      const media = await getMedia(id);
      if (!media) throw new HttpError(404, "Audio not found.");
      const sql = db();
      const publicMedia =
        await sql`SELECT id FROM entries WHERE document->>'state'='submitted' AND (document->>'mixId'=${id} OR document->'stems' @> ${JSON.stringify([{ id }])}::jsonb) UNION SELECT id FROM events WHERE document->>'seedId'=${id} AND document->>'status' <> 'draft' LIMIT 1`;
      const user = await identity();
      if (
        !publicMedia.length &&
        user?.id !== media.ownerId &&
        user?.role !== "admin"
      ) {
        try {
          requireAgent(request);
        } catch {
          throw new HttpError(403, "This audio is private.");
        }
      }
      const url = await pinata().gateways.private.createAccessLink({
        cid: media.cid,
        expires: 120,
      });
      return NextResponse.redirect(url, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    if (action === "certificate") {
      const user = await requireIdentity();
      const sql = db();
      const rows =
        await sql`SELECT document FROM purchases WHERE id=${id} AND owner_id=${user.id} AND state='confirmed'`;
      if (!rows.length)
        throw new HttpError(404, "Confirmed license not found.");
      if (new URL(request.url).searchParams.get("format") === "html") {
        return new NextResponse(
          renderLicenseCertificate(rows[0].document, user.name),
          {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "private, no-store",
              "Content-Security-Policy": certificateContentSecurityPolicy,
              "X-Content-Type-Options": "nosniff",
              "Referrer-Policy": "no-referrer",
            },
          },
        );
      }
      return new NextResponse(JSON.stringify(rows[0].document, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition":
            'attachment; filename="agent-stage-license.json"',
          "Cache-Control": "private, no-store",
        },
      });
    }
    if (action === "library") {
      const user = await requireIdentity();
      return json(
        await db()`SELECT id,document,state FROM purchases WHERE owner_id=${user.id} ORDER BY id DESC`,
      );
    }
    throw new HttpError(404, "Not found.");
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    sameOrigin(request);
    const [action, id] = (await context.params).path;
    const input = await body(request);
    const sql = db();
    if (action === "story-collection") {
      await requireIdentity(["admin"]);
      const existing =
        await sql`SELECT document FROM jobs WHERE id='story-collection:aeneid:v1' AND state='confirmed'`;
      if (existing[0]) return json(existing[0].document);
      const setup = await storySetupStatus();
      if (
        !setup.signerConfigured ||
        !setup.balanceWei ||
        BigInt(setup.balanceWei) === 0n
      )
        throw new HttpError(
          503,
          "Fund the dedicated Aeneid sponsor with free test IP first.",
        );
      return json(
        await locked("story-collection:aeneid:v1", createStoryCollection),
      );
    }
    if (action === "listening-preview") {
      const result = await runListeningPreview(
        id,
        await requireIdentity(["admin"]),
      );
      sendActivityAfterResponse();
      return json(result);
    }
    if (action === "review-program") {
      await requireIdentity(["admin"]);
      const { slots } = z
        .object({ slots: z.number().int().min(1).max(50) })
        .parse(input);
      return json(await setReviewProgram(id, slots));
    }
    if (action === "assign-review") {
      const admin = await requireIdentity(["admin"]);
      const { agentId } = z
        .object({ agentId: z.string().min(1).max(100) })
        .parse(input);
      return json(await assignReview(id, agentId, admin));
    }
    if (action === "evaluate-review") {
      const juror = await requireIdentity(["admin", "juror"]);
      return json(await evaluateReview(id, input, juror));
    }
    if (action === "showcase") {
      const juror = await requireIdentity(["admin", "juror"]);
      const { reason } = z
        .object({ reason: z.string().trim().min(20).max(1000) })
        .parse(input);
      return json(await showcaseEntry(id, reason, juror));
    }
    if (action === "publish-listening-preview")
      return json(
        await publishListeningPreview(id, await requireIdentity(["admin"])),
      );
    if (action === "notification-read") {
      const user = await requireIdentity();
      const data = z
        .object({ id: z.string().min(1).max(100).optional() })
        .parse(input);
      return json(await markNotificationRead(user.id, data.id));
    }
    if (action === "push-subscribe") {
      const user = await requireIdentity();
      const rate =
        await sql`INSERT INTO auth_attempts(key,attempts,reset_at) VALUES(${`push:${user.id}`},1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_attempts.reset_at<now() THEN 1 ELSE auth_attempts.attempts+1 END,reset_at=CASE WHEN auth_attempts.reset_at<now() THEN now()+interval '15 minutes' ELSE auth_attempts.reset_at END RETURNING attempts`;
      if (rate[0].attempts > 10)
        throw new HttpError(
          429,
          "Too many device changes. Try again in 15 minutes.",
        );
      return json(await subscribePush(user.id, input));
    }
    if (action === "push-status" || action === "push-unsubscribe") {
      const user = await requireIdentity();
      const { endpoint } = z
        .object({ endpoint: z.string().max(4096) })
        .parse(input);
      return json(
        await (action === "push-status"
          ? pushDeviceStatus(user.id, endpoint)
          : unsubscribePush(user.id, endpoint)),
      );
    }
    if (action === "push-test") {
      const user = await requireIdentity();
      const { testPush } = await import("@/lib/notifications");
      const result = await testPush(user.id);
      after(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10000));
        try {
          await dispatchPush(user.id);
        } catch {
          console.error("Test push needs scheduled retry.");
        }
      });
      return json(result);
    }
    if (action === "privy-login") {
      const rateKey = createHash("sha256")
        .update(
          `privy:${request.headers.get("x-forwarded-for")?.split(",")[0] || "local"}`,
        )
        .digest("hex");
      const rate =
        await sql`INSERT INTO auth_attempts(key,attempts,reset_at) VALUES(${rateKey},1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_attempts.reset_at < now() THEN 1 ELSE auth_attempts.attempts+1 END,reset_at=CASE WHEN auth_attempts.reset_at < now() THEN now()+interval '15 minutes' ELSE auth_attempts.reset_at END RETURNING attempts`;
      if (rate[0].attempts > 30)
        throw new HttpError(
          429,
          "Too many sign-in attempts. Try again in 15 minutes.",
        );
      const { token, link } = z
        .object({
          token: z.string().min(1).max(20000),
          link: z.boolean().default(false),
        })
        .parse(input);
      const result = await privySignIn(token, await identity(), link);
      const maxAge = Math.max(
        1,
        Math.min(3600, result.expires - Math.floor(Date.now() / 1000)),
      );
      (await cookies()).set(
        "stage-session",
        sessionToken(result.user, maxAge),
        {
          httpOnly: true,
          secure: new URL(request.url).protocol === "https:",
          sameSite: "lax",
          path: "/",
          maxAge,
        },
      );
      return json({ user: result.user });
    }
    if (action === "login") {
      const { code } = z
        .object({ code: z.string().min(1).max(256) })
        .parse(input);
      const rateKey = createHash("sha256")
        .update(
          request.headers.get("x-forwarded-for")?.split(",")[0] || "local",
        )
        .digest("hex");
      const rate =
        await sql`INSERT INTO auth_attempts(key,attempts,reset_at) VALUES(${rateKey},1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_attempts.reset_at < now() THEN 1 ELSE auth_attempts.attempts+1 END,reset_at=CASE WHEN auth_attempts.reset_at < now() THEN now()+interval '15 minutes' ELSE auth_attempts.reset_at END RETURNING attempts`;
      if (rate[0].attempts > 15)
        throw new HttpError(
          429,
          "Too many sign-in attempts. Try again in 15 minutes.",
        );
      const invites = configuredInvitations();
      const found = invites.find((i) => constantEqual(i.code, code));
      if (!found)
        throw new HttpError(401, "That invitation code is not valid.");
      const user: Identity = {
        id: found.id,
        name: found.name,
        role: found.role,
      };
      const rows =
        await sql`INSERT INTO users(id,name,role) VALUES(${user.id},${user.name},${user.role}) ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role RETURNING id,name,role`;
      user.name = rows[0].name;
      (await cookies()).set("stage-session", sessionToken(user), {
        httpOnly: true,
        secure: new URL(request.url).protocol === "https:",
        sameSite: "lax",
        path: "/",
        maxAge: 86400,
      });
      return json({ user });
    }
    if (action === "profile") {
      const user = await requireIdentity();
      const { name } = z
        .object({ name: z.string().trim().min(1).max(80) })
        .parse(input);
      const rows =
        await sql`UPDATE users SET name=${name} WHERE id=${user.id} RETURNING id,name,role`;
      return json({ user: rows[0] });
    }
    if (action === "logout") {
      (await cookies()).delete("stage-session");
      return json({ ok: true });
    }
    if (action === "upload-ticket") {
      const user = await requireIdentity(["artist", "admin"]);
      const data = z
        .object({
          name: z.string().min(1).max(150),
          mime: z.enum(audioTypes as [string, ...string[]]),
          size: z.number().int().positive().max(MAX_AUDIO_BYTES),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
          role: z.enum(["seed", "lead", "stem", "mix"]),
          declaredSource: z.enum(["human", "ai", "ai-touched", "unknown"]),
          declaredTool: z.string().max(100),
        })
        .parse(input);
      if (data.role === "seed" && user.role !== "admin")
        throw new HttpError(403, "Only administrators can upload event seeds.");
      const uploadId = randomUUID();
      const url = await pinata().upload.private.createSignedURL({
        expires: 120,
        // Pinata counts multipart form overhead against the signed request limit.
        // Completion still checks the stored file against data.size below.
        maxFileSize: data.size + 64 * 1024,
        // Pinata sniffs WAV/M4A using aliases that browsers may not report.
        mimeTypes:
          data.mime === "audio/wav"
            ? ["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"]
            : data.mime === "audio/mp4"
              ? ["audio/mp4", "audio/x-m4a"]
              : [data.mime],
        name: data.name,
        keyvalues: { stageUpload: uploadId, owner: user.id },
      });
      await sql`INSERT INTO jobs(id,state,document) VALUES(${uploadId},'upload',${JSON.stringify({ ...data, ownerId: user.id })}::jsonb)`;
      return json({ uploadId, url });
    }
    if (action === "upload-complete") {
      const user = await requireIdentity(["artist", "admin"]);
      const data = z
        .object({ uploadId: z.string().uuid(), fileId: z.string().uuid() })
        .parse(input);
      const rows =
        await sql`UPDATE jobs SET state='processing' WHERE id=${data.uploadId} AND state='upload' AND document->>'ownerId'=${user.id} RETURNING document`;
      if (!rows.length)
        throw new HttpError(
          409,
          "This upload is unavailable or already processing.",
        );
      const ticket = rows[0].document;
      try {
        const pinned = await pinata().files.private.get(data.fileId);
        if (
          pinned.keyvalues?.owner !== user.id ||
          pinned.size > ticket.size + 64 * 1024
        )
          throw new HttpError(
            403,
            "The uploaded file does not match this account’s upload ticket.",
          );
        const bytes = await privateAudio(pinned.cid);
        if (bytes.length > ticket.size)
          throw new HttpError(
            413,
            "The audio exceeds the upload ticket’s file size.",
          );
        // Reused same-owner content may retain older ticket metadata. Verify bytes.
        if (createHash("sha256").update(bytes).digest("hex") !== ticket.sha256)
          throw new HttpError(
            403,
            "The audio does not match the file selected for this upload.",
          );
        let evidence = await inspectAudio(bytes, ticket.mime);
        let cid = pinned.cid;
        let pinataId = pinned.id;
        if (evidence.signature === "missing" && signerConfigured()) {
          const signed = await attestAudio(
            bytes,
            ticket.mime,
            user.id,
            ticket.declaredSource,
            ticket.declaredTool,
          );
          const record = await pinata().upload.private.file(
            new File([new Uint8Array(signed)], ticket.name, {
              type: ticket.mime,
            }),
          );
          cid = record.cid;
          pinataId = record.id;
          evidence = {
            ...(await inspectAudio(signed, ticket.mime)),
            source: "unknown",
            level: "platform-attested",
          };
        }
        const media: Media = {
          id: data.uploadId,
          ownerId: user.id,
          name: ticket.name,
          mime: ticket.mime,
          size: bytes.length,
          cid,
          pinataId,
          evidence,
          declaredSource: ticket.declaredSource,
          declaredTool: ticket.declaredTool,
          role: ticket.role,
        };
        await sql.transaction([
          sql`INSERT INTO media(id,owner_id,document) VALUES(${media.id},${user.id},${JSON.stringify(media)}::jsonb)`,
          sql`UPDATE jobs SET state='complete' WHERE id=${media.id}`,
        ]);
        return json({ media });
      } catch (error) {
        // Keep a failed request retryable without bypassing ticket ownership.
        await sql`UPDATE jobs SET state='upload' WHERE id=${data.uploadId} AND state='processing' AND document->>'ownerId'=${user.id}`;
        throw error;
      }
    }
    if (action === "event") {
      await requireIdentity(["admin"]);
      const data = eventInput.parse(input);
      if (
        !invitedOwners().some(
          (owner) =>
            owner.id === data.seedOwnerId &&
            ["admin", "artist"].includes(owner.role),
        )
      )
        throw new HttpError(
          400,
          "Choose an invited artist account for the seed.",
        );
      const seed = await getMedia(data.seedId);
      if (!seed || seed.role !== "seed")
        throw new HttpError(400, "Choose a processed seed upload.");
      const event: StageEvent = {
        ...data,
        id: randomUUID(),
        status: "entries",
      };
      await sql`INSERT INTO events(id,document) VALUES(${event.id},${JSON.stringify(event)}::jsonb)`;
      return json({ event });
    }
    if (action === "event-state") {
      await requireIdentity(["admin"]);
      const data = z
        .object({ status: z.enum(["entries", "voting", "closed"]) })
        .parse(input);
      const event = await getEvent(id);
      if (!event) throw new HttpError(404, "Event not found.");
      if (event.status === "closed" && data.status !== "closed")
        throw new HttpError(409, "Closed events cannot be reopened.");
      if (event.status === "voting" && data.status === "entries")
        throw new HttpError(
          409,
          "A division cannot return to creation after judging has begun.",
        );
      await sql`UPDATE events SET document=jsonb_set(document,'{status}',${JSON.stringify(data.status)}::jsonb) WHERE id=${id}`;
      return json({ ok: true });
    }
    if (action === "entry") {
      const user = await requireIdentity(["artist", "admin"]);
      const data = entryInput.parse(input);
      const owners = invitedOwners();
      if (
        data.shares.some(
          (share) =>
            !owners.some(
              (owner) =>
                owner.id === share.ownerId &&
                ["admin", "artist"].includes(owner.role),
            ),
        )
      )
        throw new HttpError(
          400,
          "Every contributor needs an invited artist account.",
        );
      if (
        new Set(data.shares.map((share) => share.ownerId)).size !==
        data.shares.length
      )
        throw new HttpError(400, "List each contributor once.");
      const event = await getEvent(data.eventId);
      if (!event || !acceptsEntries(event))
        throw new HttpError(409, "This division is not accepting entries.");
      const seed = event.seedId ? await getMedia(event.seedId) : null;
      if (!seed) throw new HttpError(409, "The event needs a processed seed.");
      const stems = await Promise.all(data.stemIds.map(getMedia));
      const mix = await getMedia(data.mixId);
      if (!mix || mix.ownerId !== user.id || mix.role !== "mix")
        throw new HttpError(400, "Upload your finished mix.");
      if (
        stems.some(
          (s) =>
            !s || s.ownerId !== user.id || !["stem", "lead"].includes(s.role),
        )
      )
        throw new HttpError(400, "Choose your own processed stems.");
      const allStems = [seed, ...(stems as Media[])];
      const assisted =
        await sql`SELECT agent_id FROM assistance WHERE event_id=${event.id} AND artist_id=${user.id}`;
      const violations = eligibility(event, allStems, assisted.length > 0);
      if (violations.length) throw new HttpError(422, violations.join(" "));
      const signed = await attestAudio(
        await privateAudio(mix.cid),
        mix.mime,
        user.id,
        "composite",
        "Agent Stage",
        await Promise.all(
          allStems.map(async (media) => ({
            media,
            bytes: await privateAudio(media.cid),
          })),
        ),
      );
      const frozen = await pinata().upload.private.file(
        new File([new Uint8Array(signed)], mix.name, { type: mix.mime }),
      );
      const signedMix = {
        ...mix,
        id: randomUUID(),
        cid: frozen.cid,
        pinataId: frozen.id,
        evidence: await inspectAudio(signed, mix.mime),
      };
      const entry: Entry = {
        id: randomUUID(),
        eventId: event.id,
        ownerId: user.id,
        artist: user.name,
        title: data.title,
        description: data.description,
        genre: data.genre,
        lyrics: data.lyrics,
        createdAt: new Date().toISOString(),
        mixId: signedMix.id,
        stems: allStems,
        breakdown: breakdown(allStems),
        shares: data.shares.map((share) => ({
          ...share,
          name: owners.find((owner) => owner.id === share.ownerId)!.name,
        })),
        state: "submitted",
      };
      await sql.transaction([
        sql`INSERT INTO media(id,owner_id,document) VALUES(${signedMix.id},${user.id},${JSON.stringify(signedMix)}::jsonb)`,
        sql`INSERT INTO entries(id,event_id,owner_id,document) VALUES(${entry.id},${event.id},${user.id},${JSON.stringify(entry)}::jsonb)`,
        sql`INSERT INTO trace_outbox(id,document) VALUES(${entry.id},${JSON.stringify({ kind: "entry", hash: signedMix.evidence.hash, ruleset: event.ruleset, consent: true, licenseVersion: "PIL-1", createdAt: entry.createdAt })}::jsonb)`,
      ]);
      return json({ entry });
    }
    if (action === "vote") {
      const user = await requireIdentity();
      const entry = await getEntry(id);
      if (!entry || entry.state !== "submitted")
        throw new HttpError(404, "Performance not found.");
      const event = await getEvent(entry.eventId);
      if (!event || !voteWindow(event))
        throw new HttpError(409, "Voting is closed for this division.");
      const vote =
        await sql`INSERT INTO votes(event_id,entry_id,owner_id,lane) SELECT e.id,p.id,${user.id},'human' FROM events e JOIN entries p ON p.event_id=e.id WHERE e.id=${event.id} AND p.id=${entry.id} AND p.document->>'state'='submitted' AND e.document->>'status'='voting' AND now()>=(e.document->>'votingOpens')::timestamptz AND now()<(e.document->>'votingCloses')::timestamptz RETURNING entry_id`;
      if (!vote.length)
        throw new HttpError(
          409,
          "Voting closed or this entry became ineligible.",
        );
      return json({ ok: true });
    }
    if (action === "scorecard") {
      const agent = requireAgent(request);
      await requireAssignment(id, agent);
      const card = scoreInput.parse(input);
      const entry = await getEntry(id);
      if (!entry || entry.state !== "submitted")
        throw new HttpError(404, "Performance not found.");
      const event = await getEvent(entry.eventId);
      if (!event || !voteWindow(event))
        throw new HttpError(409, "Agent scoring is closed.");
      const conflict =
        await sql`SELECT agent_id FROM assistance WHERE event_id=${event.id} AND owner_id=${agent.ownerId}`;
      if (conflict.length)
        throw new HttpError(
          403,
          "An agent belonging to this owner assisted an entry in this division.",
        );
      const scorecard: Scorecard = {
        ...card,
        id: randomUUID(),
        entryId: id,
        ownerId: agent.ownerId,
        agentId: agent.id,
        agentName: agent.name,
        model: "external-team-agent",
        createdAt: new Date().toISOString(),
        overall: card.criteria.reduce((sum, c) => sum + c.score, 0) / 4,
      };
      await persistAssignedReview(scorecard, event.id);
      sendActivityAfterResponse();
      return json({ scorecard });
    }
    if (action === "transcribe") {
      await requireIdentity(["admin"]);
      const result = await transcribeEntry(id);
      sendActivityAfterResponse();
      return json(result);
    }
    if (action === "trace-flush") {
      await requireIdentity(["admin"]);
      return json(await flushTrace());
    }
    if (action === "judge") {
      await requireIdentity(["admin"]);
      const agent = agents().find((a) => a.id === input.agentId);
      if (!agent) throw new HttpError(400, "Configure a team agent first.");
      const entry = await getEntry(id);
      if (!entry || entry.state !== "submitted")
        throw new HttpError(404, "Performance not found.");
      const event = await getEvent(entry.eventId);
      if (!event || !voteWindow(event))
        throw new HttpError(409, "Agent scoring is closed.");
      const conflict =
        await sql`SELECT agent_id FROM assistance WHERE event_id=${event.id} AND owner_id=${agent.ownerId}`;
      if (conflict.length)
        throw new HttpError(
          403,
          "This owner assisted an entry in this division and cannot judge it.",
        );
      const existing =
        await sql`SELECT id FROM scorecards WHERE entry_id=${id} AND owner_id=${agent.ownerId}`;
      if (existing.length)
        throw new HttpError(409, "This owner already scored this performance.");
      await requireAssignment(id, agent);
      const { card, model } = await judge(id, agent);
      const result: Scorecard = {
        ...card,
        id: randomUUID(),
        entryId: id,
        ownerId: agent.ownerId,
        agentId: agent.id,
        agentName: agent.name,
        model,
        createdAt: new Date().toISOString(),
        overall: card.criteria.reduce((sum, c) => sum + c.score, 0) / 4,
      };
      await persistAssignedReview(result, event.id);
      sendActivityAfterResponse();
      return json({ scorecard: result });
    }
    if (action === "assistant") {
      const user = await requireIdentity(["artist", "admin"]);
      const event = await getEvent(id);
      if (!event || !acceptsEntries(event))
        throw new HttpError(409, "This division is not accepting entries.");
      if (event.ruleset === "Pure Human")
        throw new HttpError(
          403,
          "Agent build help is not allowed in Pure Human.",
        );
      const prompt = z.string().min(10).max(4000).parse(input.prompt);
      const agent = agents().find((a) => a.id === input.agentId);
      if (!agent)
        throw new HttpError(
          503,
          "Configure the assistant identity before use.",
        );
      // Record the conflict before invoking the model. A failed or interrupted response cannot erase assistance history.
      await sql`INSERT INTO assistance(event_id,owner_id,artist_id,agent_id) VALUES(${event.id},${agent.ownerId},${user.id},${agent.id}) ON CONFLICT DO NOTHING`;
      return json({ text: await arrangementHelp(prompt, event.ruleset) });
    }
    if (action === "jury") {
      await requireIdentity(["juror", "admin"]);
      const entry = await getEntry(id);
      if (!entry || entry.state !== "submitted")
        throw new HttpError(404, "Performance not found.");
      const event = await getEvent(entry.eventId);
      if (!event || event.status !== "closed")
        throw new HttpError(
          409,
          "Close voting before recording the jury decision.",
        );
      await sql`UPDATE events SET document=jsonb_set(document,'{juryWinner}',${JSON.stringify(id)}::jsonb) WHERE id=${event.id}`;
      return json({ ok: true });
    }
    if (action === "disqualify") {
      await requireIdentity(["admin"]);
      await sql`UPDATE entries SET document=jsonb_set(document,'{state}','"disqualified"'::jsonb) WHERE id=${id}`;
      return json({ ok: true });
    }
    if (action === "register-seed") {
      await requireIdentity(["admin"]);
      const event = await getEvent(id);
      if (!event?.seedId) throw new HttpError(404, "Seed not found.");
      if (event.seedIpId) return json({ ipId: event.seedIpId });
      const media = await getMedia(event.seedId);
      if (!media) throw new HttpError(404, "Seed media not found.");
      await ensureLicensingReady();
      const result = await locked(`seed:${id}`, () =>
        registerSeed(event, media.evidence.hash),
      );
      await sql`UPDATE events SET document=document || ${JSON.stringify({ seedIpId: result.ipId, seedTermsId: result.termsId })}::jsonb WHERE id=${id}`;
      return json(result);
    }
    if (action === "register-song") {
      await requireIdentity(["admin"]);
      const entry = await getEntry(id);
      if (!entry || entry.state !== "submitted")
        throw new HttpError(404, "Entry not found.");
      if (entry.ipId)
        return json({ ipId: entry.ipId, txHash: entry.registrationTx });
      const event = await getEvent(entry.eventId);
      if (!event) throw new HttpError(404, "Event not found.");
      await ensureLicensingReady();
      const result = await locked(`song:${id}`, () =>
        registerSong(entry, event),
      );
      await sql`UPDATE entries SET document=document || ${JSON.stringify({ ipId: result.ipId, registrationTx: result.txHash })}::jsonb WHERE id=${id}`;
      return json(result);
    }
    if (action === "offering") {
      await requireIdentity(["admin"]);
      const data = z
        .object({
          kind: z.enum(["commercial", "remix", "fan", "credit"]),
          priceUsd: z.number().min(0).max(100000),
          maxFee: z.string().regex(/^\d{1,25}$/),
          revenueShare: z.number().min(0).max(100),
        })
        .parse(input);
      if (
        ["fan", "credit"].includes(data.kind) &&
        (data.priceUsd !== 0 || BigInt(data.maxFee) !== 0n)
      )
        throw new HttpError(400, "Free licenses must have no minting fee.");
      const entry = await getEntry(id);
      if (!entry) throw new HttpError(404, "Entry not found.");
      const event = await getEvent(entry.eventId);
      if (!event) throw new HttpError(404, "Event not found.");
      if (data.priceUsd !== 0)
        throw new HttpError(
          400,
          "This pilot supports free testnet licenses only. Real checkout is not enabled.",
        );
      if (event.seedIpId)
        inheritedOffering(data.kind, data.maxFee, data.revenueShare, event);
      const existingOffer =
        await sql`SELECT document FROM offerings WHERE entry_id=${id} AND document->>'kind'=${data.kind} LIMIT 1`;
      if (existingOffer[0])
        return json({ offering: existingOffer[0].document });
      await ensureLicensingReady();
      const termsId = await locked(`offer:${id}:${data.kind}`, () =>
        attachOffering(
          entry,
          data.kind,
          data.maxFee,
          data.revenueShare,
          event.royaltyPolicy,
          event,
        ),
      );
      const labels = {
        commercial: [
          "Use it in your content / ads",
          "Use the original song commercially, with credit. No remixing.",
        ],
        remix: [
          "Remix it commercially",
          "Create a commercial remix with attribution and the stated revenue share.",
        ],
        fan: [
          "Remix it for fun",
          "Remix and share with credit. No commercial use.",
        ],
        credit: [
          "Use it freely with credit",
          "Remix and use commercially with attribution. These terms also permit AI learning.",
        ],
      };
      const offer: Offering = {
        ...data,
        id: randomUUID(),
        entryId: id,
        label: labels[data.kind][0],
        description: labels[data.kind][1],
        termsId,
        enabled: true,
      };
      const saved =
        await sql`INSERT INTO offerings(id,entry_id,document) VALUES(${offer.id},${id},${JSON.stringify(offer)}::jsonb) ON CONFLICT (entry_id,(document->>'kind')) DO UPDATE SET document=offerings.document RETURNING document`;
      return json({ offering: saved[0].document });
    }
    if (action === "purchase") {
      const user = await requireIdentity();
      const rows = await sql`SELECT document FROM offerings WHERE id=${id}`;
      const offer = rows[0]?.document as Offering | undefined;
      if (!offer?.enabled) throw new HttpError(404, "Offering unavailable.");
      const entry = await getEntry(offer.entryId);
      if (!entry || entry.state !== "submitted")
        throw new HttpError(404, "Song unavailable.");
      const prior =
        await sql`SELECT id,state FROM purchases WHERE owner_id=${user.id} AND offering_id=${offer.id}`;
      if (prior[0]?.state === "confirmed")
        return json({
          purchaseId: prior[0].id,
          certificateUrl: `/api/stage/certificate/${prior[0].id}`,
        });
      if (prior[0])
        throw new HttpError(
          409,
          "This test license mint already started. Its receipt must be reconciled before another attempt.",
        );
      await ensureLicensingReady();
      const purchaseId = randomUUID();
      await sql`INSERT INTO purchases(id,owner_id,offering_id,state,document) VALUES(${purchaseId},${user.id},${offer.id},'pending','{}')`;
      try {
        const result = await mintLicense(entry, offer, user.id);
        const certificate = {
          version: 1,
          purchaseId,
          license: offer,
          performance: {
            id: entry.id,
            title: entry.title,
            artist: entry.artist,
          },
          ...result,
          ingredients: entry.stems.map((s) => ({
            hash: s.evidence.hash,
            manifest: s.evidence.manifest,
          })),
          audioEndpoint: `/api/stage/audio/${entry.mixId}`,
          issuedAt: new Date().toISOString(),
          testLicense: true,
        };
        const mixed = await getMedia(entry.mixId);
        await sql.transaction([
          sql`UPDATE purchases SET state='confirmed',document=${JSON.stringify(certificate)}::jsonb WHERE id=${purchaseId}`,
          sql`INSERT INTO trace_outbox(id,document) VALUES(${purchaseId},${JSON.stringify({ kind: "sale", entryId: entry.id, hash: mixed?.evidence.hash, paymentStatus: "confirmed", txHash: result.txHash, createdAt: new Date().toISOString() })}::jsonb)`,
        ]);
        sendActivityAfterResponse();
        return json({
          purchaseId,
          certificateUrl: `/api/stage/certificate/${purchaseId}`,
        });
      } catch (e) {
        await sql`UPDATE purchases SET state='needs-review' WHERE id=${purchaseId}`;
        sendActivityAfterResponse();
        throw e;
      }
    }
    throw new HttpError(404, "Not found.");
  } catch (e) {
    return fail(e);
  }
}

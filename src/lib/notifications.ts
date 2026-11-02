import { createHash, randomUUID } from "node:crypto";
import webpush from "web-push";
import { db } from "./db";
import { HttpError } from "./auth";
import {
  allowedPushEndpoint,
  notificationHref,
  pushSubscriptionInput,
} from "./push-policy";

export async function syncNotifications(ownerId: string | null = null) {
  const sql = db();
  // Durable source records are reconciled on reads and dispatch. A failed dispatch cannot lose the activity.
  await sql`INSERT INTO notifications(id,owner_id,event_key,title,body,href)
    SELECT md5(source.owner_id || ':' || source.event_key),source.owner_id,source.event_key,source.title,source.body,source.href FROM (
      SELECT p.owner_id,j.id AS event_key,'Transcript ready' AS title,'Your saved transcript is ready to copy or download.' AS body,'/?entry=' || p.id AS href
      FROM jobs j JOIN entries p ON j.id='transcription:' || p.id WHERE j.state='complete' AND (length(trim(coalesce(j.document->>'transcript','')))>0 OR CASE WHEN jsonb_typeof(j.document->'turns')='array' THEN jsonb_array_length(j.document->'turns') ELSE 0 END>0)
      UNION ALL SELECT p.owner_id,j.id,'Meta feedback ready','Experimental, non-voting listening feedback is saved.','/?entry=' || p.id FROM jobs j JOIN entries p ON j.id='listening-preview:' || p.id WHERE j.state='complete'
      UNION ALL SELECT p.owner_id,'scorecard:' || s.id,'Agent review submitted','A competitive scorecard is available. Quality approval is separate.','/?entry=' || p.id FROM scorecards s JOIN entries p ON p.id=s.entry_id
      UNION ALL SELECT s.owner_id,'own-scorecard:' || s.id,'Your agent review was submitted','Your submitted scorecard is available. Quality approval is separate.','/?entry=' || s.entry_id FROM scorecards s
      UNION ALL SELECT a.owner_id,'review-assigned:' || a.id,'Review assigned','A performance has been assigned to your reviewing agent.','/?entry=' || a.entry_id FROM review_assignments a WHERE a.state='assigned'
      UNION ALL SELECT a.owner_id,'review-quality:' || a.id || ':' || a.state,'Review quality evaluated','A juror has evaluated your submitted review.','/?entry=' || a.entry_id FROM review_assignments a WHERE a.state IN ('accepted','rejected')
      UNION ALL SELECT p.owner_id,'license:' || p.id || ':' || p.state,CASE WHEN p.state='confirmed' THEN 'Test license confirmed' ELSE 'License needs review' END,CASE WHEN p.state='confirmed' THEN 'Your testnet certificate is available in My studio.' ELSE 'The mint needs reconciliation. Do not start another purchase.' END,'/?view=studio' FROM purchases p WHERE p.state IN ('confirmed','needs-review','failed')
      UNION ALL SELECT participants.owner_id,'event-closing:' || e.id,'Voting closes soon','Voting for ' || (e.document->>'name') || ' closes within 24 hours.','/?view=results' FROM events e JOIN (SELECT event_id,owner_id FROM entries UNION SELECT event_id,owner_id FROM votes) participants ON participants.event_id=e.id WHERE e.document->>'status'='voting' AND (e.document->>'votingCloses')::timestamptz > now() AND (e.document->>'votingCloses')::timestamptz <= now()+interval '24 hours'
    ) source JOIN users u ON u.id=source.owner_id WHERE (${ownerId}::text IS NULL OR source.owner_id=${ownerId}) ON CONFLICT(owner_id,event_key) DO NOTHING`;
}

export function pushConfigured() {
  return !!(
    process.env.PUSH_VAPID_PUBLIC_KEY && process.env.PUSH_VAPID_PRIVATE_KEY
  );
}
export async function notificationInbox(ownerId: string) {
  await syncNotifications(ownerId);
  const sql = db();
  const [rows, count] = await Promise.all([
    sql`SELECT id,title,body,href,created_at,read_at FROM notifications WHERE owner_id=${ownerId} ORDER BY created_at DESC,id DESC LIMIT 50`,
    sql`SELECT count(*)::int AS unread FROM notifications WHERE owner_id=${ownerId} AND read_at IS NULL`,
  ]);
  return {
    notifications: rows,
    unread: count[0].unread,
    publicKey: pushConfigured() ? process.env.PUSH_VAPID_PUBLIC_KEY : null,
  };
}
export async function markNotificationRead(ownerId: string, id?: string) {
  await db()`UPDATE notifications SET read_at=now() WHERE owner_id=${ownerId} AND read_at IS NULL AND (${id || null}::text IS NULL OR id=${id || null})`;
  return { ok: true };
}
export async function subscribePush(ownerId: string, input: unknown) {
  if (!pushConfigured())
    throw new HttpError(503, "Push notifications are being configured.");
  const subscription = pushSubscriptionInput.parse(input);
  const sql = db();
  // Record past activity before subscription creation so enabling push does not replay old messages.
  await syncNotifications(ownerId);
  const limit =
    await sql`SELECT count(*)::int AS n FROM push_subscriptions WHERE owner_id=${ownerId} AND enabled=true`;
  const existing =
    await sql`SELECT owner_id,keys,enabled FROM push_subscriptions WHERE endpoint=${subscription.endpoint}`;
  if (
    existing[0] &&
    JSON.stringify(existing[0].keys) !== JSON.stringify(subscription.keys)
  ) {
    if (
      existing[0].keys.auth !== subscription.keys.auth ||
      existing[0].keys.p256dh !== subscription.keys.p256dh
    )
      throw new HttpError(
        409,
        "This browser subscription has different keys. Disable it and try again.",
      );
  }
  if (
    limit[0].n >= 5 &&
    (!existing[0]?.enabled || existing[0]?.owner_id !== ownerId)
  )
    throw new HttpError(
      409,
      "Five devices are already subscribed. Disable another device first.",
    );
  const saved =
    await sql`INSERT INTO push_subscriptions(id,owner_id,endpoint,keys) VALUES(${randomUUID()},${ownerId},${subscription.endpoint},${JSON.stringify(subscription.keys)}::jsonb) ON CONFLICT(endpoint) DO UPDATE SET owner_id=EXCLUDED.owner_id,keys=EXCLUDED.keys,enabled=true,created_at=now() WHERE push_subscriptions.keys=EXCLUDED.keys RETURNING id`;
  if (!saved.length)
    throw new HttpError(
      409,
      "The device keys changed. Disable push and try again.",
    );
  return { ok: true };
}
export async function pushDeviceStatus(ownerId: string, endpoint: string) {
  const rows =
    await db()`SELECT id FROM push_subscriptions WHERE owner_id=${ownerId} AND endpoint=${endpoint} AND enabled=true`;
  return { enabled: !!rows.length };
}
export async function unsubscribePush(ownerId: string, endpoint: string) {
  await db()`DELETE FROM push_subscriptions WHERE owner_id=${ownerId} AND endpoint=${endpoint}`;
  return { ok: true };
}

type PushSender = (
  subscription: webpush.PushSubscription,
  payload: string,
  options: webpush.RequestOptions,
) => Promise<unknown>;
export async function dispatchPush(
  ownerId: string | null = null,
  send: PushSender = webpush.sendNotification,
) {
  await syncNotifications(ownerId);
  if (!pushConfigured()) return { configured: false, sent: 0, failed: 0 };
  const sql = db();
  await sql`INSERT INTO push_deliveries(id,notification_id,subscription_id)
    SELECT md5(n.id || ':' || s.id),n.id,s.id FROM notifications n JOIN push_subscriptions s ON n.owner_id=s.owner_id WHERE s.enabled=true AND n.read_at IS NULL AND n.created_at>s.created_at AND (${ownerId}::text IS NULL OR n.owner_id=${ownerId}) ON CONFLICT(notification_id,subscription_id) DO NOTHING`;
  const rows = await sql`WITH candidates AS (
      SELECT d.id FROM push_deliveries d JOIN notifications n ON n.id=d.notification_id JOIN push_subscriptions s ON s.id=d.subscription_id AND s.owner_id=n.owner_id
      WHERE s.enabled=true AND n.read_at IS NULL AND d.attempts<5 AND d.next_attempt_at<=now() AND (d.state='pending' OR (d.state='sending' AND d.locked_at<now()-interval '5 minutes')) AND (${ownerId}::text IS NULL OR n.owner_id=${ownerId}) ORDER BY d.next_attempt_at LIMIT 20 FOR UPDATE OF d SKIP LOCKED
    ), claimed AS (UPDATE push_deliveries d SET state='sending',attempts=attempts+1,locked_at=now() FROM candidates c WHERE d.id=c.id RETURNING d.*)
    SELECT c.id,c.attempts,n.href,s.id AS subscription_id,s.endpoint,s.keys FROM claimed c JOIN notifications n ON n.id=c.notification_id JOIN push_subscriptions s ON s.id=c.subscription_id`;
  let sent = 0,
    failed = 0;
  for (const row of rows) {
    try {
      if (!allowedPushEndpoint(row.endpoint)) throw { statusCode: 410 };
      const receipt = await send(
        { endpoint: row.endpoint, keys: row.keys },
        JSON.stringify({
          title: "Agent Stage update",
          body: "You have a new update. Open Agent Stage to see it.",
          url: notificationHref(row.href),
          tag: row.id,
        }),
        {
          vapidDetails: {
            subject: "https://agent-stage-psi.vercel.app",
            publicKey: process.env.PUSH_VAPID_PUBLIC_KEY!,
            privateKey: process.env.PUSH_VAPID_PRIVATE_KEY!,
          },
          TTL: 3600,
          timeout: 5000,
        },
      );
      const status =
        Number((receipt as { statusCode?: number })?.statusCode) || null;
      await sql`UPDATE push_deliveries SET state='sent',last_status=${status} WHERE id=${row.id}`;
      sent++;
    } catch (error) {
      const status = Number((error as { statusCode?: number }).statusCode) || 0;
      const expired = status === 404 || status === 410;
      if (expired)
        await sql`UPDATE push_subscriptions SET enabled=false WHERE id=${row.subscription_id}`;
      await sql`UPDATE push_deliveries SET state=${expired || row.attempts >= 5 ? "failed" : "pending"},last_status=${status},next_attempt_at=now()+interval '5 minutes' WHERE id=${row.id}`;
      failed++;
    }
  }
  return { configured: true, sent, failed };
}

export async function testPush(ownerId: string) {
  if (!pushConfigured())
    throw new HttpError(503, "Push notifications are being configured.");
  const sql = db();
  const subscriptions =
    await sql`SELECT id FROM push_subscriptions WHERE owner_id=${ownerId} AND enabled=true LIMIT 1`;
  if (!subscriptions.length)
    throw new HttpError(409, "Enable push on this device first.");
  const eventKey = `push-test:${Math.floor(Date.now() / 60000)}`;
  const id = createHash("md5").update(`${ownerId}:${eventKey}`).digest("hex");
  const created =
    await sql`INSERT INTO notifications(id,owner_id,event_key,title,body,href) VALUES(${id},${ownerId},${eventKey},'Test notification','This is a requested push delivery test.','/?view=studio') ON CONFLICT(owner_id,event_key) DO NOTHING RETURNING id`;
  if (!created.length)
    throw new HttpError(
      409,
      "A test was already queued this minute. Check your device or try again next minute.",
    );
  const deliveries =
    await sql`INSERT INTO push_deliveries(id,notification_id,subscription_id,next_attempt_at) SELECT md5(${id} || ':' || s.id),${id},s.id,now()+interval '10 seconds' FROM push_subscriptions s WHERE s.owner_id=${ownerId} AND s.enabled=true RETURNING id`;
  if (!deliveries.length)
    throw new HttpError(409, "This device subscription is no longer enabled.");
  return { queued: true, delaySeconds: 10 };
}

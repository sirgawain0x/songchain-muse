import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import webpush from "web-push";
import {
  syncNotifications,
  notificationInbox,
  markNotificationRead,
  subscribePush,
  dispatchPush,
  pushDeviceStatus,
  unsubscribePush,
  testPush,
} from "../src/lib/notifications";
const original = process.env.DATABASE_URL;
if (!original) throw Error("DATABASE_URL required");
const root = neon(original);
const database = `notification_test_${randomUUID().replaceAll("-", "")}`;
await root.query(`CREATE DATABASE ${database}`);
try {
  const url = new URL(original);
  url.pathname = `/${database}`;
  process.env.DATABASE_URL = url.toString();
  const sql = neon(process.env.DATABASE_URL);
  assert.equal(
    (await sql`SELECT current_database() AS name`)[0].name,
    database,
  );
  for (const file of (await readdir("db"))
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort())
    await sql.transaction(
      (await readFile(`db/${file}`, "utf8"))
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => sql.query(s)),
    );
  await sql`INSERT INTO users(id,name,role) VALUES('owner','Fixture owner','artist'),('fan','Fixture fan','fan')`;
  const event = {
    status: "voting",
    name: "Isolated fixture",
    votingCloses: new Date(Date.now() + 12 * 3600000).toISOString(),
  };
  await sql`INSERT INTO events(id,document) VALUES('event',${JSON.stringify(event)}::jsonb)`;
  await sql`INSERT INTO entries(id,event_id,owner_id,document) VALUES('entry','event','owner','{}')`;
  await sql`INSERT INTO jobs(id,state,document) VALUES('transcription:entry','complete','{"transcript":"Private fixture transcript"}'),('listening-preview:entry','complete','{}')`;
  await sql`INSERT INTO offerings(id,entry_id,document) VALUES('offer','entry','{}')`;
  await sql`INSERT INTO purchases(id,owner_id,offering_id,state,document) VALUES('purchase','fan','offer','confirmed','{}')`;
  await syncNotifications();
  await syncNotifications();
  const owner = await notificationInbox("owner");
  const fan = await notificationInbox("fan");
  assert.equal(owner.notifications.length, 3);
  assert.equal(owner.unread, 3);
  assert.equal(fan.notifications.length, 1);
  assert.ok(!JSON.stringify(owner).includes("Private fixture transcript"));
  await markNotificationRead("fan", owner.notifications[0].id);
  assert.equal((await notificationInbox("owner")).unread, 3);
  await markNotificationRead("owner", owner.notifications[0].id);
  assert.equal((await notificationInbox("owner")).unread, 2);
  await markNotificationRead("owner");
  assert.equal((await notificationInbox("owner")).unread, 0);
  assert.equal((await notificationInbox("fan")).unread, 1);
  const vapid = webpush.generateVAPIDKeys();
  process.env.PUSH_VAPID_PUBLIC_KEY = vapid.publicKey;
  process.env.PUSH_VAPID_PRIVATE_KEY = vapid.privateKey;
  const clientKeys = webpush.generateVAPIDKeys();
  const sub = {
    endpoint: "https://fcm.googleapis.com/fcm/send/isolated-test-never-deliver",
    keys: {
      p256dh: clientKeys.publicKey,
      auth: Buffer.alloc(16, 1).toString("base64url"),
    },
  };
  await assert.rejects(
    subscribePush("owner", { ...sub, endpoint: "https://127.0.0.1/private" }),
  );
  await subscribePush("owner", sub);
  assert.equal((await testPush("owner")).queued, true);
  await assert.rejects(testPush("owner"), /already queued/);
  const queuedTest =
    await sql`SELECT id FROM notifications WHERE owner_id='owner' AND event_key LIKE 'push-test:%'`;
  assert.equal(
    (
      await dispatchPush("owner", async () => {
        throw Error("Delayed test must not be sent early");
      })
    ).sent,
    0,
  );
  await markNotificationRead("owner", queuedTest[0].id);
  assert.equal((await pushDeviceStatus("owner", sub.endpoint)).enabled, true);
  assert.equal((await pushDeviceStatus("fan", sub.endpoint)).enabled, false);
  assert.equal(
    (
      await dispatchPush("owner", async () => {
        throw Error("Old history must not be pushed");
      })
    ).sent,
    0,
  );
  await sql`INSERT INTO notifications(id,owner_id,event_key,title,body,href) VALUES('new','owner','new','Private title','Private body','/?entry=entry')`;
  let calls = 0;
  const sender = async (_subscription: unknown, payload: string) => {
    calls++;
    assert.ok(!payload.includes("Private"));
    assert.ok(payload.includes("Agent Stage update"));
    return {};
  };
  await Promise.all([
    dispatchPush("owner", sender),
    dispatchPush("owner", sender),
  ]);
  assert.equal(calls, 1);
  await dispatchPush("owner", sender);
  assert.equal(calls, 1);
  await sql`INSERT INTO notifications(id,owner_id,event_key,title,body,href) VALUES('expired','owner','expired','Fixture','Fixture','/?view=studio')`;
  const expired = await dispatchPush("owner", async () => {
    throw { statusCode: 410 };
  });
  assert.equal(expired.failed, 1);
  assert.equal((await pushDeviceStatus("owner", sub.endpoint)).enabled, false);
  assert.ok(
    (await notificationInbox("owner")).unread > 0,
    "Inbox must persist even if push fails",
  );
  await unsubscribePush("fan", sub.endpoint);
  assert.equal(
    (await sql`SELECT count(*)::int AS n FROM push_subscriptions`)[0].n,
    1,
  );
  await unsubscribePush("owner", sub.endpoint);
  assert.equal(
    (await sql`SELECT count(*)::int AS n FROM push_subscriptions`)[0].n,
    0,
  );
  console.log(
    "Notification integration passed: real isolated Neon persistence, deduplication, account isolation, old-history suppression, concurrent dispatch claiming, generic payloads, expired subscriptions and inbox fallback. No browser push service was contacted.",
  );
} finally {
  process.env.DATABASE_URL = original;
  await root.query(`DROP DATABASE ${database} WITH (FORCE)`);
}

import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
async function call(path, body, cookie, origin) {
  return fetch(`${base}/api/stage/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(cookie ? { cookie } : {}),
      ...(origin ? { origin } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const status = await call("status");
assert.equal(status.status, 200);
assert.equal((await status.json()).checks.database, true);
assert.equal((await call("data")).status, 200);
assert.equal((await call("event", {})).status, 401);
assert.equal((await call("transcript/not-an-entry")).status, 401);
assert.equal((await call("notifications")).status, 401);
assert.equal((await call("push-subscribe", {})).status, 401);
assert.equal((await fetch(`${base}/api/notifications/dispatch`)).status, 401);
assert.equal((await call("profile", { name: "Visitor" })).status, 401);
assert.equal((await call("feed/not-a-performance")).status, 401);
assert.equal(
  (await call("logout", {}, undefined, "https://untrusted.example")).status,
  403,
);
const invites = JSON.parse(process.env.APP_INVITES || "[]");
const admin = invites.find((i) => i.role === "admin");
assert.ok(admin, "Run setup:local first");
const login = await call("login", { code: admin.code });
assert.equal(login.status, 200);
const cookie = login.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
const session = await call("session", undefined, cookie);
assert.equal((await session.json()).user.role, "admin");
const inbox = await call("notifications", undefined, cookie);
assert.equal(inbox.status, 200);
const activity = await inbox.json();
assert.ok(Array.isArray(activity.notifications));
assert.equal("privateKey" in activity, false);
assert.equal(
  (
    await call(
      "push-subscribe",
      { endpoint: "https://127.0.0.1/private", keys: {} },
      cookie,
    )
  ).status,
  400,
);
assert.equal((await call("event", {}, cookie)).status, 400);
assert.equal((await call("vote/not-an-entry", {}, cookie)).status, 404);
const fan = invites.find((i) => i.role === "fan");
const fanLogin = await call("login", { code: fan.code });
assert.equal(fanLogin.status, 200);
const fanCookie = fanLogin.headers.get("set-cookie")?.split(";")[0];
assert.equal((await call("event", {}, fanCookie)).status, 403);
const publishedEntries = (await (await call("data")).json()).entries;
const ownedEntry = publishedEntries.find((entry) => entry.ownerId === admin.id);
if (ownedEntry) {
  const saved = await call(`transcript/${ownedEntry.id}`, undefined, cookie);
  assert.equal(saved.status, 200);
  const { transcript } = await saved.json();
  assert.equal(
    (await call(`transcript/${ownedEntry.id}`, undefined, fanCookie)).status,
    404,
  );
  if (transcript) {
    assert.ok(transcript.text.length > 0);
    assert.equal("sessionId" in transcript, false);
    assert.equal("turns" in transcript, false);
  }
}
assert.equal((await call("profile", { name: "   " }, fanCookie)).status, 400);
const originalFan = (await (await call("session", undefined, fanCookie)).json())
  .user;
try {
  const renamed = await call(
    "profile",
    { name: "Reviewer name check", id: admin.id, role: "admin" },
    fanCookie,
  );
  assert.equal(renamed.status, 200);
  const renamedUser = (await renamed.json()).user;
  assert.equal(renamedUser.id, originalFan.id);
  assert.equal(renamedUser.role, "fan");
  assert.equal(renamedUser.name, "Reviewer name check");
  const again = await call("login", { code: fan.code });
  assert.equal(
    (await again.json()).user.name,
    "Reviewer name check",
    "Invitation sign-in must preserve the chosen name",
  );
  const adminSession = (await (await call("session", undefined, cookie)).json())
    .user;
  assert.equal(
    adminSession.name,
    admin.name,
    "A profile update cannot rename another owner",
  );
} finally {
  assert.equal(
    (await call("profile", { name: originalFan.name }, fanCookie)).status,
    200,
  );
}
assert.equal((await call("logout", {}, cookie)).status, 200);
console.log(
  "API checks passed: live Neon read, invite auth, sessions, role restrictions, validation, private feed, and cross-origin protection.",
);

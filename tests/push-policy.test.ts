import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedPushEndpoint,
  notificationHref,
  pushSubscriptionInput,
} from "../src/lib/push-policy";
test("push destinations cannot become arbitrary server requests", () => {
  assert.equal(
    allowedPushEndpoint("https://fcm.googleapis.com/fcm/send/example"),
    true,
  );
  assert.equal(
    allowedPushEndpoint(
      "https://updates.push.services.mozilla.com/wpush/v2/example",
    ),
    true,
  );
  assert.equal(allowedPushEndpoint("https://web.push.apple.com/example"), true);
  // Intentionally invalid credentials exercise URL rejection, not a real login.
  const credentialUrl = new URL("https://fcm.googleapis.com/test");
  credentialUrl.username = "fixture-user";
  credentialUrl.password = "fixture-password";
  for (const url of [
    "http://fcm.googleapis.com/test",
    "https://127.0.0.1/test",
    "https://169.254.169.254/metadata",
    "https://fcm.googleapis.com.attacker.test/test",
    "https://fcm.googleapis.com:8443/test",
    credentialUrl.href,
    "https://attacker.test/test",
  ])
    assert.equal(allowedPushEndpoint(url), false);
  assert.throws(() =>
    pushSubscriptionInput.parse({
      endpoint: "https://fcm.googleapis.com/test",
      keys: { p256dh: "invalid", auth: "invalid" },
    }),
  );
  assert.equal(notificationHref("https://attacker.test"), "/");
  assert.equal(notificationHref("//attacker.test"), "/");
  assert.equal(notificationHref("/?entry=abc-123"), "/?entry=abc-123");
});

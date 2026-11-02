# Notifications and Web Push

TL;DR: Signed-in users have a persistent inbox and can explicitly enable background Web Push on each device. Lock-screen alerts contain only a generic update message; private text stays inside Agent Stage. Agent webhooks are not implemented in this release.

## Activity and delivery

- Real completed transcript and Meta-preview jobs, competitive scorecards, confirmed/review-needed test licenses and approaching voting deadlines create deduplicated owner-scoped activity. Existing records populate the inbox without pretending they just completed: the UI labels the timestamp as when the update was added to activity.
- Completion routes attempt push after responding. A protected Vercel cron reconciles durable source records and retries pending deliveries every five minutes; Creative Projects was verified on Pro before configuring this schedule. Deadline reminders apply to participants in voting events ending within 24 hours.
- Enabling a device does not replay earlier activity as push. Deliveries are claimed with database locks, retry at most five times, and disable expired subscriptions after 404/410 responses. The inbox survives push failure. At-least-once delivery can repeat an alert after a crash; stable notification tags reduce duplicate display.
- A push-service acceptance is not proof that an operating system displayed an alert. Browser settings, device connectivity and notification permissions affect delivery. Push payloads expire after one hour; inbox records remain available.

## Controls

Open the bell next to Create an entry. Enable push, grant browser permission, then use Send test in 10 seconds and close the app to check background delivery. Tests are limited to one per minute and persist in the delivery queue if the immediate worker stops. Disable push on the same device at any time; the inbox remains available. On iPhone/iPad, add Agent Stage to the Home Screen and open it there before enabling push. No permission prompt opens automatically. There is a five-device limit per account.

Notifications link to their performance, My studio/license library or leaderboard. Opening a push after the app is closed uses the same account login and access checks; the service worker does not cache private pages or transcripts.

## Server configuration and access

- `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY` and `CRON_SECRET` are installed for Production. The private signing identity is also backed up under ignored `.data/push-config.json`, mode 0600. Neither secret is returned to the client.
- Migration `006_notifications.sql` creates notifications, device subscriptions and delivery records. Device endpoint/encryption keys stay server-side. Subscription destinations are restricted to supported browser push services to prevent arbitrary server-side requests.
- API: authenticated `GET /api/stage/notifications`; owner-scoped `POST notification-read`, `push-subscribe`, `push-status`, `push-unsubscribe`, `push-test`. Existing same-origin checks protect mutations. `GET /api/notifications/dispatch` requires the cron bearer secret.
- Web Push uses the browser's push service and the maintained `web-push` library. No email vendor or additional paid messaging account was installed. Marketplace discovery returned email tooling rather than a matching push provider.

## Verification limits

Tests use real temporary Neon databases for persistence, account isolation, deduplication, concurrent delivery claims, historical-message suppression and expired-subscription handling. The sender is injected in those tests; no fake subscription is delivered to an external service. A real device must opt in and receive the test alert before claiming closed-app delivery verified on that device.

References: [Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API), [web-push](https://github.com/web-push-libs/web-push), [Vercel cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

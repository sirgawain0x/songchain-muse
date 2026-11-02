self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification("Agent Stage update", {
      body: "You have a new update. Open Agent Stage to see it.",
      icon: "/icon.svg",
      tag: typeof payload.tag === "string" ? payload.tag : "agent-stage-update",
      data: { url: typeof payload.url === "string" ? payload.url : "/" },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  );
  const target =
    url.origin === self.location.origin ? url.href : self.location.origin;
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async (windows) => {
        for (const client of windows)
          if (new URL(client.url).origin === self.location.origin) {
            await client.navigate(target);
            return client.focus();
          }
        return clients.openWindow(target);
      }),
  );
});

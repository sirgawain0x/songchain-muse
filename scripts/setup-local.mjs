import { randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parseEnv } from "node:util";
let existing = "";
try {
  existing = await readFile(".env.local", "utf8");
} catch {}
const configured = parseEnv(existing);
const priorInvites = JSON.parse(configured.APP_INVITES || "[]");
if (!Array.isArray(priorInvites))
  throw new Error(
    "APP_INVITES must be a JSON array; existing settings were not replaced.",
  );
if (configured.SESSION_SECRET && configured.SESSION_SECRET.length < 32)
  throw new Error("Existing SESSION_SECRET is too short; it was not replaced.");
if (configured.SESSION_SECRET && priorInvites.length) {
  console.log("Local session setup already exists.");
  process.exit(0);
}
const invites = priorInvites.length
  ? priorInvites
  : ["admin", "artist", "fan", "juror"].map((role) => ({
      id: `team-${role}`,
      name: role === "admin" ? "G2" : `Team ${role}`,
      role,
      code: randomBytes(18).toString("base64url"),
    }));
let updated = existing;
const missingSettings = [];
if (!configured.SESSION_SECRET)
  missingSettings.push(["SESSION_SECRET", randomBytes(48).toString("hex")]);
if (!priorInvites.length)
  missingSettings.push(["APP_INVITES", `'${JSON.stringify(invites)}'`]);
for (const [key, value] of missingSettings) {
  const pattern = new RegExp(`^${key}=.*$`, "m");
  const line = `${key}=${value}`;
  updated = pattern.test(updated)
    ? updated.replace(pattern, () => line)
    : `${updated}\n${line}\n`;
}
await writeFile(".env.local", updated, { mode: 0o600 });
await mkdir(".data", { recursive: true });
await writeFile(
  ".data/team-access.txt",
  invites.map((x) => `${x.role}: ${x.code}`).join("\n"),
  { mode: 0o600 },
);
console.log(
  "Created local team invitations in .data/team-access.txt (ignored by Git).",
);

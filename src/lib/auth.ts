import { db } from "./db";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Identity } from "./domain";
export type { Identity } from "./domain";

export function configuredInvitations(): (Identity & { code: string })[] {
  return [
    ...JSON.parse(process.env.APP_INVITES || "[]"),
    ...JSON.parse(process.env.REVIEWER_INVITES || "[]"),
  ];
}
export function invitedOwners(): Identity[] {
  return configuredInvitations().map(({ id, name, role }: Identity) => ({
    id,
    name,
    role,
  }));
}
export function constantEqual(a: string, b: string) {
  const aa = createHmac("sha256", "agent-stage-comparison").update(a).digest();
  const bb = createHmac("sha256", "agent-stage-comparison").update(b).digest();
  return timingSafeEqual(aa, bb);
}
function sign(value: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error(
      "Configure SESSION_SECRET with at least 32 random characters.",
    );
  return createHmac("sha256", secret).update(value).digest("base64url");
}
export function sessionToken(identity: Identity, lifetimeSeconds = 86400) {
  const body = Buffer.from(
    JSON.stringify({
      ...identity,
      expires: Date.now() + lifetimeSeconds * 1000,
    }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}
export async function identity(): Promise<Identity | null> {
  const token = (await cookies()).get("stage-session")?.value;
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature || !constantEqual(sign(body), signature)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString());
    if (parsed.expires < Date.now()) return null;
    return await activeSessionOwner(parsed.id);
  } catch {
    return null;
  }
}
export async function activeSessionOwner(
  ownerId: string,
): Promise<Identity | null> {
  // A recovered fan profile keeps its data, but its old cookies lose access.
  const rows =
    await db()`SELECT u.id,u.name,u.role FROM users u WHERE u.id=${ownerId} AND (u.id NOT LIKE 'privy:%' OR EXISTS (SELECT 1 FROM privy_accounts p WHERE p.owner_id=u.id))`;
  return (rows[0] as Identity) || null;
}
export async function requireIdentity(roles?: Identity["role"][]) {
  const user = await identity();
  if (!user) throw new HttpError(401, "Sign in to continue.");
  if (roles && !roles.includes(user.role))
    throw new HttpError(
      403,
      "Your account does not have access to this action.",
    );
  return user;
}
export type AgentIdentity = {
  id: string;
  ownerId: string;
  name: string;
  key: string;
  focus: string;
};
export function agents(): AgentIdentity[] {
  const owners = new Set(invitedOwners().map((owner) => owner.id));
  return (
    JSON.parse(process.env.AGENT_IDENTITIES || "[]") as AgentIdentity[]
  ).filter((agent) => owners.has(agent.ownerId));
}
export function requireAgent(request: Request) {
  const key =
    request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const agent = agents().find(
    (a) => a.key.length >= 24 && constantEqual(a.key, key),
  );
  if (!agent)
    throw new HttpError(401, "A configured team agent key is required.");
  return agent;
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new HttpError(403, "Cross-origin requests are not allowed.");
}

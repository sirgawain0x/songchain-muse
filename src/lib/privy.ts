import { PrivyClient } from "@privy-io/node";
import { db } from "./db";
import { HttpError, invitedOwners, type Identity } from "./auth";
export function privyClient() {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret || appSecret === "[SENSITIVE]")
    throw new HttpError(503, "Privy is not configured.");
  return new PrivyClient({ appId, appSecret });
}
export async function privySignIn(
  token: string,
  current: Identity | null,
  link: boolean,
) {
  const client = privyClient();
  let claims;
  try {
    claims = await client.utils().auth().verifyAccessToken(token);
  } catch {
    throw new HttpError(
      401,
      "Privy sign-in could not be verified. Sign in again.",
    );
  }
  return {
    user: await resolvePrivyAccount(claims.user_id, current, link),
    expires: claims.expiration,
  };
}
// Only verified provider subjects may reach this function. No client names, emails or roles are accepted.
export async function resolvePrivyAccount(
  subject: string,
  current: Identity | null,
  link: boolean,
): Promise<Identity> {
  const sql = db();
  if (link && !current)
    throw new HttpError(
      401,
      "Sign in with your existing invitation before linking Privy.",
    );
  const existing =
    await sql`SELECT u.id,u.name,u.role FROM privy_accounts p JOIN users u ON u.id=p.owner_id WHERE p.privy_id=${subject}`;
  if (existing[0]) {
    if (current && existing[0].id !== current.id) {
      if (!link)
        throw new HttpError(
          409,
          "You are already signed in. Use Link Privy in Stage settings to keep your existing account.",
        );
      // Recover only an empty, automatically created fan profile. Both accounts
      // are proven: the provider token and the current invitation session.
      if (
        existing[0].role !== "fan" ||
        existing[0].id !== `privy:${subject}` ||
        !invitedOwners().some((owner) => owner.id === current.id)
      )
        throw new HttpError(
          409,
          "This Privy login belongs to another account. Contact the organizer for account recovery.",
        );
      let moved;
      try {
        moved = await sql`UPDATE privy_accounts SET owner_id=${current.id}
          WHERE privy_id=${subject} AND owner_id=${existing[0].id}
          AND NOT EXISTS (SELECT 1 FROM media WHERE owner_id=${existing[0].id})
          AND NOT EXISTS (SELECT 1 FROM entries WHERE owner_id=${existing[0].id})
          AND NOT EXISTS (SELECT 1 FROM votes WHERE owner_id=${existing[0].id})
          AND NOT EXISTS (SELECT 1 FROM purchases WHERE owner_id=${existing[0].id})
          AND NOT EXISTS (SELECT 1 FROM scorecards WHERE owner_id=${existing[0].id})
          AND NOT EXISTS (SELECT 1 FROM assistance WHERE owner_id=${existing[0].id} OR artist_id=${existing[0].id})
          AND NOT EXISTS (SELECT 1 FROM review_assignments WHERE owner_id=${existing[0].id})
          AND NOT EXISTS (SELECT 1 FROM jobs WHERE document->>'ownerId'=${existing[0].id})
          RETURNING owner_id`;
      } catch {
        throw new HttpError(
          409,
          "This account already has a Privy login. Contact the organizer for recovery.",
        );
      }
      if (!moved[0])
        throw new HttpError(
          409,
          "The fan account has activity to preserve. Contact the organizer to combine the accounts safely.",
        );
      return current;
    }
    return existing[0] as Identity;
  }
  if (current && !link)
    throw new HttpError(
      409,
      "Use Link Privy in Stage settings to connect this login to your current account.",
    );
  const ownerId = link ? current!.id : `privy:${subject}`;
  try {
    await sql.transaction([
      sql`INSERT INTO users(id,name,role) VALUES(${ownerId},'Music fan','fan') ON CONFLICT(id) DO NOTHING`,
      sql`INSERT INTO privy_accounts(privy_id,owner_id) VALUES(${subject},${ownerId}) ON CONFLICT DO NOTHING`,
    ]);
  } catch {
    throw new HttpError(
      409,
      "This account could not be linked. Try signing in again.",
    );
  }
  const rows =
    await sql`SELECT u.id,u.name,u.role FROM privy_accounts p JOIN users u ON u.id=p.owner_id WHERE p.privy_id=${subject}`;
  if (!rows[0] || rows[0].id !== ownerId)
    throw new HttpError(
      409,
      "An account is already linked. Sign out and try again.",
    );
  return rows[0] as Identity;
}

export async function privyConnection(ownerId: string) {
  const rows =
    await db()`SELECT linked_at FROM privy_accounts WHERE owner_id=${ownerId}`;
  return {
    connected: !!rows[0],
    linkedAt: rows[0] ? new Date(rows[0].linked_at).toISOString() : null,
  };
}

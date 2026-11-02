import { db } from "./db";
import { HttpError } from "./auth";
export async function locked<T>(
  id: string,
  action: () => Promise<T>,
): Promise<T> {
  const sql = db();
  const claimed =
    await sql`INSERT INTO jobs(id,state,document) VALUES(${id},'pending','{}') ON CONFLICT DO NOTHING RETURNING id`;
  if (!claimed.length) {
    const existing = await sql`SELECT state,document FROM jobs WHERE id=${id}`;
    if (existing[0]?.state === "confirmed") return existing[0].document as T;
    throw new HttpError(
      409,
      "This operation has already started. An administrator must reconcile its result before retrying.",
    );
  }
  try {
    const result = await action();
    await sql`UPDATE jobs SET state='confirmed',document=${JSON.stringify(result)}::jsonb WHERE id=${id}`;
    return result;
  } catch (e) {
    await sql`UPDATE jobs SET state='needs-review' WHERE id=${id}`;
    throw e;
  }
}

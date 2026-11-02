import { createHash } from "node:crypto";
import { db } from "./db";
import { HttpError } from "./auth";
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}
export async function flushTrace() {
  if (process.env.TRACE_ENABLED !== "true")
    return { status: "disabled", accepted: 0 };
  if (!process.env.TRACE_API_KEY || !process.env.TRACE_PROVIDER)
    throw new HttpError(
      503,
      "Trace needs a foundation-issued API key and provider identity.",
    );
  const sql = db();
  const rows =
    await sql`SELECT id,document FROM trace_outbox WHERE state='pending' ORDER BY id LIMIT 20`;
  let accepted = 0;
  for (const row of rows) {
    const payload = row.document;
    if (!/^[a-f0-9]{64}$/.test(payload.hash || "") || !payload.createdAt)
      continue;
    const metadata = {
      schema_version: "trace-v1.0",
      content_hash: `sha256:${payload.hash}`,
      app: { platform_name: "Agent Stage" },
      provider_payload: payload,
    };
    const root = `sha256:${createHash("sha256").update(canonicalJson(metadata)).digest("hex")}`;
    const response = await fetch(
      "https://staging-api.storyprotocol.net/webhook/v1/data-audit/records:batch",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": process.env.TRACE_API_KEY,
          "X-Provider": process.env.TRACE_PROVIDER,
          "X-Batch-Id": `agent-stage-${row.id}`,
        },
        body: JSON.stringify([
          {
            source_record_id: row.id,
            initial_metadata_root: root,
            initial_metadata_json: metadata,
            occurred_at: payload.createdAt,
          },
        ]),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok && response.status !== 409) continue;
    const result = await response.json();
    const items = result.items || result.results || result.records;
    const item = Array.isArray(items)
      ? items.find(
          (x: { source_record_id?: string }) => x.source_record_id === row.id,
        )
      : undefined;
    if (item && ["accepted", "duplicate"].includes(item.status)) {
      await sql`UPDATE trace_outbox SET state='accepted' WHERE id=${row.id}`;
      accepted++;
    }
  }
  return {
    status: "staging",
    accepted,
    note: "Accepted receipts are queued by Trace; this does not establish on-chain finality.",
  };
}

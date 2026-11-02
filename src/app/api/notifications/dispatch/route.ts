import { constantEqual } from "@/lib/auth";
import { dispatchPush } from "@/lib/notifications";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (
    !secret ||
    !constantEqual(
      request.headers.get("authorization") || "",
      `Bearer ${secret}`,
    )
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await dispatchPush(), {
    headers: { "Cache-Control": "no-store" },
  });
}

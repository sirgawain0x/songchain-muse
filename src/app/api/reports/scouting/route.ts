import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { isAddress, getAddress } from "viem";
import { z } from "zod";
import { withX402 } from "@x402/next";
import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { stageData } from "@/lib/repository";
import { db } from "@/lib/db";
import { buildScoutingReport } from "@/lib/scouting-report";

export const runtime = "nodejs";
export const maxDuration = 120;
const network = "eip155:84532" as const;
const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });

export async function GET(request: NextRequest) {
  // A production deployment must never silently advertise the public test service.
  if (process.env.VERCEL_ENV === "production")
    return json(
      {
        error:
          "Mainnet paid reports are not enabled. Production facilitator setup, pricing, and settlement verification are required.",
      },
      503,
    );
  const rawAddress = process.env.X402_TEST_PAY_TO;
  if (
    !rawAddress ||
    !isAddress(rawAddress) ||
    process.env.X402_TEST_NETWORK !== network
  )
    return json(
      { error: "Configure the Base Sepolia test recipient and network first." },
      503,
    );
  const payTo = getAddress(rawAddress);
  const parsed = z
    .string()
    .uuid()
    .safeParse(request.nextUrl.searchParams.get("eventId"));
  if (!parsed.success) return json({ error: "Provide a valid eventId." }, 400);
  const header = request.headers.get("payment-signature");
  if (header && header.length > 20000)
    return json({ error: "Payment authorization is too large." }, 400);
  const paymentHash = header
    ? createHash("sha256").update(header).digest("hex")
    : null;
  try {
    const sql = db();
    if (paymentHash) {
      const rows =
        await sql`SELECT * FROM report_payments WHERE payment_hash=${paymentHash}`;
      if (rows.length) {
        const previous = rows[0];
        if (
          previous.event_id !== parsed.data ||
          previous.network !== network ||
          previous.pay_to !== payTo
        )
          return json(
            { error: "This payment belongs to a different report." },
            403,
          );
        if (previous.state === "settled") {
          const response = json(previous.report);
          response.headers.set(
            "PAYMENT-RESPONSE",
            Buffer.from(JSON.stringify(previous.receipt)).toString("base64"),
          );
          return response;
        }
        return json(
          {
            error:
              "This payment needs reconciliation. Do not send another payment.",
            state: previous.state,
          },
          409,
        );
      }
    }
    const report = buildScoutingReport(parsed.data, await stageData());
    if (!report) return json({ error: "Event not found." }, 404);
    if (!report.performances.length)
      return json(
        { error: "This event has no submitted music to report on." },
        422,
      );
    const server = new x402ResourceServer(
      new HTTPFacilitatorClient({
        url: "https://x402.org/facilitator",
        timeoutMs: 30000,
      }),
    ).register(network, new ExactEvmScheme());
    const handler = withX402(
      async () => {
        if (!paymentHash)
          return json({ error: "A verified payment is required." }, 402);
        const inserted =
          await sql`INSERT INTO report_payments(payment_hash,event_id,network,pay_to,amount_atomic,state,report) VALUES(${paymentHash},${parsed.data},${network},${payTo},10000,'pending',${JSON.stringify({ ...report, testnet: true, testPriceUSDC: "0.01" })}::jsonb) ON CONFLICT DO NOTHING RETURNING payment_hash`;
        if (!inserted.length)
          return json(
            { error: "Payment is already processing. Do not pay again." },
            409,
          );
        return json({ ...report, testnet: true, testPriceUSDC: "0.01" });
      },
      {
        accepts: [{ scheme: "exact", price: "$0.01", network, payTo }],
        description:
          "TEST ONLY: event scouting snapshot. 0.01 Base Sepolia test USDC; no real-money price or music license.",
        mimeType: "application/json",
      },
      server,
    );
    const response = await handler(request);
    response.headers.set("Cache-Control", "private, no-store");
    if (paymentHash) {
      const receiptHeader = response.headers.get("payment-response");
      let receipt;
      try {
        receipt = receiptHeader
          ? JSON.parse(Buffer.from(receiptHeader, "base64").toString())
          : null;
      } catch {
        receipt = null;
      }
      if (
        response.status < 400 &&
        receipt?.success === true &&
        receipt.network === network &&
        /^0x[a-fA-F0-9]{64}$/.test(receipt.transaction || "")
      ) {
        await sql`UPDATE report_payments SET state='settled',receipt=${JSON.stringify(receipt)}::jsonb,transaction_hash=${receipt.transaction},settled_at=now() WHERE payment_hash=${paymentHash} AND state IN ('pending','needs-review')`;
      } else {
        await sql`UPDATE report_payments SET state='needs-review' WHERE payment_hash=${paymentHash} AND state='pending'`;
        if (response.status < 400)
          return json(
            {
              error:
                "Settlement could not be confirmed. Do not send another payment.",
            },
            503,
          );
      }
    }
    return response;
  } catch {
    // If a process dies during settlement, the durable pending record blocks recharging.
    return json(
      {
        error:
          "Report payment is unavailable or needs reconciliation. Do not send another payment if already authorized.",
      },
      503,
    );
  }
}

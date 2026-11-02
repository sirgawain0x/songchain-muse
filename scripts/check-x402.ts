import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { GET } from "../src/app/api/reports/scouting/route";
import { db } from "../src/lib/db";
const network = "eip155:84532";
const payTo = "0x1Fde40a4046Eda0cA0539Dd6c77ABF8933B94260";
const eventId = "bbe8c8e4-9440-4c09-ac7d-7cfa66674083";
process.env.X402_TEST_PAY_TO = payTo;
process.env.X402_TEST_NETWORK = network;
process.env.VERCEL_ENV = "preview";
const before = Number(
  (await db()`SELECT count(*) AS n FROM report_payments`)[0].n,
);
const url = `http://localhost/api/reports/scouting?eventId=${eventId}`;
const challenge = await GET(new NextRequest(url));
assert.equal(challenge.status, 402);
const encoded = challenge.headers.get("payment-required");
assert(encoded, "Official x402 challenge must be present");
const requirements = JSON.parse(Buffer.from(encoded, "base64").toString());
const option = requirements.accepts.find(
  (a: { network: string }) => a.network === network,
);
assert(option);
assert.equal(option.payTo.toLowerCase(), payTo.toLowerCase());
assert.equal(option.amount, "10000");
assert.equal(
  option.asset.toLowerCase(),
  "0x036cbd53842c5426634e7929541ec2318f3dcf7e",
);
assert.equal(
  (await challenge.text()).includes("performances"),
  false,
  "Unpaid responses must not contain the report",
);
const invalid = await GET(
  new NextRequest(url, { headers: { "payment-signature": "invalid-payment" } }),
);
assert(invalid.status >= 400, "Invalid payment must not unlock a report");
assert.equal((await invalid.text()).includes("performances"), false);
process.env.VERCEL_ENV = "production";
const production = await GET(new NextRequest(url));
assert.equal(
  production.status,
  503,
  "Production must not fall back to a public test facilitator",
);
assert.equal(
  Number((await db()`SELECT count(*) AS n FROM report_payments`)[0].n),
  before,
  "No unpaid payment records or receipts should be invented",
);
console.log(
  "Real x402 test-facilitator checks passed: Base Sepolia challenge, intended recipient, test USDC amount/asset, no unpaid report, invalid authorization blocked, production disabled, and no invented receipts. No funds moved; successful settlement still needs a wallet-signed test payment.",
);

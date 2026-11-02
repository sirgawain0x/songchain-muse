import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  certificateContentSecurityPolicy,
  renderLicenseCertificate,
} from "../src/lib/license-certificate";

const receipt = {
  purchaseId: "sample-record",
  performance: { title: "A song & its story", artist: "An artist" },
  license: {
    label: "Commercial remix",
    description: "Recorded terms",
    termsId: "42",
    revenueShare: 0,
  },
  tokenId: "123",
  receiver: "0x123",
  txHash: `0x${"a".repeat(64)}`,
  issuedAt: "2026-11-01T18:00:00.000Z",
  testLicense: true,
  ingredients: [{ hash: "abc123" }],
};

test("certificate preserves recorded terms and testnet limits without inventing ownership", () => {
  const html = renderLicenseCertificate(receipt, "Sample holder");
  for (const text of [
    "Sample holder",
    "A song &amp; its story",
    "No. 123",
    "Recorded terms",
    "0%",
    "abc123",
    "No real payment",
    "does not transfer copyright",
    "Print / Save PDF",
    "/api/stage/certificate/sample-record",
  ])
    assert.ok(html.includes(text), text);
  const script = html.match(/<script>(.*?)<\/script>/s)?.[1];
  assert.ok(script);
  assert.ok(
    certificateContentSecurityPolicy.includes(
      `'sha256-${createHash("sha256").update(script).digest("base64")}'`,
    ),
  );
  assert.ok(
    certificateContentSecurityPolicy.includes("frame-ancestors 'none'"),
  );
});

test("stored text and holder names cannot inject markup or transaction links", () => {
  const html = renderLicenseCertificate(
    {
      ...receipt,
      performance: {
        title: '<img src=x onerror="alert(1)">',
        artist: "<script>bad()</script>",
      },
      txHash: 'javascript:alert("bad")',
      purchaseId: 'x" onclick="bad',
    },
    "<svg onload=bad()>",
  );
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<svg"));
  assert.ok(!html.includes("<script>bad()"));
  assert.ok(!html.includes('href="javascript:'));
  assert.equal((html.match(/<script>/g) || []).length, 1);
  assert.ok(html.includes("&lt;img"));
});

test("certificate rejects non-testnet and incomplete records", () => {
  assert.throws(() =>
    renderLicenseCertificate({ ...receipt, testLicense: false }, "Holder"),
  );
  assert.throws(() =>
    renderLicenseCertificate({ ...receipt, issuedAt: "not a date" }, "Holder"),
  );
  assert.throws(() => renderLicenseCertificate({}, "Holder"));
});

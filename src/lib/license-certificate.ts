import { createHash } from "node:crypto";
import { storyAeneid } from "viem/chains";
import { z } from "zod";

const certificateSchema = z.object({
  purchaseId: z.string(),
  performance: z.object({ title: z.string(), artist: z.string() }),
  license: z.object({
    label: z.string(),
    description: z.string(),
    termsId: z.string(),
    revenueShare: z.number(),
  }),
  tokenId: z.string(),
  receiver: z.string(),
  txHash: z.string(),
  issuedAt: z.string().datetime({ offset: true }),
  testLicense: z.literal(true),
  ingredients: z.array(z.object({ hash: z.string() })).default([]),
});

const printScript =
  'document.getElementById("print-certificate").addEventListener("click",function(){window.print()});';
export const certificateContentSecurityPolicy = `default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${createHash("sha256").update(printScript).digest("base64")}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

function escapeHtml(value: string | number) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}

/** Render only a confirmed, owner-authorized stored receipt; never invent terms. */
export function renderLicenseCertificate(
  document: unknown,
  holderName: string,
) {
  const record = certificateSchema.parse(document);
  const e = escapeHtml;
  const receiptUrl = `/api/stage/certificate/${encodeURIComponent(record.purchaseId)}`;
  const transactionUrl = /^0x[0-9a-fA-F]{64}$/.test(record.txHash)
    ? `${storyAeneid.blockExplorers.default.url}/tx/${record.txHash}`
    : null;
  const issued = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(record.issuedAt));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<title>${e(record.performance.title)} · License certificate</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#e9ece6;color:#24392f;font-family:Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
a{color:inherit;text-underline-offset:4px}button,a{touch-action:manipulation}button:focus-visible,a:focus-visible{outline:3px solid #7b873e;outline-offset:5px}
.toolbar{max-width:1080px;margin:28px auto 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:0 4px}.brand{font-size:15px;font-weight:700;letter-spacing:-.5px}.actions{display:flex;align-items:center;gap:20px;font-size:13px}.print{border:0;border-radius:7px;padding:13px 20px;background:#24392f;color:#fff;font:inherit;cursor:pointer}.print-hint{max-width:1080px;margin:0 auto 16px;font-size:12px;color:#536053}
.certificate{position:relative;max-width:1080px;margin:0 auto 40px;padding:52px 62px 30px;background:#faf9f2;border:1px solid #c9cebc;box-shadow:0 15px 65px #25372a14;overflow:hidden}.certificate:before{content:"";position:absolute;inset:12px;border:1px solid #b7bea2;pointer-events:none}.certificate:after{content:"";position:absolute;width:330px;height:330px;right:-160px;top:150px;border:1px solid #d9ddca;border-radius:50%;box-shadow:0 0 0 24px #faf9f2,0 0 0 25px #d9ddca,0 0 0 50px #faf9f2,0 0 0 51px #d9ddca;pointer-events:none;opacity:.65}.content{position:relative;z-index:1}.topline{display:flex;justify-content:space-between;gap:15px;align-items:center}.eyebrow{text-transform:uppercase;letter-spacing:2.6px;font-size:10px;font-weight:700;margin:0}.badge{font-size:10px;letter-spacing:1px;text-transform:uppercase;border:1px solid #b9c29b;padding:8px 12px;border-radius:30px;background:#eff2de}.rule{height:1px;background:#cbd0bc;margin:28px 0 38px}.kicker{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#697754;margin:0 0 13px}h1{font:normal clamp(40px,7vw,73px)/1.04 Georgia,serif;letter-spacing:-2px;margin:0 0 27px}.intro{font:italic 18px/1.5 Georgia,serif;color:#67735b;margin:0 0 9px}.holder{font-size:25px;font-weight:500;margin:0 0 26px;overflow-wrap:anywhere}.track{border-left:3px solid #99a566;padding:3px 0 3px 22px;margin-bottom:30px}.track h2{font:normal 32px/1.2 Georgia,serif;letter-spacing:-.5px;margin:0 0 9px;overflow-wrap:anywhere}.track p{font-size:13px;color:#65705d;margin:0}.terms{font-size:14px;line-height:1.65;max-width:760px}.terms strong{display:block;font-size:15px;margin-bottom:6px}.facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;margin:30px 0}.facts dt,.detail dt{font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:1.6px;color:#69745c;margin-bottom:9px}.facts dd,.detail dd{margin:0;font-size:14px;line-height:1.5;overflow-wrap:anywhere}.bottom{display:flex;align-items:center;justify-content:space-between;gap:25px;border-top:1px solid #cbd0bc;padding-top:25px;margin-top:30px}.seal{width:88px;height:88px;border:1px solid #9ba773;outline:1px solid #c4cba9;outline-offset:5px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;flex-shrink:0;background:#edf0dc}.seal b{font:italic 33px Georgia,serif}.seal span{font-size:7px;letter-spacing:1.5px;margin-top:5px}.issuer{flex:1}.issuer strong{font-size:15px}.issuer p{font-size:11px;color:#6d775f;margin:7px 0}.record-id{max-width:260px;font-size:10px;line-height:1.6;overflow-wrap:anywhere}.notice{font-size:10px;line-height:1.65;color:#65705f;border-top:1px solid #dce0ce;padding-top:20px;margin:25px 0 0}
.details{max-width:1080px;margin:0 auto 48px;background:#f6f7f1;border:1px solid #d0d6c5;padding:28px 32px;border-radius:9px}.details h2{font:normal 24px Georgia,serif;margin:0 0 24px}.detail{margin:0 0 20px}.detail dd{font-family:monospace;font-size:12px}.detail dd+dd{margin-top:8px}.details p{font-size:12px;line-height:1.7;color:#56634e}.details code{overflow-wrap:anywhere}footer{max-width:1080px;margin:0 auto 35px;font-size:11px;color:#65705f}
@media(max-width:700px){.toolbar,.print-hint,footer{margin-left:18px;margin-right:18px}.toolbar{align-items:flex-start}.actions{gap:12px;flex-wrap:wrap;justify-content:flex-end}.certificate{margin:0 12px 22px;padding:35px 28px 25px}.topline{align-items:flex-start;flex-direction:column}.facts{grid-template-columns:repeat(2,minmax(0,1fr))}.track h2{font-size:27px}.bottom{flex-wrap:wrap}.record-id{max-width:100%;width:100%}.details{margin:0 12px 25px;padding:25px}.holder{font-size:22px}}
@page{size:A4 portrait;margin:12mm}@media print{body{background:white}.toolbar,.print-hint,footer{display:none}.certificate{max-width:none;margin:0;box-shadow:none;padding:38px 42px 28px;break-inside:avoid}.details{break-before:page;border:0;border-radius:0;padding:20px 0;margin:0;max-width:none}.detail{break-inside:avoid}h1{font-size:61px}.facts{grid-template-columns:repeat(3,minmax(0,1fr))}.certificate:before{inset:10px}.bottom{flex-wrap:nowrap}.record-id{width:auto;max-width:220px}a{text-decoration:none}}
</style></head><body>
<nav class="toolbar" aria-label="Certificate actions"><a class="brand" href="/">agentstage / SongChain</a><div class="actions"><a href="${e(receiptUrl)}" download>Download receipt (JSON)</a><button class="print" id="print-certificate">Print / Save PDF</button></div></nav>
<p class="print-hint">To keep a PDF, choose “Save as PDF” in your print dialog. Turn off browser headers and footers for a clean copy.</p>
<main><article class="certificate" aria-labelledby="certificate-title"><div class="content">
<header class="topline"><p class="eyebrow">Agent Stage · SongChain</p><span class="badge">Aeneid testnet · No real payment</span></header><div class="rule"></div>
<p class="kicker">A sound. A connection. New possibilities.</p><h1 id="certificate-title">Certificate<br>of music license.</h1>
<p class="intro">This license record is held by</p><p class="holder">${e(holderName)}</p>
<section class="track" aria-label="Licensed performance"><h2>${e(record.performance.title)}</h2><p>Music by ${e(record.performance.artist)}</p></section>
<section class="terms" aria-label="Recorded license terms"><strong>${e(record.license.label)}</strong>${e(record.license.description)}</section>
<dl class="facts"><div><dt>License token</dt><dd>No. ${e(record.tokenId)}</dd></div><div><dt>Issued · UTC</dt><dd>${e(issued)}</dd></div><div><dt>Recorded revenue share</dt><dd>${e(record.license.revenueShare)}%</dd></div></dl>
<div class="bottom"><div class="seal" aria-hidden="true"><b>AS</b><span>LICENSE RECORD</span></div><div class="issuer"><strong>Agent Stage</strong><p>Creative takes the lead.</p><p>Aeneid · Chain 1315</p></div><div class="record-id">RECORD ID<br>${e(record.purchaseId)}</div></div>
<p class="notice">Testnet demonstration only. This certificate presents the recorded license; it does not transfer copyright, establish authorship or independently verify legal rights. Recorded protocol terms govern the license. The recipient is an app-managed test account, separate from a Privy wallet. No real-money payment was collected.</p>
</div></article>
<section class="details" aria-labelledby="record-details"><h2 id="record-details">The record behind the music.</h2>
<dl><div class="detail"><dt>Recipient · app-managed Aeneid test account</dt><dd>${e(record.receiver)}</dd></div><div class="detail"><dt>Mint transaction</dt><dd>${transactionUrl ? `<a href="${e(transactionUrl)}" target="_blank" rel="noopener noreferrer">${e(record.txHash)} ↗</a>` : e(record.txHash)}</dd></div><div class="detail"><dt>Protocol license terms ID</dt><dd>${e(record.license.termsId)}</dd></div><div class="detail"><dt>Issued at · UTC</dt><dd>${e(record.issuedAt)}</dd></div><div class="detail"><dt>Ingredient SHA-256 records · ${record.ingredients.length}</dt>${record.ingredients.length ? record.ingredients.map((ingredient) => `<dd>${e(ingredient.hash)}</dd>`).join("") : "<dd>No ingredient hashes recorded.</dd>"}</div></dl>
<p>Ingredient hashes identify the recorded inputs; they do not establish source authenticity or signer trust. The JSON receipt includes the stored ingredient manifests and audio delivery endpoint. Keep it with this certificate.</p>
</section></main><footer>Issued from your confirmed Agent Stage license record. This certificate is available only to the signed-in holder.</footer><script>${printScript}</script></body></html>`;
}

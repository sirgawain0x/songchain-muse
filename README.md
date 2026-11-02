# Agent Stage

TL;DR: Agent Stage turns a shared vocal seed into a remix event with transparent ingredients, free listener voting, real Meta audio feedback and a confirmed Aeneid test license. The public pilot uses actual audio and provider receipts; it does not seed fabricated votes or reviewers.

**[Open the app](https://agent-stage-psi.vercel.app/) · [Judge walkthrough](docs/judge-guide.md) · [Architecture](docs/architecture.md)**

## Try the live pilot

Open **The stage → AI → Quiet Truth (Trap Beat Remix)**. Play the mix or its individual ingredients, read the published **Experimental Meta feedback**, and inspect the Aeneid registration links. The Meta feedback is non-voting; audience votes, competitive scorecards and jury decisions remain separate.

First Chapter is the original event in voting. Open Session is a separate event for new submissions. The live UI shows each event's current lifecycle and dates independently from its Open eligibility category. No administrator invitation is needed to inspect the public demonstration.

The real Aeneid test license is token **73230**: [mint receipt](https://aeneid.datanetscan.io/tx/0xee47c1f4e6616088f608f3c1f93726d7f993af72ce0c53a4afa1d5084136204f). The holder's designed certificate stays private. Its recipient is an app-managed test account, and no mainnet payment or commercial revenue is claimed.

## What is implemented

- Private Pinata uploads with byte-hash validation and signed C2PA ingredient relationships. Declarations, signature validity and signer trust are shown separately.
- Privy email/wallet login linked to stable accounts, invitation roles, free human voting and conflict-checked agent review assignments.
- Real Muse Spark 1.2 feedback comparing full seed/remix analysis audio, with structured rationales, durations and a saved provider response ID. Administrators explicitly publish a filtered non-voting version.
- Saved Muse Voice transcription, privately visible and copyable/downloadable by the artist and administrators.
- Direct performance links with copy confirmation and native sharing where the browser supports it. Sharing does not cast a vote.
- Aeneid seed/derivative registration and free test-license minting, with bounded sponsored gas, receipts and guarded retries.
- A persistent notification inbox and opt-in background Web Push with generic lock-screen messages, deduplicated deliveries and a protected retry/deadline scan. [Notification setup](docs/notifications.md).

## Limits of the demonstration

The pilot C2PA signer is untrusted: a valid upload signature does not prove earlier authorship or legal rights. G2 supplied the AI-generated music and declared remix/license permission; audio files, private invitations and signing credentials are not included in this source package.

Meta's musical observations and recognized words are experimental model outputs. Independent competitive judging stays disabled until an eligible reviewer joins and accepts an assignment. Paid license prices, production checkout, mainnet settlement, contributor claims, cash rewards, custom agent webhooks, Kleros and Jev are not demonstrated. Public sign-in alone is not Sybil-proof identity. Real-device push receipt and physical-phone acceptance must be verified on the device.

## Run a separate instance

Use Node.js 22 or later. Install dependencies from the lockfile:

```sh
npm ci
cp .env.example .env.local
npm run setup:local
```

Configure your own real Neon database through `DATABASE_URL`, then run:

```sh
npm run db:migrate
npm run dev
```

Open `http://127.0.0.1:3000`. Setup creates private local invitations in ignored `.data/team-access.txt`; the database starts empty. Sign in with your local administrator invitation and create an event with your own permitted seed. Missing services show an error rather than sample content.

Configure your own Pinata, Meta, Privy and optional Aeneid resources using `.env.example`. Keep private keys, API keys, invitation codes and push/cron secrets server-side. Use a separate database from the live pilot. Privy must allow your actual origin. The `env:sync` helper is for the original Vercel deployment; configure your own environment instead when running a separate instance.

For local provenance tests, `npm run setup:test-signer` downloads official, intentionally untrusted development fixtures into ignored `.data`. These public fixture keys are not a production signing identity. Testnet setup scripts generate fresh local credentials; they do not authorize mainnet operations or reproduce the existing pilot's custody identity.

## Verify

```sh
npm test
npm run build
npm run typecheck
```

With a separate configured Neon database, integration checks include `npm run test:auth`, `npm run test:reviews`, `npm run test:preview` and `npx tsx --env-file=.env.local scripts/check-notifications.ts`. These use temporary databases and require database-creation permission. Never point development verification at unrelated production data. `npm run test:api` requires a running local server and its own local invitations.

Unit tests cover eligibility, evidence limits, audio conversion, score validation, voting boundaries, license policies, certificates and push safety. Integration fixtures are never inserted as public contest activity. API checks, chain receipts and browser/phone verification establish different parts of the demonstration; none alone proves the entire user journey.

The dependency audit has unresolved upstream findings. See the [dependency review](docs/dependency-review.md) for the observed versions, advisories and production follow-up; passing checks do not clear those findings.

## Deploy

Run `npm run build` on Vercel with your own server-only environment configuration. Apply all numbered migrations before enabling the corresponding routes. `vercel.json` schedules the authenticated notification dispatcher every five minutes; this schedule requires an eligible Vercel plan. Disable or adjust the cron for a deployment that does not support that frequency. Never use builds to execute one-time blockchain operators.

No private media, local setup state, credential files or internal screenshot archives belong in a public source upload. Runtime keys and model calls remain server-side. See [architecture and boundaries](docs/architecture.md) for the data flow.

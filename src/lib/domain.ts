import { z } from "zod";

export const rulesets = ["Pure Human", "Assisted", "Open"] as const;
export type Ruleset = (typeof rulesets)[number];
export type Origin = "human" | "ai" | "ai-touched" | "unknown";
export type Evidence = {
  source: Origin;
  level: "tool-credentialed" | "platform-attested" | "unverified";
  signature: "valid" | "invalid" | "missing";
  trust: "trusted" | "untrusted" | "unknown";
  tool: string | null;
  hash: string;
  manifest: unknown;
  notes: string[];
};
export type Media = {
  id: string;
  ownerId: string;
  name: string;
  mime: string;
  size: number;
  cid: string;
  pinataId: string;
  evidence: Evidence;
  declaredSource: Origin;
  declaredTool: string;
  role: "seed" | "lead" | "stem" | "mix";
};
export type StageEvent = {
  id: string;
  name: string;
  subtitle: string;
  ruleset: Ruleset;
  aiCap: number | null;
  status: "draft" | "entries" | "voting" | "closed";
  votingOpens: string;
  votingCloses: string;
  seedId: string | null;
  seedArtist: string;
  seedOwnerId: string;
  seedIpId?: string;
  seedTermsId?: string;
  parentRevShare: number;
  royaltyPolicy: "LAP" | "LRP";
  juryWinner?: string;
};
export type Entry = {
  id: string;
  eventId: string;
  ownerId: string;
  artist: string;
  title: string;
  description: string;
  genre: string;
  lyrics: string;
  createdAt: string;
  mixId: string;
  stems: Media[];
  breakdown: ReturnType<typeof breakdown>;
  shares: { name: string; ownerId: string; percentage: number }[];
  state: "submitted" | "disqualified";
  ipId?: string;
  registrationTx?: string;
};
export type Scorecard = {
  qualityStatus?: "accepted" | "rejected";
  id: string;
  entryId: string;
  agentId: string;
  agentName: string;
  ownerId: string;
  model: string;
  createdAt: string;
  criteria: { name: string; score: number; rationale: string }[];
  vote: boolean;
  overall: number;
};
export type Offering = {
  id: string;
  entryId: string;
  kind: string;
  label: string;
  description: string;
  priceUsd: number;
  revenueShare: number;
  termsId: string;
  maxFee: string;
  enabled: boolean;
};
export type Identity = {
  id: string;
  name: string;
  role: "fan" | "artist" | "admin" | "juror";
};

export const eventInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    subtitle: z.string().trim().max(200),
    ruleset: z.enum(rulesets),
    aiCap: z.number().min(0).max(100).nullable(),
    votingOpens: z.iso.datetime(),
    votingCloses: z.iso.datetime(),
    seedId: z.string().min(1),
    seedArtist: z.string().trim().min(1).max(80),
    seedOwnerId: z.string().min(1).max(100),
    parentRevShare: z.number().min(0).max(100),
    royaltyPolicy: z.enum(["LAP", "LRP"]),
  })
  .refine(
    (x) => Date.parse(x.votingCloses) > Date.parse(x.votingOpens),
    "Voting must close after it opens",
  )
  .refine(
    (x) => x.ruleset !== "Assisted" || x.aiCap !== null,
    "Choose an explicit Assisted AI cap",
  );

export const entryInput = z
  .object({
    eventId: z.string().min(1),
    title: z.string().trim().min(2).max(100),
    description: z.string().trim().max(1200),
    genre: z.string().trim().min(1).max(50),
    lyrics: z.string().max(15000),
    mixId: z.string().min(1),
    stemIds: z.array(z.string()).min(1).max(20),
    shares: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          ownerId: z.string().min(1).max(100),
          percentage: z.number().positive().max(100),
        }),
      )
      .min(1)
      .max(20),
    consent: z.literal(true),
  })
  .refine(
    (x) =>
      Math.abs(x.shares.reduce((n, s) => n + s.percentage, 0) - 100) < 0.00001,
    "Contributor shares must total 100%",
  )
  .refine(
    (x) => new Set(x.stemIds).size === x.stemIds.length,
    "Each stem can appear once",
  );

export const scoreInput = z.object({
  criteria: z.tuple([
    z.object({
      name: z.literal("Songwriting"),
      score: z.number().min(0).max(100),
      rationale: z.string().min(10).max(1500),
    }),
    z.object({
      name: z.literal("Performance"),
      score: z.number().min(0).max(100),
      rationale: z.string().min(10).max(1500),
    }),
    z.object({
      name: z.literal("Originality"),
      score: z.number().min(0).max(100),
      rationale: z.string().min(10).max(1500),
    }),
    z.object({
      name: z.literal("Production"),
      score: z.number().min(0).max(100),
      rationale: z.string().min(10).max(1500),
    }),
  ]),
  vote: z.boolean(),
});

export function breakdown(stems: Pick<Media, "evidence">[]) {
  const counts = { human: 0, ai: 0, "ai-touched": 0, unknown: 0 };
  for (const stem of stems) counts[stem.evidence.source]++;
  return {
    ...counts,
    total: stems.length,
    aiPercent: stems.length
      ? ((counts.ai + counts["ai-touched"]) / stems.length) * 100
      : 0,
  };
}
export function hasHumanEvidence(media: Pick<Media, "evidence">) {
  return (
    media.evidence.source === "human" &&
    media.evidence.signature === "valid" &&
    media.evidence.trust === "trusted"
  );
}
export function eligibility(
  event: Pick<StageEvent, "ruleset" | "aiCap">,
  stems: Media[],
  assisted: boolean,
) {
  const errors: string[] = [];
  if (event.ruleset === "Pure Human") {
    if (assisted) errors.push("Agent assistance is not allowed in Pure Human.");
    if (stems.some((s) => !hasHumanEvidence(s)))
      errors.push(
        "Pure Human requires trusted human-source credentials for every stem. Upload declarations do not establish origin.",
      );
  }
  if (event.ruleset === "Assisted") {
    if (!stems.some((s) => s.role === "seed" && hasHumanEvidence(s)))
      errors.push("The seed needs trusted human-source credentials.");
    if (!stems.some((s) => s.role === "lead" && hasHumanEvidence(s)))
      errors.push("The lead element needs trusted human-source credentials.");
    if (event.aiCap === null)
      errors.push("An administrator must set the AI cap.");
    // Unknown stems count toward the cap until their source is established.
    const aiOrUnknown =
      (stems.filter((s) => s.evidence.source !== "human").length /
        stems.length) *
      100;
    if (event.aiCap !== null && aiOrUnknown > event.aiCap)
      errors.push(
        `AI and unknown-source stems exceed this division's ${event.aiCap}% cap.`,
      );
  }
  return errors;
}
export function voteWindow(
  event: Pick<StageEvent, "status" | "votingOpens" | "votingCloses">,
  now = Date.now(),
) {
  return (
    event.status === "voting" &&
    now >= Date.parse(event.votingOpens) &&
    now < Date.parse(event.votingCloses)
  );
}
export function acceptsEntries(
  event: Pick<StageEvent, "status" | "votingOpens">,
  now = Date.now(),
) {
  return event.status === "entries" && now < Date.parse(event.votingOpens);
}
export function eventLifecycleLabel(
  event: Pick<StageEvent, "status" | "votingOpens" | "votingCloses">,
  now = Date.now(),
) {
  if (event.status === "draft") return "Draft";
  if (event.status === "closed" || now >= Date.parse(event.votingCloses))
    return "Voting closed";
  if (acceptsEntries(event, now)) return "Accepting entries";
  if (event.status === "entries") return "Entries closed · awaiting voting";
  return now < Date.parse(event.votingOpens)
    ? "Voting scheduled"
    : "Voting open";
}
export function distribution(scores: number[]) {
  return {
    count: scores.length,
    mean: scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : null,
    min: scores.length ? Math.min(...scores) : null,
    max: scores.length ? Math.max(...scores) : null,
    scores,
  };
}

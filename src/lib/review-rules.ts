import { z } from "zod";

export const reviewEvaluation = z
  .object({
    decision: z.enum(["accepted", "rejected"]),
    audioEvidence: z.boolean(),
    rubricCoverage: z.boolean(),
    independentReasoning: z.boolean(),
    explanation: z.string().trim().min(20).max(1500),
  })
  .refine(
    (x) =>
      x.decision !== "accepted" ||
      (x.audioEvidence && x.rubricCoverage && x.independentReasoning),
    "Acceptance requires all three quality checks.",
  );

export function reviewerBadge(accepted: number) {
  return accepted >= 10
    ? "Consistent reviewer"
    : accepted >= 3
      ? "Reliable reviewer"
      : accepted >= 1
        ? "First accepted review"
        : "New reviewer";
}

export function independentReviewer(
  ownerId: string,
  entrantId: string,
  assisted: boolean,
) {
  return ownerId !== entrantId && !assisted;
}

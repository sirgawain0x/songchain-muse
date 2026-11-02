import type { StageData } from "./repository";

export function buildScoutingReport(eventId: string, data: StageData) {
  const event = data.events.find((e) => e.id === eventId);
  if (!event) return null;
  return {
    kind: "event-scouting-snapshot",
    version: 1,
    generatedAt: new Date().toISOString(),
    event: {
      id: event.id,
      name: event.name,
      ruleset: event.ruleset,
      status: event.status,
    },
    performances: data.entries
      .filter((e) => e.eventId === event.id && e.state === "submitted")
      .map((entry) => {
        const reviews = data.scorecards.filter(
          (c) => c.entryId === entry.id && c.qualityStatus === "accepted",
        );
        return {
          id: entry.id,
          title: entry.title,
          artist: entry.artist,
          genre: entry.genre,
          provenance: entry.breakdown,
          acceptedReviewCount: reviews.length,
          acceptedReviewMean: reviews.length
            ? reviews.reduce((sum, c) => sum + c.overall, 0) / reviews.length
            : null,
          independentReviews: reviews.map((c) => ({
            agent: c.agentName,
            model: c.model,
            criteria: c.criteria,
          })),
          availableLicenseCount: data.offerings.filter(
            (o) => o.entryId === entry.id && o.enabled,
          ).length,
          nextStep: reviews.length
            ? "Review the evidence and licensing terms before selecting music."
            : "Independent quality-reviewed agent analysis is not yet available.",
        };
      }),
    limitations: [
      "A factual aggregation of current platform records, not a new AI listening evaluation.",
      "Missing reviews are not zero scores. Upload declarations are not independent origin proof.",
      "This report grants no music license and creates no additional votes or reward entitlement.",
    ],
  };
}

export type TranscriptView = {
  text: string;
  durationSeconds: number | null;
  model: string;
};

// Extract only ASR text; never stringify provider metadata as lyrics.
export function transcriptView(value: unknown): TranscriptView | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const turns = Array.isArray(raw.turns) ? raw.turns : [];
  const turnText = turns
    .filter(
      (turn): turn is { transcript: string } =>
        !!turn &&
        typeof turn === "object" &&
        typeof turn.transcript === "string",
    )
    .map((turn) => turn.transcript)
    .join("\n");
  const text = (
    typeof raw.transcript === "string" && raw.transcript.trim()
      ? raw.transcript
      : turnText
  ).trim();
  if (!text || text.length > 100000) return null;
  return {
    text,
    durationSeconds:
      typeof raw.audioDurationMs === "number" &&
      Number.isFinite(raw.audioDurationMs) &&
      raw.audioDurationMs >= 0
        ? raw.audioDurationMs / 1000
        : null,
    model:
      typeof raw.model === "string" ? raw.model : "Muse Voice transcription",
  };
}

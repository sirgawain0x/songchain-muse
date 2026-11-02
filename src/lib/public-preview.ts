import { z } from "zod";

// Explicit allowlist: private job fields, storage locations and transcript never leave this boundary.
const previewSchema = z.object({
  entryId: z.string(),
  model: z.string().min(1),
  responseId: z.string().min(1),
  generatedAt: z.iso.datetime(),
  mode: z.literal("non-voting-preview"),
  affectsStandings: z.literal(false),
  limitation: z.string(),
  card: z.object({
    vote: z.literal(false),
    criteria: z
      .array(
        z.object({
          name: z.enum([
            "Songwriting",
            "Performance",
            "Originality",
            "Production",
          ]),
          score: z.number().min(0).max(100),
          rationale: z.string().min(1),
        }),
      )
      .length(4)
      .refine((items) => new Set(items.map((item) => item.name)).size === 4),
  }),
  audio: z
    .array(
      z.object({
        role: z.enum(["seed", "mix"]),
        durationSeconds: z.number().positive(),
      }),
    )
    .length(2)
    .refine((items) => new Set(items.map((item) => item.role)).size === 2),
});

export function publicPreview(value: unknown) {
  return previewSchema.parse(value);
}
export type PublicPreview = ReturnType<typeof publicPreview>;

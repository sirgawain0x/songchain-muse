import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Evidence, Media, Origin } from "./domain";
import { HttpError } from "./auth";

export function signerConfigured() {
  return !!(
    (process.env.C2PA_CERT_PATH && process.env.C2PA_KEY_PATH) ||
    (process.env.C2PA_CERT_BASE64 && process.env.C2PA_KEY_BASE64)
  );
}

export function sourceType(value: string): Origin {
  const type = value.split("/").pop();
  if (type === "trainedAlgorithmicMedia") return "ai";
  if (
    ["compositeWithTrainedAlgorithmicMedia", "compositeSynthetic"].includes(
      type || "",
    )
  )
    return "ai-touched";
  if (["digitalCreation", "digitalCapture"].includes(type || ""))
    return "human";
  return "unknown";
}
export function sniffAudio(bytes: Buffer, mime: string) {
  const start = bytes.subarray(0, 16);
  const wav =
    start.subarray(0, 4).toString() === "RIFF" &&
    start.subarray(8, 12).toString() === "WAVE";
  const flac = start.subarray(0, 4).toString() === "fLaC";
  const mp3 =
    start.subarray(0, 3).toString() === "ID3" ||
    (start[0] === 0xff && (start[1] & 0xe0) === 0xe0);
  const m4a = start.subarray(4, 8).toString() === "ftyp";
  if (
    !(mime.includes("wav")
      ? wav
      : mime.includes("flac")
        ? flac
        : /mp4|m4a/.test(mime)
          ? m4a
          : mp3)
  )
    throw new HttpError(
      415,
      "The audio bytes do not match the selected format.",
    );
}
export async function inspectAudio(
  bytes: Buffer,
  mime: string,
): Promise<Evidence> {
  sniffAudio(bytes, mime);
  const { Reader, Context } = await import("@contentauth/c2pa-node");
  const anchors = process.env.C2PA_TRUST_ANCHORS_PATH
    ? await readFile(process.env.C2PA_TRUST_ANCHORS_PATH, "utf8")
    : undefined;
  const hash = createHash("sha256").update(bytes).digest("hex");
  let reader;
  try {
    reader = await Reader.fromAsset(
      { buffer: bytes, mimeType: mime },
      new Context({
        verify: {
          verifyAfterReading: true,
          verifyTrust: true,
          remoteManifestFetch: false,
          ocspFetch: false,
        },
        ...(anchors ? { trust: { trustAnchors: anchors } } : {}),
      }),
    );
  } catch {
    return {
      source: "unknown",
      level: "unverified",
      signature: "invalid",
      trust: "unknown",
      tool: null,
      hash,
      manifest: null,
      notes: ["C2PA validation failed. Source is not established."],
    };
  }
  if (!reader)
    return {
      source: "unknown",
      level: "unverified",
      signature: "missing",
      trust: "unknown",
      tool: null,
      hash,
      manifest: null,
      notes: [
        "No Content Credentials. The upload declaration is not proof of origin.",
      ],
    };
  const store = reader.json();
  const manifest = reader.getActive();
  const statuses = store.validation_results?.activeManifest;
  const success = statuses?.success?.map((s) => s.code) || [];
  const failure = statuses?.failure?.map((s) => s.code) || [];
  const valid =
    success.includes("claimSignature.validated") &&
    success.some((s) =>
      /^assertion\.(dataHash|bmffHash|boxesHash)\.match$/.test(s),
    ) &&
    !failure.some((s) => !/untrusted/.test(s));
  const trusted = success.includes("signingCredential.trusted");
  const assertions = (manifest?.assertions || []).filter((a) =>
    a.label.startsWith("c2pa.actions"),
  );
  const actions = assertions.flatMap(
    (a) =>
      (
        a.data as {
          actions?: {
            digitalSourceType?: string;
            softwareAgent?: string | { name: string };
          }[];
        }
      )?.actions || [],
  );
  const origins = actions.map((a) => sourceType(a.digitalSourceType || ""));
  const source = !valid
    ? "unknown"
    : origins.includes("ai")
      ? "ai"
      : origins.includes("ai-touched")
        ? "ai-touched"
        : origins.includes("human")
          ? "human"
          : "unknown";
  const agent = actions.find((a) => a.softwareAgent)?.softwareAgent;
  return {
    source,
    level: valid ? "tool-credentialed" : "unverified",
    signature: valid ? "valid" : "invalid",
    trust: trusted ? "trusted" : "untrusted",
    tool: typeof agent === "string" ? agent : agent?.name || null,
    hash,
    manifest: store,
    notes: trusted
      ? []
      : [
          "Signer is not established as trusted. Signed claims are not independent proof of human creation.",
        ],
  };
}
export async function attestAudio(
  bytes: Buffer,
  mime: string,
  ownerId: string,
  declaredSource: string,
  declaredTool: string,
  ingredients: { media: Media; bytes: Buffer }[] = [],
) {
  if (
    !(process.env.C2PA_CERT_PATH && process.env.C2PA_KEY_PATH) &&
    !(process.env.C2PA_CERT_BASE64 && process.env.C2PA_KEY_BASE64)
  )
    throw new HttpError(
      503,
      "Configure the C2PA signing certificate and private key before submitting an entry.",
    );
  const { Builder, LocalSigner } = await import("@contentauth/c2pa-node");
  const signer = LocalSigner.newSigner(
    process.env.C2PA_CERT_BASE64
      ? Buffer.from(process.env.C2PA_CERT_BASE64, "base64")
      : await readFile(process.env.C2PA_CERT_PATH!),
    process.env.C2PA_KEY_BASE64
      ? Buffer.from(process.env.C2PA_KEY_BASE64, "base64")
      : await readFile(process.env.C2PA_KEY_PATH!),
    "es256",
    process.env.C2PA_TIMESTAMP_URL,
  );
  const builder = await Builder.withJsonAsync({
    title: "Agent Stage upload attestation",
    claim_generator_info: [{ name: "Agent Stage", version: "0.1.0" }],
    assertions: [],
  });
  builder.setIntent("edit");
  builder.addAssertion("org.agentstage.upload", {
    ownerId,
    declaredSource,
    declaredTool,
    at: new Date().toISOString(),
    scope:
      "Upload attestation only. Earlier creation history is not established.",
  });
  for (const ingredient of ingredients)
    await builder.addIngredient(
      JSON.stringify({
        title: ingredient.media.name,
        relationship: "componentOf",
      }),
      { buffer: ingredient.bytes, mimeType: ingredient.media.mime },
    );
  if (ingredients.length) {
    const composite = ingredients.some((i) =>
      ["ai", "ai-touched"].includes(i.media.evidence.source),
    )
      ? "compositeSynthetic"
      : ingredients.every((i) => i.media.evidence.source === "human")
        ? "composite"
        : null;
    builder.addAction(
      JSON.stringify({
        action: "c2pa.edited",
        ...(composite
          ? {
              digitalSourceType: `http://cv.iptc.org/newscodes/digitalsourcetype/${composite}`,
            }
          : {}),
        softwareAgent: { name: "Agent Stage" },
      }),
    );
  }
  const output: { buffer: Buffer | null } = { buffer: null };
  builder.sign(signer, { buffer: bytes, mimeType: mime }, output);
  if (!output.buffer)
    throw new HttpError(502, "The C2PA signer did not produce signed audio.");
  return output.buffer;
}

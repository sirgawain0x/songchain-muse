import assert from "node:assert/strict";
import { attestAudio, inspectAudio } from "../src/lib/provenance";
import type { Media } from "../src/lib/domain";
// A real PCM WAV, generated only for validation. It is never uploaded or entered.
const samples = 24000;
const wav = Buffer.alloc(44 + samples * 2);
wav.write("RIFF", 0);
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(24000, 24);
wav.writeUInt32LE(48000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++)
  wav.writeInt16LE(
    Math.round(Math.sin((2 * Math.PI * 440 * i) / 24000) * 5000),
    44 + i * 2,
  );
const unsigned = await inspectAudio(wav, "audio/wav");
assert.equal(unsigned.source, "unknown");
assert.equal(unsigned.signature, "missing");
const signed = await attestAudio(
  wav,
  "audio/wav",
  "test-owner",
  "human",
  "Declared DAW",
);
const verified = await inspectAudio(signed, "audio/wav");
assert.equal(
  verified.source,
  "unknown",
  "An upload declaration must never establish human origin",
);
assert.equal(verified.signature, "valid");
assert.equal(verified.trust, "untrusted");
const ingredient: Media = {
  id: "test-ingredient",
  ownerId: "test-owner",
  name: "Test ingredient.wav",
  mime: "audio/wav",
  size: signed.length,
  cid: "not-uploaded",
  pinataId: "not-uploaded",
  role: "stem",
  declaredSource: "unknown",
  declaredTool: "Test",
  evidence: verified,
};
const mixed = await attestAudio(
  wav,
  "audio/wav",
  "test-owner",
  "composite",
  "Agent Stage",
  [{ media: ingredient, bytes: signed }],
);
const composition = await inspectAudio(mixed, "audio/wav");
assert.equal(composition.signature, "valid");
assert.equal(
  composition.source,
  "unknown",
  "An unknown ingredient must not become a human-origin claim",
);
const manifest = composition.manifest as {
  active_manifest: string;
  manifests: Record<string, { ingredients: unknown[] }>;
};
assert.ok(
  manifest.manifests[manifest.active_manifest].ingredients.length >= 2,
  "The final manifest must preserve the stem plus the source mix ingredient",
);
const tampered = Buffer.from(signed);
let offset = 12;
let audioOffset = -1;
while (offset + 8 < tampered.length) {
  const chunk = tampered.subarray(offset, offset + 4).toString();
  const size = tampered.readUInt32LE(offset + 4);
  if (chunk === "data") {
    audioOffset = offset + 8;
    break;
  }
  offset += 8 + size + (size % 2);
}
assert.ok(audioOffset > 0, "The signed WAV must contain audio samples");
tampered[audioOffset + 128] ^= 1;
const failed = await inspectAudio(tampered, "audio/wav");
assert.notEqual(
  failed.signature,
  "valid",
  "A modified recording must not validate",
);
console.log(
  "Real C2PA round-trip passed: signed PCM WAV, unknown source preserved, untrusted test signer visible, and tampering rejected.",
);

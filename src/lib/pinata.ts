import { PinataSDK } from "pinata";
import { HttpError } from "./auth";
export const MAX_AUDIO_BYTES = 40 * 1024 * 1024;
export const audioTypes = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/flac",
  "audio/x-flac",
];
export function pinata() {
  if (!process.env.PINATA_JWT || !process.env.PINATA_GATEWAY)
    throw new HttpError(
      503,
      "Pinata needs PINATA_JWT and PINATA_GATEWAY before audio can be uploaded.",
    );
  return new PinataSDK({
    pinataJwt: process.env.PINATA_JWT,
    pinataGateway: process.env.PINATA_GATEWAY.replace(
      /^https?:\/\//,
      "",
    ).replace(/\/$/, ""),
  });
}
export async function privateAudio(cid: string) {
  const url = await pinata().gateways.private.createAccessLink({
    cid,
    expires: 120,
  });
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok)
    throw new HttpError(502, "Could not read the original audio from Pinata.");
  if (Number(response.headers.get("content-length")) > MAX_AUDIO_BYTES)
    throw new HttpError(413, "Audio must be 40 MB or smaller.");
  // Bound the stream even if the gateway omits Content-Length.
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    length += part.value.length;
    if (length > MAX_AUDIO_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "Audio must be 40 MB or smaller.");
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks);
}
export async function publishMetadata(metadata: object) {
  const upload = await pinata()
    .upload.public.json(metadata)
    .name("Agent Stage IP metadata");
  return `ipfs://${upload.cid}`;
}

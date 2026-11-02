import { mkdir, writeFile, readFile, chmod } from "node:fs/promises";
import { resolve } from "node:path";
// Publicly available C2PA development fixtures. These are never a trusted signing identity.
const directory = resolve(".data/c2pa");
await mkdir(directory, { recursive: true });
for (const [source, destination] of [
  ["es256.pem", "test-key.pem"],
  ["es256.pub", "test-cert.pem"],
]) {
  const response = await fetch(
    `https://raw.githubusercontent.com/contentauth/c2pa-rs/main/sdk/tests/fixtures/certs/${source}`,
  );
  if (!response.ok)
    throw new Error(
      "Could not download the official development signing fixtures.",
    );
  await writeFile(`${directory}/${destination}`, await response.text(), {
    mode: 0o600,
  });
  await chmod(`${directory}/${destination}`, 0o600);
}
let env = "";
try {
  env = await readFile(".env.local", "utf8");
} catch {}
if (!/^C2PA_CERT_PATH=/m.test(env))
  env += `\nC2PA_CERT_PATH=${directory}/test-cert.pem\nC2PA_KEY_PATH=${directory}/test-key.pem\n`;
await writeFile(".env.local", env, { mode: 0o600 });
console.log(
  "Official C2PA development fixtures configured locally. The UI must show an untrusted signer. Do not use these public test keys for production.",
);

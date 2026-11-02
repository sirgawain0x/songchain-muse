import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

// Private, app-specific pilot credentials. They are not a trusted CAI identity.
const directory = resolve(".data/app-signer");
await mkdir(directory, { recursive: true, mode: 0o700 });
try {
  await access(`${directory}/chain.pem`);
  console.log("Existing app signer retained; no keys replaced.");
  process.exit(0);
} catch {}
const run = (...args) =>
  execFileSync("openssl", args, { cwd: directory, stdio: "pipe" });
await writeFile(
  `${directory}/certificate.cnf`,
  `
[req]
distinguished_name=dn
prompt=no
[dn]
CN=Agent Stage Pilot Signer
O=Agent Stage
[root]
basicConstraints=critical,CA:TRUE
keyUsage=critical,keyCertSign,cRLSign
subjectKeyIdentifier=hash
[leaf]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,nonRepudiation
extendedKeyUsage=critical,emailProtection
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid,issuer
`,
  { mode: 0o600 },
);
run(
  "ecparam",
  "-name",
  "prime256v1",
  "-genkey",
  "-noout",
  "-out",
  "root-key.pem",
);
run(
  "req",
  "-new",
  "-x509",
  "-sha256",
  "-days",
  "730",
  "-key",
  "root-key.pem",
  "-out",
  "root-cert.pem",
  "-config",
  "certificate.cnf",
  "-extensions",
  "root",
  "-subj",
  "/O=Agent Stage/CN=Agent Stage Pilot Root",
);
run(
  "ecparam",
  "-name",
  "prime256v1",
  "-genkey",
  "-noout",
  "-out",
  "key-ec.pem",
);
run("pkcs8", "-topk8", "-nocrypt", "-in", "key-ec.pem", "-out", "key.pem");
run(
  "req",
  "-new",
  "-sha256",
  "-key",
  "key.pem",
  "-out",
  "signer.csr",
  "-config",
  "certificate.cnf",
);
run(
  "x509",
  "-req",
  "-sha256",
  "-days",
  "365",
  "-in",
  "signer.csr",
  "-CA",
  "root-cert.pem",
  "-CAkey",
  "root-key.pem",
  "-CAcreateserial",
  "-out",
  "cert.pem",
  "-extfile",
  "certificate.cnf",
  "-extensions",
  "leaf",
);
await writeFile(
  `${directory}/chain.pem`,
  Buffer.concat([
    await readFile(`${directory}/cert.pem`),
    await readFile(`${directory}/root-cert.pem`),
  ]),
  { mode: 0o600 },
);
// OpenSSL uses the process umask for its files; tighten every private key explicitly.
const { chmod } = await import("node:fs/promises");
for (const file of ["root-key.pem", "key-ec.pem", "key.pem"])
  await chmod(`${directory}/${file}`, 0o600);
console.log(
  "Created private app-specific pilot signer. Keep root-key.pem offline; deploy only key.pem and chain.pem. Trust remains unestablished; no human-origin verification is implied.",
);

import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { storyAeneid } from "viem/chains";
import { randomBytes } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
const directory = ".data/story-testnet";
await mkdir(directory, { recursive: true, mode: 0o700 });
await chmod(directory, 0o700);
const path = `${directory}/sponsor.env`;
let key;
try {
  const existing = await readFile(path, "utf8");
  key = existing.match(/^STORY_PRIVATE_KEY=(0x[0-9a-fA-F]{64})$/m)?.[1];
  if (!key)
    throw new Error(
      "Existing testnet configuration is invalid; it was not replaced.",
    );
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  key = generatePrivateKey();
  await writeFile(
    path,
    `STORY_PRIVATE_KEY=${key}\nCUSTODY_MASTER_KEY=${randomBytes(48).toString("hex")}\nSTORY_RPC_URL=${storyAeneid.rpcUrls.default.http[0]}\n`,
    { mode: 0o600, flag: "wx" },
  );
}
await chmod(path, 0o600);
const address = privateKeyToAccount(key).address;
await writeFile(
  `${directory}/wallet.json`,
  JSON.stringify(
    {
      network: "Story Aeneid",
      chainId: 1315,
      address,
      purpose: "Dedicated Agent Stage testnet sponsor; no mainnet use",
      faucet: "https://aeneid.faucet.datafdn.org/",
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    network: "Story Aeneid",
    chainId: 1315,
    address,
    credentialsSavedLocally: true,
    productionCredentialsInstalled: false,
  }),
);

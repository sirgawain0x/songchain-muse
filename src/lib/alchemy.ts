import { createPublicClient, http } from "viem";
import { base, baseSepolia, storyAeneid } from "viem/chains";
const networks = {
  base: { chain: base, host: "base-mainnet" },
  baseSepolia: { chain: baseSepolia, host: "base-sepolia" },
  storyAeneid: { chain: storyAeneid, host: "story-aeneid" },
} as const;
export function alchemyUrl(network: keyof typeof networks) {
  const key = process.env.ALCHEMY_API_KEY;
  if (!key || key === "[SENSITIVE]")
    throw new Error("Alchemy is not configured.");
  return `https://${networks[network].host}.g.alchemy.com/v2/${encodeURIComponent(key)}`;
}
export async function checkAlchemy() {
  return Promise.all(
    Object.entries(networks).map(async ([network, { chain }]) => {
      try {
        const client = createPublicClient({
          chain,
          transport: http(alchemyUrl(network as keyof typeof networks), {
            retryCount: 0,
            timeout: 10000,
          }),
        });
        const chainId = await client.getChainId();
        return { network, chainId, ok: chainId === chain.id };
      } catch {
        return { network, ok: false };
      }
    }),
  );
}

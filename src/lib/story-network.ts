import {
  http,
  parseTransaction,
  keccak256,
  type Hex,
  type Transport,
} from "viem";
import { storyAeneid } from "viem/chains";
import { db } from "./db";
import { HttpError } from "./auth";
import { alchemyUrl } from "./alchemy";
export const STORY_TEST_CHAIN_ID = 1315;
export const DEFAULT_MAX_TX_COST = 100000000000000000n; // 0.1 Aeneid native test tokens, including value.
export function storyRpcUrl() {
  return (
    process.env.STORY_RPC_URL ||
    (process.env.ALCHEMY_API_KEY
      ? alchemyUrl("storyAeneid")
      : storyAeneid.rpcUrls.default.http[0])
  );
}
export function assertStoryTransaction(
  tx: {
    chainId?: number;
    gas?: bigint;
    maxFeePerGas?: bigint;
    gasPrice?: bigint;
    value?: bigint;
  },
  ceiling = DEFAULT_MAX_TX_COST,
) {
  if (tx.chainId !== STORY_TEST_CHAIN_ID)
    throw new HttpError(409, "Only Story Aeneid transactions are permitted.");
  const rate = tx.maxFeePerGas ?? tx.gasPrice;
  if (
    !tx.gas ||
    tx.gas <= 0n ||
    rate === undefined ||
    rate < 0n ||
    ceiling <= 0n
  )
    throw new HttpError(
      409,
      "A bounded gas estimate is required before broadcasting.",
    );
  if ((tx.value ?? 0n) < 0n)
    throw new HttpError(409, "Transaction value cannot be negative.");
  const maximumCost = tx.gas * rate + (tx.value ?? 0n);
  if (maximumCost > ceiling)
    throw new HttpError(
      409,
      "This transaction exceeds the testnet sponsorship ceiling. No transaction was broadcast.",
    );
  return maximumCost;
}
export function storyTransport(
  canonicalRpcUrl: string = storyAeneid.rpcUrls.default.http[0],
): Transport {
  const base = http(storyRpcUrl(), { retryCount: 0, timeout: 30000 });
  const canonical = http(canonicalRpcUrl, { retryCount: 0, timeout: 30000 });
  return (options) => {
    const transport = base(options);
    const broadcaster = canonical(options);
    return {
      ...transport,
      request: (async (args: Parameters<typeof transport.request>[0]) => {
        if (args.method === "eth_sendTransaction")
          throw new HttpError(
            409,
            "Only locally signed, bounded Aeneid transactions are permitted.",
          );
        if (args.method !== "eth_sendRawTransaction")
          return transport.request(args);
        const raw = (args.params as readonly Hex[])[0];
        const transaction = parseTransaction(raw);
        const maximumCost = assertStoryTransaction(transaction);
        const chainId = await transport.request({ method: "eth_chainId" });
        if (Number(chainId) !== STORY_TEST_CHAIN_ID)
          throw new HttpError(409, "The RPC is not connected to Story Aeneid.");
        if (
          Number(await broadcaster.request({ method: "eth_chainId" })) !==
          STORY_TEST_CHAIN_ID
        )
          throw new HttpError(409, "The broadcaster is not Story Aeneid.");
        const [readGenesis, writeGenesis] = (await Promise.all([
          transport.request({
            method: "eth_getBlockByNumber",
            params: ["0x0", false],
          }),
          broadcaster.request({
            method: "eth_getBlockByNumber",
            params: ["0x0", false],
          }),
        ])) as [{ hash?: string }, { hash?: string }];
        if (!readGenesis?.hash || readGenesis.hash !== writeGenesis?.hash)
          throw new HttpError(
            409,
            "The read and broadcast nodes disagree on the Aeneid genesis block.",
          );
        const hash = keccak256(raw);
        const document = {
          hash,
          chainId: STORY_TEST_CHAIN_ID,
          to: transaction.to,
          nonce: transaction.nonce,
          maximumCostWei: maximumCost.toString(),
          createdAt: new Date().toISOString(),
          broadcastProvider: "canonical-aeneid",
          genesisHash: writeGenesis.hash,
        };
        const inserted =
          await db()`INSERT INTO jobs(id,state,document) VALUES(${`story-tx:${hash}`},'prepared',${JSON.stringify(document)}::jsonb) ON CONFLICT DO NOTHING RETURNING id`;
        if (!inserted.length)
          throw new HttpError(
            409,
            "This signed transaction is already recorded. Reconcile its receipt before retrying.",
          );
        try {
          const result = await broadcaster.request(args);
          if (result !== hash) throw new Error("Unexpected transaction hash");
          await db()`UPDATE jobs SET state='submitted' WHERE id=${`story-tx:${hash}`}`;
          return result;
        } catch {
          await db()`UPDATE jobs SET state='needs-review' WHERE id=${`story-tx:${hash}`}`;
          throw new HttpError(
            502,
            `Story transaction ${hash} needs receipt reconciliation. It will not be resent automatically.`,
          );
        }
      }) as typeof transport.request,
    };
  };
}

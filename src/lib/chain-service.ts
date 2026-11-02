// All chain-specific behavior stays here. This service deliberately supports testnet only.
import {
  StoryClient,
  PILFlavor,
  WIP_TOKEN_ADDRESS,
} from "@story-protocol/core-sdk";
import { http, type Address, type Hex, createPublicClient } from "viem";
import { storyAeneid } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createHash, createHmac } from "node:crypto";
import type { Entry, Offering, StageEvent } from "./domain";
import { HttpError } from "./auth";
import {
  storyRpcUrl,
  storyTransport,
  STORY_TEST_CHAIN_ID,
} from "./story-network";
import { inheritedOffering } from "./story-policy";
import { db } from "./db";
import { publishMetadata } from "./pinata";

export function storyClient() {
  const key = process.env.STORY_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key))
    throw new HttpError(
      503,
      "Licensing needs a funded test account configured by the administrator.",
    );
  return StoryClient.newClient({
    account: privateKeyToAccount(key as Hex),
    chainId: "aeneid",
    transport: storyTransport(),
  });
}
function sponsorAddress() {
  return privateKeyToAccount(process.env.STORY_PRIVATE_KEY as Hex).address;
}
export async function ensureLicensingReady() {
  // No external writes: configuration errors must be caught before idempotency locks.
  storyClient();
  const collection = await nft(buyerAddress("configuration-preflight"));
  const rpc = createPublicClient({
    chain: storyAeneid,
    transport: http(storyRpcUrl(), { retryCount: 0, timeout: 10000 }),
  });
  if ((await rpc.getChainId()) !== STORY_TEST_CHAIN_ID)
    throw new HttpError(409, "The licensing RPC is not Story Aeneid.");
  const code = await rpc.getCode({
    address: collection.spgNftContract,
  });
  if (!code || code === "0x")
    throw new HttpError(
      503,
      "The registration collection is not deployed on Aeneid.",
    );
  if ((await rpc.getBalance({ address: sponsorAddress() })) === 0n)
    throw new HttpError(
      503,
      "The Aeneid sponsor needs free Aeneid test tokens for gas.",
    );
  if (!process.env.PINATA_JWT || !process.env.PINATA_GATEWAY)
    throw new HttpError(
      503,
      "Configure Pinata before registering licensed music.",
    );
}
export async function registrationCollection(): Promise<Address | null> {
  if (
    process.env.STORY_SPG_NFT_CONTRACT &&
    /^0x[0-9a-fA-F]{40}$/.test(process.env.STORY_SPG_NFT_CONTRACT)
  )
    return process.env.STORY_SPG_NFT_CONTRACT as Address;
  const rows =
    await db()`SELECT document->>'spgNftContract' AS address FROM jobs WHERE id='story-collection:aeneid:v1' AND state='confirmed'`;
  const address = rows[0]?.address;
  return typeof address === "string" && /^0x[0-9a-fA-F]{40}$/.test(address)
    ? (address as Address)
    : null;
}
async function nft(recipient: Address) {
  const contract = await registrationCollection();
  if (!contract || !/^0x[0-9a-fA-F]{40}$/.test(contract))
    throw new HttpError(
      503,
      "The administrator must configure the app registration contract.",
    );
  return {
    type: "mint" as const,
    spgNftContract: contract as Address,
    recipient,
    allowDuplicates: false,
  };
}
function metadataHash(metadata: object) {
  return `0x${createHash("sha256").update(JSON.stringify(metadata)).digest("hex")}` as Hex;
}
export function buyerAddress(ownerId: string): Address {
  const master = process.env.CUSTODY_MASTER_KEY;
  if (!master || master.length < 64)
    throw new HttpError(
      503,
      "Buyer accounts are not configured. Ask the administrator to configure test-account custody.",
    );
  // A dedicated secret, separate from auth. These accounts must never be used on mainnet.
  return privateKeyToAccount(
    `0x${createHmac("sha256", master).update(`agent-stage-aeneid:${ownerId}`).digest("hex")}`,
  ).address;
}
export async function registerSeed(event: StageEvent, audioHash: string) {
  const story = storyClient();
  const data = {
    title: event.name + " — seed",
    creators: [{ name: event.seedArtist }],
    mediaHash: audioHash,
  };
  const uri = await publishMetadata(data);
  const terms = PILFlavor.commercialRemix({
    defaultMintingFee: 0n,
    commercialRevShare: event.parentRevShare,
    royaltyPolicy: event.royaltyPolicy === "LAP" ? 0 : 1,
    currency: WIP_TOKEN_ADDRESS,
    chainId: "aeneid",
  });
  const result = await story.ipAsset.registerIpAsset({
    nft: await nft(buyerAddress(event.seedOwnerId)),
    ipMetadata: {
      ipMetadataURI: uri,
      ipMetadataHash: metadataHash(data),
      nftMetadataURI: uri,
      nftMetadataHash: metadataHash(data),
    },
    licenseTermsData: [{ terms }],
    royaltyShares: [
      { recipient: buyerAddress(event.seedOwnerId), percentage: 100 },
    ],
  });
  if (!result.ipId || !result.licenseTermsIds?.[0])
    throw new HttpError(
      502,
      "Seed registration is awaiting reconciliation. Do not repeat the transaction.",
    );
  const receipt = result.txHash ? await recordStoryReceipt(result.txHash) : {};
  return {
    ...receipt,
    ipId: result.ipId,
    termsId: result.licenseTermsIds[0].toString(),
    txHash: result.txHash,
  };
}
export async function registerSong(entry: Entry, event: StageEvent) {
  if (!event.seedIpId || !event.seedTermsId)
    throw new HttpError(409, "Register the seed before registering the song.");
  const story = storyClient();
  const data = {
    title: entry.title,
    description: entry.description,
    creators: entry.shares.map((s) => ({
      name: s.name,
      address: buyerAddress(s.ownerId),
      contributionPercent: s.percentage,
    })),
    ingredients: entry.stems.map((s) => ({
      hash: s.evidence.hash,
      origin: s.evidence.source,
      evidence: s.evidence.level,
    })),
  };
  const uri = await publishMetadata(data);
  const result = await story.ipAsset.registerDerivativeIpAsset({
    nft: await nft(buyerAddress(entry.ownerId)),
    ipMetadata: {
      ipMetadataURI: uri,
      ipMetadataHash: metadataHash(data),
      nftMetadataURI: uri,
      nftMetadataHash: metadataHash(data),
    },
    derivData: {
      parentIpIds: [event.seedIpId as Address],
      licenseTermsIds: [BigInt(event.seedTermsId)],
      maxMintingFee: 0n,
      maxRevenueShare: event.parentRevShare,
    },
    royaltyShares: entry.shares.map((s) => ({
      recipient: buyerAddress(s.ownerId),
      percentage: s.percentage,
    })),
  });
  if (!result.ipId)
    throw new HttpError(
      502,
      "Song registration is awaiting reconciliation. Do not repeat the transaction.",
    );
  const receipt = result.txHash ? await recordStoryReceipt(result.txHash) : {};
  return { ...receipt, ipId: result.ipId, txHash: result.txHash };
}
export async function attachOffering(
  entry: Entry,
  kind: string,
  fee: string,
  revShare: number,
  policy: "LAP" | "LRP",
  event?: StageEvent,
) {
  if (!entry.ipId)
    throw new HttpError(409, "The song must be registered before licensing.");
  const story = storyClient();
  if (event?.seedIpId) {
    const termsId = inheritedOffering(kind, fee, revShare, event);
    const { terms } = await story.license.getLicenseTerms(BigInt(termsId));
    if (
      !terms.commercialUse ||
      !terms.derivativesAllowed ||
      !terms.derivativesReciprocal ||
      terms.defaultMintingFee !== 0n ||
      terms.commercialRevShare !== Math.trunc(event.parentRevShare * 1000000) ||
      terms.currency.toLowerCase() !== WIP_TOKEN_ADDRESS.toLowerCase()
    )
      throw new HttpError(
        409,
        "The inherited on-chain terms do not match this test offering.",
      );
    return termsId;
  }
  const shared = {
    royaltyPolicy: policy === "LAP" ? (0 as const) : (1 as const),
    currency: WIP_TOKEN_ADDRESS,
    chainId: "aeneid" as const,
  };
  const terms =
    kind === "commercial"
      ? PILFlavor.commercialUse({ ...shared, defaultMintingFee: BigInt(fee) })
      : kind === "remix"
        ? PILFlavor.commercialRemix({
            ...shared,
            defaultMintingFee: BigInt(fee),
            commercialRevShare: revShare,
          })
        : kind === "fan"
          ? PILFlavor.nonCommercialSocialRemixing()
          : PILFlavor.creativeCommonsAttribution(shared);
  const registered = await story.license.registerPILTerms(terms);
  if (!registered.licenseTermsId)
    throw new HttpError(502, "Could not register license terms.");
  await story.license.attachLicenseTerms({
    ipId: entry.ipId as Address,
    licenseTermsId: registered.licenseTermsId,
  });
  return registered.licenseTermsId.toString();
}
export async function mintLicense(
  entry: Entry,
  offering: Offering,
  ownerId: string,
) {
  if (!entry.ipId)
    throw new HttpError(409, "This song is not ready for licensing.");
  const story = storyClient();
  const receiver = buyerAddress(ownerId);
  const quote = await story.license.predictMintingLicenseFee({
    licensorIpId: entry.ipId as Address,
    licenseTermsId: BigInt(offering.termsId),
    amount: 1n,
    receiver,
  });
  // SDK treats a zero maxMintingFee as unlimited. Explicitly check free offerings too.
  if (
    quote.currencyToken.toLowerCase() !== WIP_TOKEN_ADDRESS.toLowerCase() ||
    quote.tokenAmount > BigInt(offering.maxFee)
  )
    throw new HttpError(
      409,
      "The license fee changed. Refresh the offering before purchasing.",
    );
  const result = await story.license.mintLicenseTokens({
    licensorIpId: entry.ipId as Address,
    licenseTermsId: BigInt(offering.termsId),
    amount: 1n,
    receiver,
    maxMintingFee: BigInt(offering.maxFee),
    maxRevenueShare: offering.revenueShare,
  });
  if (!result.txHash || !result.licenseTokenIds?.length)
    throw new HttpError(
      502,
      "The purchase needs reconciliation. No second purchase will be sent automatically.",
    );
  const receipt = await createPublicClient({
    chain: storyAeneid,
    transport: http(storyRpcUrl(), { retryCount: 0, timeout: 10000 }),
  }).waitForTransactionReceipt({ hash: result.txHash });
  if (receipt.status !== "success")
    throw new HttpError(502, "The license transaction did not succeed.");
  await recordStoryReceipt(result.txHash);
  return {
    tokenId: result.licenseTokenIds[0].toString(),
    txHash: result.txHash,
    receiver,
    gasUsed: receipt.gasUsed.toString(),
    gasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
    settlement:
      "License confirmed. Revenue is in the royalty vault; contributor claims are a separate operation.",
  };
}

export async function storySetupStatus() {
  const key = process.env.STORY_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key))
    return {
      network: "Story Aeneid",
      nativeSymbol: storyAeneid.nativeCurrency.symbol,
      chainId: 1315,
      signerConfigured: false,
      contractConfigured: false,
      ready: false,
    };
  const address = sponsorAddress();
  const rpc = createPublicClient({
    chain: storyAeneid,
    transport: http(storyRpcUrl(), { retryCount: 0, timeout: 10000 }),
  });
  const chainId = await rpc.getChainId();
  if (chainId !== STORY_TEST_CHAIN_ID)
    throw new HttpError(409, "The configured RPC is not Story Aeneid.");
  const balance = await rpc.getBalance({ address });
  const collection = await registrationCollection();
  const code =
    collection && /^0x[0-9a-fA-F]{40}$/.test(collection)
      ? await rpc.getCode({ address: collection as Address })
      : undefined;
  const contractConfigured = !!code && code !== "0x";
  return {
    network: "Story Aeneid",
    nativeSymbol: storyAeneid.nativeCurrency.symbol,
    chainId,
    address,
    signerConfigured: true,
    contractConfigured,
    balanceWei: balance.toString(),
    ready:
      balance > 0n && contractConfigured && !!process.env.CUSTODY_MASTER_KEY,
  };
}
export async function createStoryCollection() {
  const status = await storySetupStatus();
  if (
    !status.signerConfigured ||
    !status.balanceWei ||
    BigInt(status.balanceWei) === 0n
  )
    throw new HttpError(
      503,
      "Fund the dedicated Aeneid sponsor with free Aeneid test tokens first.",
    );
  if (status.contractConfigured)
    throw new HttpError(
      409,
      "A registration collection is already configured.",
    );
  const address = sponsorAddress();
  const metadata = {
    name: "Agent Stage — Aeneid Pilot",
    description:
      "Agent Stage testnet collection for the Quiet Truth licensing demonstration. No production assets or real-money purchases.",
    external_link: "https://agent-stage-psi.vercel.app/",
  };
  const contractURI = await publishMetadata(metadata);
  const result = await storyClient().nftClient.createNFTCollection({
    name: "Agent Stage Aeneid Pilot",
    symbol: "STAGE",
    owner: address,
    mintFeeRecipient: address,
    isPublicMinting: false,
    mintOpen: true,
    maxSupply: 100,
    mintFee: 0n,
    mintFeeToken: WIP_TOKEN_ADDRESS,
    contractURI,
  });
  if (!result.txHash || !result.spgNftContract)
    throw new HttpError(
      502,
      "The collection needs receipt reconciliation. Do not deploy it again.",
    );
  const receipt = await recordStoryReceipt(result.txHash);
  const rpc = createPublicClient({
    chain: storyAeneid,
    transport: http(storyRpcUrl(), { retryCount: 0, timeout: 10000 }),
  });
  const code = await rpc.getCode({ address: result.spgNftContract });
  if (!code || code === "0x")
    throw new HttpError(502, "The collection transaction needs verification.");
  return {
    ...result,
    ...receipt,
    chainId: 1315,
    owner: address,
    isPublicMinting: false,
    maxSupply: 100,
    contractURI,
  };
}
export async function recordStoryReceipt(hash: Hex) {
  const rpc = createPublicClient({
    chain: storyAeneid,
    transport: http(storyRpcUrl(), { retryCount: 0, timeout: 10000 }),
  });
  if ((await rpc.getChainId()) !== STORY_TEST_CHAIN_ID)
    throw new HttpError(409, "Receipt RPC is not Story Aeneid.");
  const receipt = await rpc.waitForTransactionReceipt({ hash, timeout: 60000 });
  const detail = {
    status: receipt.status,
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString(),
    gasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
  };
  await db()`UPDATE jobs SET state=${receipt.status === "success" ? "confirmed" : "failed"},document=document || ${JSON.stringify(detail)}::jsonb WHERE id=${`story-tx:${hash}`}`;
  if (receipt.status !== "success")
    throw new HttpError(502, "The Story testnet transaction reverted.");
  return detail;
}

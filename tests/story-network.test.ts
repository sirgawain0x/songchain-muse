import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { http } from "viem";
import { StoryClient, WIP_TOKEN_ADDRESS } from "@story-protocol/core-sdk";
import {
  assertStoryTransaction,
  storyTransport,
  DEFAULT_MAX_TX_COST,
} from "../src/lib/story-network";
import { inheritedOffering } from "../src/lib/story-policy";
test("Aeneid broadcasts require an explicit bounded gas cost, including value", () => {
  assert.equal(
    assertStoryTransaction({
      chainId: 1315,
      gas: 1000000n,
      maxFeePerGas: 1000000000n,
    }),
    1000000000000000n,
  );
  assert.throws(
    () => assertStoryTransaction({ chainId: 1514, gas: 21000n, gasPrice: 1n }),
    /Only Story Aeneid/,
  );
  assert.throws(
    () => assertStoryTransaction({ chainId: 1315, gas: 21000n }),
    /bounded gas estimate/,
  );
  assert.throws(
    () =>
      assertStoryTransaction({
        chainId: 1315,
        gas: 1n,
        gasPrice: 1n,
        value: DEFAULT_MAX_TX_COST,
      }),
    /ceiling/,
  );
  assert.throws(
    () =>
      assertStoryTransaction({
        chainId: 1315,
        gas: 1n,
        gasPrice: 1n,
        value: -1n,
      }),
    /negative/,
  );
});
test("a misconfigured RPC cannot receive a signed Aeneid transaction", async () => {
  let sends = 0;
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const part of req) body += part;
    const input = JSON.parse(body);
    if (input.method === "eth_sendRawTransaction") sends++;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ jsonrpc: "2.0", id: input.id, result: "0x5ea" }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const previous = process.env.STORY_RPC_URL;
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Expected local RPC test address");
    process.env.STORY_RPC_URL = `http://127.0.0.1:${address.port}`;
    const account = privateKeyToAccount(generatePrivateKey());
    const raw = await account.signTransaction({
      chainId: 1315,
      type: "eip1559",
      nonce: 0,
      to: account.address,
      gas: 21000n,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 0n,
      value: 0n,
    });
    const transport = storyTransport()({});
    await assert.rejects(
      transport.request({ method: "eth_sendRawTransaction", params: [raw] }),
      /RPC is not connected to Story Aeneid/,
    );
    await assert.rejects(
      transport.request({ method: "eth_sendTransaction", params: [] }),
      /locally signed/,
    );
    assert.equal(sends, 0);
  } finally {
    if (previous === undefined) delete process.env.STORY_RPC_URL;
    else process.env.STORY_RPC_URL = previous;
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
  }
});
test("derivative offers preserve reciprocal seed terms and cannot change permissions or fees", () => {
  const parent = { seedTermsId: "123", parentRevShare: 0 };
  assert.equal(inheritedOffering("remix", "0", 0, parent), "123");
  for (const kind of ["commercial", "fan", "credit"])
    assert.throws(() => inheritedOffering(kind, "0", 0, parent), /inherits/);
  assert.throws(() => inheritedOffering("remix", "1", 0, parent), /inherits/);
  assert.throws(() => inheritedOffering("remix", "0", 10, parent), /inherits/);
  assert.throws(
    () => inheritedOffering("remix", "0", 0, { parentRevShare: 0 }),
    /seed license/,
  );
});
test("the installed SDK can encode the private, free, supply-capped pilot collection without broadcasting", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const client = StoryClient.newClient({
    account,
    chainId: "aeneid",
    transport: http("http://127.0.0.1:1"),
  });
  const result = await client.nftClient.createNFTCollection({
    name: "Agent Stage Aeneid Pilot",
    symbol: "STAGE",
    owner: account.address,
    mintFeeRecipient: account.address,
    isPublicMinting: false,
    mintOpen: true,
    maxSupply: 100,
    mintFee: 0n,
    mintFeeToken: WIP_TOKEN_ADDRESS,
    contractURI: "ipfs://isolated-encoding-test",
    txOptions: { encodedTxDataOnly: true },
  });
  assert.ok(result.encodedTxData?.to);
  assert.ok(result.encodedTxData?.data);
  assert.equal(result.txHash, undefined);
});

test("read and broadcast nodes with different genesis blocks cannot receive a transaction", async () => {
  const counts = { sent: 0 };
  async function node(genesis: string) {
    const server = createServer(async (req, res) => {
      let body = "";
      for await (const p of req) body += p;
      const q = JSON.parse(body);
      if (q.method === "eth_sendRawTransaction") counts.sent++;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: q.id,
          result: q.method === "eth_chainId" ? "0x523" : { hash: genesis },
        }),
      );
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const a = server.address();
    if (!a || typeof a === "string") throw new Error("Expected test RPC");
    return { server, url: `http://127.0.0.1:${a.port}` };
  }
  const read = await node("0x1111"),
    write = await node("0x2222");
  const previous = process.env.STORY_RPC_URL;
  try {
    process.env.STORY_RPC_URL = read.url;
    const account = privateKeyToAccount(generatePrivateKey());
    const raw = await account.signTransaction({
      chainId: 1315,
      type: "eip1559",
      nonce: 0,
      to: account.address,
      gas: 21000n,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 0n,
      value: 0n,
    });
    await assert.rejects(
      storyTransport(write.url)({}).request({
        method: "eth_sendRawTransaction",
        params: [raw],
      }),
      /genesis/,
    );
    assert.equal(counts.sent, 0);
  } finally {
    if (previous === undefined) delete process.env.STORY_RPC_URL;
    else process.env.STORY_RPC_URL = previous;
    for (const n of [read, write])
      await new Promise<void>((r, j) =>
        n.server.close((e) => (e ? j(e) : r())),
      );
  }
});

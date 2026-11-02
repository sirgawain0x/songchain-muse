import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseEnv } from "node:util";
test("fresh example configuration gets usable local invitations without replacing existing settings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stage-setup-"));
  try {
    await writeFile(
      join(directory, ".env.local"),
      "SESSION_SECRET=\nAPP_INVITES=[]\nCUSTOM_SETTING=preserved\n",
    );
    const run = () =>
      spawnSync(process.execPath, [resolve("scripts/setup-local.mjs")], {
        cwd: directory,
        encoding: "utf8",
      });
    assert.equal(run().status, 0);
    const first = await readFile(join(directory, ".env.local"), "utf8");
    const config = parseEnv(first);
    assert.ok(config.SESSION_SECRET);
    assert.ok(config.SESSION_SECRET.length >= 32);
    assert.ok(config.APP_INVITES);
    assert.equal(JSON.parse(config.APP_INVITES).length, 4);
    assert.equal(config.CUSTOM_SETTING, "preserved");
    assert.equal(run().status, 0);
    assert.equal(await readFile(join(directory, ".env.local"), "utf8"), first);
    const partialSecret = "Existing#session_secret_that_must_stay_unchanged";
    await writeFile(
      join(directory, ".env.local"),
      `SESSION_SECRET='${partialSecret}'\nAPP_INVITES=[]\n`,
    );
    assert.equal(run().status, 0);
    assert.equal(
      parseEnv(await readFile(join(directory, ".env.local"), "utf8"))
        .SESSION_SECRET,
      partialSecret,
    );
    await writeFile(
      join(directory, ".env.local"),
      "SESSION_SECRET=too-short\nAPP_INVITES=[]\n",
    );
    assert.notEqual(run().status, 0);
    assert.ok(
      (await readFile(join(directory, ".env.local"), "utf8")).includes(
        "too-short",
      ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

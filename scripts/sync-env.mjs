import { spawnSync } from "node:child_process";
import { readFile, writeFile, chmod } from "node:fs/promises";
// Pull into a separate ignored file so local signers and invitations survive.
const pull = spawnSync(
  "vercel",
  ["env", "pull", ".env.vercel.local", "--yes", "--scope", "creative-projects"],
  { stdio: "inherit" },
);
if (pull.status !== 0) process.exit(pull.status || 1);
function parse(text) {
  return new Map(
    text
      .split("\n")
      .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*=/.test(line))
      .map((line) => [line.slice(0, line.indexOf("=")), line]),
  );
}
let old = "";
try {
  old = await readFile(".env.local", "utf8");
} catch {}
const values = parse(old);
for (const [key, value] of parse(await readFile(".env.vercel.local", "utf8")))
  values.set(key, value);
await writeFile(".env.local", [...values.values()].join("\n") + "\n", {
  mode: 0o600,
});
await chmod(".env.local", 0o600);
await chmod(".env.vercel.local", 0o600);
console.log(
  "Development environment synchronized. Local-only settings preserved; no secret values printed.",
);

import { readFile, readdir } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
if (!process.env.DATABASE_URL)
  throw new Error("Set DATABASE_URL in .env.local first.");
const sql = neon(process.env.DATABASE_URL);
for (const file of (await readdir("db"))
  .filter((f) => /^\d+.*\.sql$/.test(f))
  .sort()) {
  const statements = (await readFile(`db/${file}`, "utf8"))
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean);
  await sql.transaction(statements.map((statement) => sql.query(statement)));
}
console.log("Neon schema is ready. No sample entries or votes were inserted.");

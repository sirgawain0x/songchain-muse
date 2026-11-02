import { neon } from "@neondatabase/serverless";
export function db() {
  if (!process.env.DATABASE_URL)
    throw new Error(
      "Neon is not connected. Set DATABASE_URL, then run npm run db:migrate.",
    );
  return neon(process.env.DATABASE_URL);
}

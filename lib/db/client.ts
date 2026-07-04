import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { relations } from "@/lib/db/relations";

let database: NeonHttpDatabase<typeof relations> | null = null;

export function getDb() {
  if (!database) {
    const url = process.env.DATABASE_URL?.trim();

    if (!url) {
      throw new Error(
        "DATABASE_URL is required. Add Neon to this Vercel project first."
      );
    }

    database = drizzle({ client: neon(url), relations });
  }

  return database;
}

export const db = new Proxy({} as NeonHttpDatabase<typeof relations>, {
  get(_, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

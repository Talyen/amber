import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let cachedDb: NeonHttpDatabase<typeof schema> | null = null;

/**
 * Returns a Neon HTTP Drizzle instance when DATABASE_URL is configured.
 * Returns null in local/preview environments without a database so Amber
 * seamlessly falls back to pre-generated static SEC snapshots.
 */
export function getDb(): NeonHttpDatabase<typeof schema> | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  if (!cachedDb) {
    const sql = neon(url);
    cachedDb = drizzle(sql, { schema });
  }

  return cachedDb;
}

import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
const days = Number(process.argv[2] ?? 14);
if (!url) throw new Error("DATABASE_URL is required.");
if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error("Choose a range from 1 to 365 days.");

const sql = neon(url);
const rows = await sql`
  SELECT route_group AS route, source_group AS source, event, sum(count)::int AS total
  FROM distribution_counts
  WHERE day >= (now() at time zone 'UTC')::date - ${days - 1}::int
  GROUP BY route_group, source_group, event
  ORDER BY route_group, source_group, event
`;
console.table(rows);

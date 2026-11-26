import { Client } from "pg";

const database = new URL(process.env.AMBER_BROWSER_TEST_DATABASE_URL);
if (!["127.0.0.1", "localhost", "[::1]"].includes(database.hostname) ||
    !/^\/amber_browser_[a-f0-9]+$/.test(database.pathname)) {
  throw new Error("The browser fixture requires its own local Postgres database.");
}

const originalFetch = globalThis.fetch;
const rawText = { getTypeParser: () => (value) => value };
async function query(client, { query: statement, params }) {
  const { fields, rows, rowCount, command } = await client.query({
    text: statement, values: params, rowMode: "array", types: rawText,
  });
  return { fields, rows, rowCount, command };
}

// Exercise Drizzle and the normal HTTP route handlers against local Postgres.
globalThis.fetch = async (input, options) => {
  if (String(input) !== "https://api.amber-test.invalid/sql") return originalFetch(input, options);
  const body = JSON.parse(options.body);
  const client = new Client({ connectionString: database.href });
  try {
    await client.connect();
    if (!body.queries) return Response.json(await query(client, body));

    await client.query("BEGIN");
    const results = [];
    for (const statement of body.queries) results.push(await query(client, statement));
    await client.query("COMMIT");
    return Response.json({ results });
  } catch (error) {
    return Response.json({ message: error.message, code: error.code }, { status: 400 });
  } finally {
    await client.end();
  }
};

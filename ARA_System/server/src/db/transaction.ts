import { Client, neonConfig } from "@neondatabase/serverless";
import { env } from "../config/env.js";

export type TransactionQuery = (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;

// Persistent PostgreSQL session: callbacks, state changes and audit entries
// succeed together. Never retry committed or ambiguous writes automatically.
export async function withSqlTransaction<T>(work: (query: TransactionQuery) => Promise<T>): Promise<T> {
  neonConfig.webSocketConstructor ??= WebSocket;
  const client = new Client({ connectionString: env.databaseUrl });
  try {
    await client.connect();
    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    const result = await work((text, values) => client.query(text, values));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { await client.end().catch(() => undefined); }
}

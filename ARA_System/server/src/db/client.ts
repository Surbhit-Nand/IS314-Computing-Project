import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "../config/env.js";
import { retryTransient } from "../shared/retry/retry.js";
import * as schema from "./schema.js";

// Route every Neon HTTP query through a retrying fetch so transient blips
// (cold-start wakeups, brief connection timeouts) self-heal instead of
// surfacing as 500s. One choke point - every repository inherits it.
// Persistent failures still throw after 3 attempts, unchanged.
neonConfig.fetchFunction = (url: string, init?: RequestInit) =>
	retryTransient(() => fetch(url, init));

const sql = neon(env.databaseUrl);

export const db = drizzle(sql, { schema });

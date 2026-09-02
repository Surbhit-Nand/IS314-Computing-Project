import { app } from "./app.js";
import { env } from "./config/env.js";
import { warnOnSchemaDrift } from "./db/drift-check.js";

app.listen(env.port, () => {
	console.log(`ARA API listening on http://localhost:${env.port}`);
});

// Non-fatal: surfaces mismatches between schema.ts and the live DB at boot so
// missing-column crashes are caught early instead of mid-request.
void warnOnSchemaDrift().catch((error) => {
	console.error("[schema-drift] check failed:", error);
});

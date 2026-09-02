import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { staffRouter } from "./modules/staff/staff.routes.js";
import { animalsRouter } from "./modules/animals/animals.routes.js";
import { rescueRouter } from "./modules/rescue/rescue.routes.js";
import { donationsRouter } from "./modules/donations/donations.routes.js";

// The browser enforces CORS on every fetch to this API. During development
// several Vite dev servers can end up running (Vite auto-increments the port
// to 5174 when 5173 is already taken), so the allowed origin list covers the
// localhost dev ports rather than a single hard-coded origin. A request from
// any other origin is rejected - this is not an open CORS policy.
const allowedDevOrigins = [
	env.clientOrigin,
	"http://localhost:5173",
	"http://localhost:5174",
].filter((origin): origin is string => Boolean(origin));

export const app = express();

app.use(
	cors({
		origin(origin, callback) {
			// No origin (same-origin/curl/server-to-server) is allowed so the
			// health check and non-browser clients keep working.
			if (!origin || allowedDevOrigins.includes(origin)) {
				callback(null, true);
				return;
			}
			callback(new Error(`Origin ${origin} is not allowed by CORS`));
		},
	}),
);
app.use(express.json());
app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.use("/api/animals", animalsRouter);
app.use("/api/rescue", rescueRouter);
app.use("/api/donations", donationsRouter);
app.use("/api/admin", staffRouter);

app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
	void next;
	console.error("API request failed", error);
	response.status(500).json({ error: "Internal server error" });
});
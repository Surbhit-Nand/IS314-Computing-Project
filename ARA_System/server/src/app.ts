import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { staffRouter } from "./modules/staff/staff.routes.js";
import { animalsRouter } from "./modules/animals/animals.routes.js";
import { rescueRouter } from "./modules/rescue/rescue.routes.js";
import { donationsRouter } from "./modules/donations/donations.routes.js";
import { adoptionsRouter } from "./modules/adoptions/adoptions.routes.js";

export const app = express();

app.use(
	cors({
		origin: env.clientOrigin,
		allowedHeaders: ["Content-Type", "Authorization"],
		methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
	}),
);
app.use(express.json());
app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.use("/api/animals", animalsRouter);
app.use("/api/admin", staffRouter);
app.use("/api/rescue", rescueRouter);
app.use("/api/donations", donationsRouter);
app.use("/api/adoptions", adoptionsRouter);

app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
	void next;
	console.error("API request failed", error);
	response.status(500).json({ error: "Internal server error" });
});

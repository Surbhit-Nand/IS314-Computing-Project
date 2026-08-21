import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { staffRouter } from "./modules/staff/staff.routes.js";
import { animalsRouter } from "./modules/animals/animals.routes.js";

export const app = express();

app.use(cors({ origin: env.clientOrigin }));
app.use(express.json());
app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.use("/api/animals", animalsRouter);
app.use("/api/admin", staffRouter);

app.use((error: unknown, _request: express.Request, response: express.Response, next: express.NextFunction) => {
	void next;
	console.error("API request failed", error);
	response.status(500).json({ error: "Internal server error" });
});

import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { staffRouter } from "./modules/staff/staff.routes.js";
import { animalsRouter } from "./modules/animals/animals.routes.js";
import { rescueRouter } from "./modules/rescue/rescue.routes.js";
import { donationsRouter } from "./modules/donations/donations.routes.js";
import { adoptionsRouter } from "./modules/adoptions/adoptions.routes.js";
import { notificationsRouter } from "./modules/notifications/notifications.routes.js";
import { reportsRouter } from "./modules/reports/reports.routes.js";
import { veterinaryRouter } from "./modules/veterinary/veterinary.routes.js";
import { myAnimalsRouter } from "./modules/myAnimals/myAnimals.routes.js";
import { veterinaryAlertChanges } from "./modules/notifications/veterinaryAlerts.middleware.js";
import { webhooksRouter } from "./webhooks/webhooks.routes.js";
import { apiErrorHandler } from "./middleware/errorHandler.js";

export const app = express();

const configuredClientOrigin = new URL(env.clientOrigin);
const clientOrigins = new Set([env.clientOrigin]);
if (configuredClientOrigin.hostname === "localhost") {
	configuredClientOrigin.hostname = "127.0.0.1";
	clientOrigins.add(configuredClientOrigin.origin);
} else if (configuredClientOrigin.hostname === "127.0.0.1") {
	configuredClientOrigin.hostname = "localhost";
	clientOrigins.add(configuredClientOrigin.origin);
}

app.use(
	cors({
		origin: [...clientOrigins],
		allowedHeaders: ["Content-Type", "Authorization"],
		methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
	}),
);
// The webhook receiver must see the raw JSON body (signature verification
// runs against the exact bytes), and express.json() would consume the stream
// first - so it is mounted before the json parser. Clerk's own auth applies
// via the signing secret, so this route must not sit behind requireClerkSession.
app.use("/api/webhooks", webhooksRouter);
app.use(express.json());
app.use(veterinaryAlertChanges());
app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.use("/api/animals", animalsRouter);
app.use("/api/admin", staffRouter);
app.use("/api/rescue", rescueRouter);
app.use("/api/donations", donationsRouter);
app.use("/api/adoptions", adoptionsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/veterinary", veterinaryRouter);
app.use("/api/my-animals", myAnimalsRouter);

app.use(apiErrorHandler);

import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: "server/.env" });

const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!clerkSecretKey) {
	throw new Error("CLERK_SECRET_KEY is required to start the API");
}

if (!databaseUrl) {
	throw new Error("DATABASE_URL is required to start the API");
}

export const env = {
	clerkSecretKey,
	databaseUrl,
	port: Number(process.env.API_PORT ?? 8787),
	clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
};

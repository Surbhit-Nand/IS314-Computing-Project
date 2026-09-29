import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: "server/.env" });

const clerkSecretKey = process.env.CLERK_SECRET_KEY;
const clerkWebhookSigningSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
const databaseUrl = process.env.DATABASE_URL;
const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
const cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
const cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;

if (!clerkSecretKey) {
	throw new Error("CLERK_SECRET_KEY is required to start the API");
}

if (!databaseUrl) {
	throw new Error("DATABASE_URL is required to start the API");
}

// Cloudinary is optional at startup so local development can run without
// image-upload credentials. Uploads fail fast only when a route actually
// attempts to send a file to Cloudinary.

// Email (Resend) is optional the same way: when RESEND_API_KEY is absent the
// API boots fine and notifications stay in-app only - sendEmail() skips
// silently. Set both vars in server/.env (gitignored) to enable copies by
// email. EMAIL_FROM must be a sender address verified in Resend.
const resendApiKey = process.env.RESEND_API_KEY;
const emailFrom = process.env.EMAIL_FROM ?? "SPCA Fiji <noreply@spcafiji.org>";

// DEV-ONLY. Defaults to false/off whenever the variable is absent (including
// in production, where it should never be set). Lets a developer without
// Clerk dashboard access skip the staff-role check locally - see
// requireRole() in middleware/rbac.ts for where this is actually applied.
// The value only ever comes from server/.env, which is gitignored, so this
// can't turn on by accident from anything checked into version control.
const devBypassAuth = process.env.DEV_BYPASS_AUTH === "true";

if (devBypassAuth) {
	console.warn(
		"[DEV_BYPASS_AUTH] Role checks are bypassed for every request. " +
			"This must never be enabled outside local development.",
	);
}

export const env = {
	clerkSecretKey,
	clerkWebhookSigningSecret,
	databaseUrl,
	port: Number(process.env.API_PORT ?? 8787),
	clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
	cloudinaryCloudName,
	cloudinaryApiKey,
	cloudinaryApiSecret,
	resendApiKey,
	emailFrom,
	devBypassAuth,
};

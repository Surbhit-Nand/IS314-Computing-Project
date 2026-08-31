import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";

const hasCloudinaryConfig = Boolean(
	env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret,
);

// Configures the Cloudinary SDK once at startup, the same way clerkClient.ts
// configures the Clerk SDK. Everything that needs to upload an image imports
// `cloudinary` from here rather than configuring it itself.
if (hasCloudinaryConfig) {
	cloudinary.config({
		cloud_name: env.cloudinaryCloudName,
		api_key: env.cloudinaryApiKey,
		api_secret: env.cloudinaryApiSecret,
	});
} else {
	console.warn(
		"[Cloudinary] Missing configuration; image uploads will fail until CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are set.",
	);
}

export function isCloudinaryConfigured() {
	return hasCloudinaryConfig;
}

export { cloudinary };

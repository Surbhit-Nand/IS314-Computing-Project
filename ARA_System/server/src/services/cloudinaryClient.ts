import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";

// Configures the Cloudinary SDK once at startup, the same way clerkClient.ts
// configures the Clerk SDK. Everything that needs to upload an image imports
// `cloudinary` from here rather than configuring it itself.
cloudinary.config({
	cloud_name: env.cloudinaryCloudName,
	api_key: env.cloudinaryApiKey,
	api_secret: env.cloudinaryApiSecret,
});

export { cloudinary };

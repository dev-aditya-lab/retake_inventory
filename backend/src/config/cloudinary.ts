import { v2 as cloudinary } from "cloudinary";
import { env } from "./env";

/** True when all three Cloudinary credentials are set on the server. */
export function isCloudinaryConfigured(): boolean {
  return !!(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

let configured = false;

/** The shared Cloudinary client, configured on first use. Throws if the credentials are missing. */
export function getCloudinary() {
  if (!isCloudinaryConfigured()) throw new Error("Cloudinary is not configured on this server");
  if (!configured) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

import { api } from "./api";

export type ImageUploadPurpose = "product" | "deposit-proof";

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export function validateImageFile(
  file: File,
  maxSize = DEFAULT_MAX_FILE_SIZE,
) {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error("Only JPG, PNG, WEBP, or GIF images are allowed");
  }

  if (file.size > maxSize) {
    const mb = Math.round(maxSize / (1024 * 1024));
    throw new Error(`Image must be ${mb}MB or smaller`);
  }
}

export async function uploadToImageKit(
  file: File,
  purpose: ImageUploadPurpose,
): Promise<string> {
  validateImageFile(file);
  const auth = await api.uploadAuth(purpose);

  const formData = new FormData();
  formData.append("file", file);
  formData.append("fileName", file.name || `${purpose}-${Date.now()}`);
  formData.append("publicKey", auth.publicKey);
  formData.append("signature", auth.signature);
  formData.append("token", auth.token);
  formData.append("expire", String(auth.expire));
  formData.append("folder", auth.folder);
  formData.append("useUniqueFileName", "true");

  const response = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
    method: "POST",
    body: formData,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Image upload failed");
  }

  if (typeof data.url !== "string" || !data.url.startsWith(auth.urlEndpoint)) {
    throw new Error("Image upload returned an invalid URL");
  }

  return data.url;
}

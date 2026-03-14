// Local filesystem storage (replaces Manus Forge proxy)
// NOTE: Files are ephemeral on Render — lost on redeploy

import fs from "fs";
import path from "path";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

function ensureUploadDir(subdir: string): string {
  const dir = path.join(UPLOAD_DIR, path.dirname(subdir));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  _contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = relKey.replace(/^\/+/, "");
  ensureUploadDir(key);
  const filePath = path.join(UPLOAD_DIR, key);
  fs.writeFileSync(filePath, typeof data === "string" ? Buffer.from(data) : data);
  const url = `/uploads/${key}`;
  return { key, url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = relKey.replace(/^\/+/, "");
  return { key, url: `/uploads/${key}` };
}

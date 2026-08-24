import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { requiredEnv } from "@/lib/env";

function key(): Buffer {
  return createHash("sha256").update(requiredEnv("DRIVER_BRIDGE_ENCRYPTION_KEY")).digest();
}

export function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decrypt(value: string): string {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  if (!iv || !tag || !encrypted) throw new Error("Invalid encrypted value");
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function signPayload(payload: object): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", key()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyPayload<T>(token: string): T {
  const separator = token.lastIndexOf(".");
  if (separator < 1) throw new Error("Invalid signed payload");
  const encoded = token.slice(0, separator);
  const supplied = Buffer.from(token.slice(separator + 1), "base64url");
  const expected = createHmac("sha256", key()).update(encoded).digest();
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error("Invalid signed payload");
  }
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
}

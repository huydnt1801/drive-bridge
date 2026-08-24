import { randomUUID } from "node:crypto";
import { apiError } from "@/lib/response";

export class AppError extends Error {
  constructor(public code: string, message: string, public status = 500) { super(message); }
}

export function requestId(request: Request): string {
  return request.headers.get("x-request-id") || randomUUID();
}

export function errorResponse(error: unknown, id: string) {
  if (error instanceof AppError) return apiError(error.code, error.message, error.status, id);
  const message = error instanceof Error ? error.message : "Unexpected error";
  console.error(JSON.stringify({ level: "error", requestId: id, message: "request failed", error: message }));
  return apiError("INTERNAL_ERROR", "Unexpected server error", 500, id);
}

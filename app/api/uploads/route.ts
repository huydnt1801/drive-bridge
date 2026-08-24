import { z } from "zod";
import { initiateUpload, forwardUploadChunk } from "@/services/googleDriveService";
import { AppError, errorResponse, requestId } from "@/lib/http";
import { created, ok } from "@/lib/response";

export const runtime = "nodejs";
const schema = z.object({ connectionId: z.string().uuid(), name: z.string().min(1).max(500), mimeType: z.string().min(1).max(200), size: z.number().int().positive() });

export async function POST(request: Request) {
  const id = requestId(request);
  try { const input = schema.parse(await request.json()); return created({ session: await initiateUpload(input.connectionId, input.name, input.mimeType, input.size), chunkSize: 8 * 1024 * 1024 }, id); }
  catch (error) { if (error instanceof z.ZodError) return errorResponse(new AppError("VALIDATION_ERROR", error.issues[0]?.message || "Invalid upload", 400), id); return errorResponse(error, id); }
}

export async function PUT(request: Request) {
  const id = requestId(request);
  try {
    const session = new URL(request.url).searchParams.get("session"); const range = request.headers.get("content-range");
    if (!session || !range) throw new AppError("INVALID_UPLOAD_CHUNK", "Session and Content-Range are required", 400);
    return ok(await forwardUploadChunk(session, range, request.headers.get("content-type") || "application/octet-stream", await request.arrayBuffer()), id);
  } catch (error) { return errorResponse(error, id); }
}

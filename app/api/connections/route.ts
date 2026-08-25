import { z } from "zod";
import { connectionRepository } from "@/repositories/connectionRepository";
import { createOAuthUrl } from "@/services/googleDriveService";
import { created, ok } from "@/lib/response";
import { errorResponse, requestId } from "@/lib/http";

export const runtime = "nodejs";
const schema = z.object({ name: z.string().trim().min(1).max(80), folder: z.string().trim().min(1), connectionId: z.string().uuid().optional() });

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const connections = (await connectionRepository.list()).map((item) => ({ id: item.id, name: item.name, email: item.email, folderId: item.folderId, folderName: item.folderName, createdAt: item.createdAt, status: "connected" as const }));
    return ok(connections, id);
  } catch (error) { return errorResponse(error, id); }
}

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const input = schema.parse(await request.json());
    if (input.connectionId) {
      const existing = await connectionRepository.get(input.connectionId);
      if (!existing || existing.folderId !== input.folder) throw new (await import("@/lib/http")).AppError("INVALID_RECONNECT", "Drive connection could not be reconnected", 400);
    }
    return created({ authorizationUrl: createOAuthUrl(input.name, input.folder, input.connectionId) }, id);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse(new (await import("@/lib/http")).AppError("VALIDATION_ERROR", error.issues[0]?.message || "Invalid request", 400), id);
    return errorResponse(error, id);
  }
}

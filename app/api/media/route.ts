import { z } from "zod";
import { connectionRepository } from "@/repositories/connectionRepository";
import { listConnectionMedia } from "@/services/googleDriveService";
import { errorResponse, requestId, AppError } from "@/lib/http";
import { ok } from "@/lib/response";

export const runtime = "nodejs";
const schema = z.object({
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(24),
  search: z.string().trim().max(200).optional(), type: z.enum(["image", "video"]).optional(), mime: z.string().trim().max(100).optional(),
  from: z.string().datetime().optional(), to: z.string().datetime().optional(),
  sortBy: z.enum(["name", "createdTime", "modifiedTime", "size"]).default("createdTime"), sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const input = schema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const connections = await connectionRepository.list();
    const settled = await Promise.allSettled(connections.map((connection) => listConnectionMedia(connection, input)));
    const items = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    const errors = settled.flatMap((result, index) => result.status === "rejected" ? [{ connectionId: connections[index].id, connectionName: connections[index].name, message: result.reason instanceof Error ? result.reason.message : "Drive request failed" }] : []);
    const direction = input.sortOrder === "asc" ? 1 : -1;
    items.sort((a, b) => input.sortBy === "name" ? a.name.localeCompare(b.name) * direction : ((input.sortBy === "size" ? a.size - b.size : new Date(a[input.sortBy]).getTime() - new Date(b[input.sortBy]).getTime()) * direction));
    const start = (input.page - 1) * input.limit;
    return ok({ items: items.slice(start, start + input.limit), pagination: { page: input.page, limit: input.limit, total: items.length, totalPages: Math.max(1, Math.ceil(items.length / input.limit)) }, connectionErrors: errors }, id);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse(new AppError("VALIDATION_ERROR", error.issues[0]?.message || "Invalid query", 400), id);
    return errorResponse(error, id);
  }
}

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { taskRepository } from "@/repositories/taskRepository";
import { created, ok } from "@/lib/response";
import { AppError, errorResponse, requestId } from "@/lib/http";
import type { TaskItem } from "@/types/task";

export const runtime = "nodejs";
const createSchema = z.object({
  title: z.string().trim().min(1).max(160),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
});

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    return ok(await taskRepository.list(), id);
  } catch (error) {
    return errorResponse(error, id);
  }
}

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const input = createSchema.parse(await request.json());
    const now = new Date().toISOString();
    const task: TaskItem = {
      id: randomUUID(),
      title: input.title,
      status: "todo",
      priority: input.priority,
      createdAt: now,
      updatedAt: now,
    };
    await taskRepository.add(task);
    return created(task, id);
  } catch (error) {
    if (error instanceof z.ZodError)
      return errorResponse(new AppError("VALIDATION_ERROR", error.issues[0]?.message || "Invalid request", 400), id);
    return errorResponse(error, id);
  }
}

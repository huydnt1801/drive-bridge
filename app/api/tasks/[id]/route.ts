import { z } from "zod";
import { taskRepository } from "@/repositories/taskRepository";
import { noContent, ok } from "@/lib/response";
import { AppError, errorResponse, requestId } from "@/lib/http";

export const runtime = "nodejs";
const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(160).optional(),
    status: z.enum(["todo", "doing", "done"]).optional(),
  })
  .refine((value) => value.title !== undefined || value.status !== undefined, "No changes supplied");

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const rid = requestId(request);
  try {
    const input = updateSchema.parse(await request.json());
    const task = await taskRepository.update((await context.params).id, input);
    if (!task) throw new AppError("TASK_NOT_FOUND", "Task not found", 404);
    return ok(task, rid);
  } catch (error) {
    if (error instanceof z.ZodError)
      return errorResponse(new AppError("VALIDATION_ERROR", error.issues[0]?.message || "Invalid request", 400), rid);
    return errorResponse(error, rid);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const rid = requestId(request);
  try {
    const removed = await taskRepository.remove((await context.params).id);
    if (!removed) throw new AppError("TASK_NOT_FOUND", "Task not found", 404);
    return noContent();
  } catch (error) {
    return errorResponse(error, rid);
  }
}

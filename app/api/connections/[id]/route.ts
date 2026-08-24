import { disconnect, getConnection } from "@/services/googleDriveService";
import { errorResponse, requestId } from "@/lib/http";
import { noContent, ok } from "@/lib/response";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const rid = requestId(request);
  try { const item = await getConnection((await context.params).id); return ok({ id: item.id, name: item.name, email: item.email, folderId: item.folderId, folderName: item.folderName, createdAt: item.createdAt, status: "connected" }, rid); }
  catch (error) { return errorResponse(error, rid); }
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const rid = requestId(request);
  try { await disconnect((await context.params).id); return noContent(); }
  catch (error) { return errorResponse(error, rid); }
}

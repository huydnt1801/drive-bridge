import { deleteMedia, streamMedia } from "@/services/googleDriveService";
import { errorResponse, requestId } from "@/lib/http";
import { noContent } from "@/lib/response";

export const runtime = "nodejs";
type Context = { params: Promise<{ connectionId: string; fileId: string }> };

export async function GET(request: Request, context: Context) {
  const rid = requestId(request);
  try {
    const { connectionId, fileId } = await context.params; const { response, file } = await streamMedia(connectionId, fileId, request.headers.get("range"));
    const headers = new Headers();
    for (const key of ["content-length", "content-range", "accept-ranges"]) { const value = response.headers.get(key); if (value) headers.set(key, value); }
    headers.set("content-type", String(file.mimeType || "application/octet-stream")); headers.set("cache-control", "private, max-age=300");
    const download = new URL(request.url).searchParams.get("download") === "1";
    headers.set("content-disposition", `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(String(file.name || "media"))}`);
    return new Response(response.body, { status: response.status, headers });
  } catch (error) { return errorResponse(error, rid); }
}

export async function DELETE(request: Request, context: Context) {
  const rid = requestId(request);
  try { const params = await context.params; await deleteMedia(params.connectionId, params.fileId); return noContent(); }
  catch (error) { return errorResponse(error, rid); }
}

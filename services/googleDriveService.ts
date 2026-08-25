import { decrypt, encrypt, signPayload, verifyPayload } from "@/lib/crypto";
import { requiredEnv } from "@/lib/env";
import { AppError } from "@/lib/http";
import { connectionRepository } from "@/repositories/connectionRepository";
import type { DriveConnection, DriveMedia } from "@/types/drive";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const APP_PROPERTY = "driverBridge";

interface OAuthState { name: string; folderId: string; connectionId?: string; expiresAt: number }
interface UploadState { connectionId: string; sessionUrl: string; expiresAt: number }

function callbackUrl() { return requiredEnv("GOOGLE_OAUTH_REDIRECT_URI"); }

export function extractFolderId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/) || trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  const id = match?.[1] || trimmed;
  if (!/^[a-zA-Z0-9_-]{10,}$/.test(id)) throw new AppError("INVALID_FOLDER", "Google Drive folder URL or ID is invalid", 400);
  return id;
}

export function createOAuthUrl(name: string, folderInput: string, connectionId?: string): string {
  const state = signPayload({ name, folderId: extractFolderId(folderInput), connectionId, expiresAt: Date.now() + 10 * 60_000 });
  const params = new URLSearchParams({
    client_id: requiredEnv("GOOGLE_CLIENT_ID"), redirect_uri: callbackUrl(), response_type: "code",
    scope: "https://www.googleapis.com/auth/drive", access_type: "offline", prompt: "consent select_account", state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(params: URLSearchParams): Promise<Record<string, unknown>> {
  const response = await fetch(TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: params });
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    if (String(data.error || "") === "invalid_grant") throw new AppError("GOOGLE_RECONNECT_REQUIRED", "Phiên Google Drive đã hết hạn hoặc bị thu hồi. Hãy kết nối lại Drive.", 401);
    throw new AppError("OAUTH_ERROR", String(data.error_description || data.error || "Google OAuth failed"), 400);
  }
  return data;
}

async function accessToken(connection: DriveConnection): Promise<string> {
  const data = await tokenRequest(new URLSearchParams({
    client_id: requiredEnv("GOOGLE_CLIENT_ID"), client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
    refresh_token: decrypt(connection.encryptedRefreshToken), grant_type: "refresh_token",
  }));
  return String(data.access_token);
}

async function googleFetch(connection: DriveConnection, url: string, init: RequestInit = {}): Promise<Response> {
  const token = await accessToken(connection);
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers });
  if (response.status === 401) throw new AppError("GOOGLE_AUTH_EXPIRED", `Connection “${connection.name}” must be reconnected`, 401);
  if (response.status === 403) throw new AppError("GOOGLE_FORBIDDEN", `Google Drive denied the operation for “${connection.name}”`, 403);
  if (response.status === 404) throw new AppError("GOOGLE_NOT_FOUND", "Google Drive file or folder was not found", 404);
  if (response.status === 429) throw new AppError("GOOGLE_QUOTA", "Google Drive quota exceeded; try again later", 429);
  return response;
}

async function jsonOrError<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>;
  const detail = await response.json().catch(() => ({})) as { error?: { message?: string } };
  throw new AppError("GOOGLE_API_ERROR", detail.error?.message || `Google Drive returned ${response.status}`, response.status >= 500 ? 502 : response.status);
}

export async function completeOAuth(code: string, stateToken: string): Promise<void> {
  let state: OAuthState;
  try { state = verifyPayload<OAuthState>(stateToken); } catch { throw new AppError("INVALID_OAUTH_STATE", "OAuth state is invalid", 400); }
  if (state.expiresAt < Date.now()) throw new AppError("OAUTH_STATE_EXPIRED", "OAuth request expired", 400);
  const tokens = await tokenRequest(new URLSearchParams({
    client_id: requiredEnv("GOOGLE_CLIENT_ID"), client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
    code, grant_type: "authorization_code", redirect_uri: callbackUrl(),
  }));
  if (!tokens.refresh_token) throw new AppError("MISSING_REFRESH_TOKEN", "Google did not return a refresh token; revoke access and try again", 400);
  const existing = state.connectionId ? await connectionRepository.get(state.connectionId) : undefined;
  if (state.connectionId && (!existing || existing.folderId !== state.folderId)) throw new AppError("INVALID_RECONNECT", "Drive connection could not be reconnected", 400);
  const provisional: DriveConnection = { id: existing?.id || crypto.randomUUID(), name: state.name, email: "", folderId: state.folderId, folderName: "", encryptedRefreshToken: encrypt(String(tokens.refresh_token)), createdAt: existing?.createdAt || new Date().toISOString() };
  const [folder, about] = await Promise.all([
    jsonOrError<{ id: string; name: string; mimeType: string; trashed?: boolean; capabilities?: { canAddChildren?: boolean; canDelete?: boolean } }>(await googleFetch(provisional, `${DRIVE_API}/files/${encodeURIComponent(state.folderId)}?fields=id,name,mimeType,trashed,capabilities(canAddChildren,canDelete)`)),
    jsonOrError<{ user: { emailAddress: string } }>(await googleFetch(provisional, `${DRIVE_API}/about?fields=user(emailAddress)`)),
  ]);
  if (folder.mimeType !== "application/vnd.google-apps.folder" || folder.trashed) throw new AppError("INVALID_FOLDER", "Selected item is not an active folder", 400);
  if (!folder.capabilities?.canAddChildren || !folder.capabilities?.canDelete) throw new AppError("INSUFFICIENT_FOLDER_PERMISSION", "The Google account cannot upload to and delete this folder", 403);
  provisional.folderName = folder.name; provisional.email = about.user.emailAddress;
  if (existing) await connectionRepository.replace(provisional); else await connectionRepository.add(provisional);
}

export async function getConnection(id: string): Promise<DriveConnection> {
  const connection = await connectionRepository.get(id);
  if (!connection) throw new AppError("CONNECTION_NOT_FOUND", "Connection not found", 404);
  return connection;
}

function escapeQuery(value: string) { return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }

export interface MediaQuery { search?: string; type?: "image" | "video"; mime?: string; from?: string; to?: string }

export async function listConnectionMedia(connection: DriveConnection, query: MediaQuery): Promise<DriveMedia[]> {
  const clauses = [`'${escapeQuery(connection.folderId)}' in parents`, "trashed = false", `appProperties has { key='${APP_PROPERTY}' and value='true' }`];
  if (query.search) clauses.push(`name contains '${escapeQuery(query.search)}'`);
  if (query.type) clauses.push(`mimeType contains '${query.type}/'`);
  else clauses.push("(mimeType contains 'image/' or mimeType contains 'video/')");
  if (query.mime) clauses.push(`mimeType = '${escapeQuery(query.mime)}'`);
  if (query.from) clauses.push(`createdTime >= '${new Date(query.from).toISOString()}'`);
  if (query.to) clauses.push(`createdTime <= '${new Date(query.to).toISOString()}'`);
  const files: DriveMedia[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ q: clauses.join(" and "), pageSize: "1000", fields: "nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,thumbnailLink)" });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await jsonOrError<{ files?: Array<Omit<DriveMedia, "connectionId" | "connectionName" | "size"> & { size?: string }>; nextPageToken?: string }>(await googleFetch(connection, `${DRIVE_API}/files?${params}`));
    files.push(...(data.files || []).map((file) => ({ ...file, size: Number(file.size || 0), connectionId: connection.id, connectionName: connection.name })));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

async function assertManagedFile(connection: DriveConnection, fileId: string) {
  const fields = "id,name,mimeType,parents,appProperties,size,createdTime,modifiedTime,thumbnailLink";
  const file = await jsonOrError<Record<string, unknown>>(await googleFetch(connection, `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=${fields}`));
  const props = file.appProperties as Record<string, string> | undefined;
  if (!(file.parents as string[] | undefined)?.includes(connection.folderId) || props?.[APP_PROPERTY] !== "true") throw new AppError("FILE_NOT_MANAGED", "File is not managed by this connection", 403);
  return file;
}

export async function deleteMedia(connectionId: string, fileId: string) {
  const connection = await getConnection(connectionId); await assertManagedFile(connection, fileId);
  const response = await googleFetch(connection, `${DRIVE_API}/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
  if (!response.ok) await jsonOrError(response);
}

export async function streamMedia(connectionId: string, fileId: string, range?: string | null) {
  const connection = await getConnection(connectionId); const file = await assertManagedFile(connection, fileId);
  const headers = new Headers(); if (range) headers.set("range", range);
  const response = await googleFetch(connection, `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, { headers });
  if (!response.ok && response.status !== 206) await jsonOrError(response);
  return { response, file };
}

export async function disconnect(id: string) {
  const connection = await getConnection(id);
  const response = await googleFetch(connection, `${DRIVE_API}/files/${encodeURIComponent(connection.folderId)}`, { method: "DELETE" });
  if (!response.ok) await jsonOrError(response);
  const refreshToken = decrypt(connection.encryptedRefreshToken);
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" } }).catch(() => undefined);
  await connectionRepository.remove(id);
}

export async function initiateUpload(connectionId: string, name: string, mimeType: string, size: number) {
  if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) throw new AppError("INVALID_MEDIA_TYPE", "Only image and video files are allowed", 400);
  const connection = await getConnection(connectionId);
  const response = await googleFetch(connection, "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
    method: "POST", headers: { "content-type": "application/json", "x-upload-content-type": mimeType, "x-upload-content-length": String(size) },
    body: JSON.stringify({ name, mimeType, parents: [connection.folderId], appProperties: { [APP_PROPERTY]: "true" } }),
  });
  if (!response.ok) await jsonOrError(response);
  const sessionUrl = response.headers.get("location");
  if (!sessionUrl) throw new AppError("UPLOAD_SESSION_ERROR", "Google did not return an upload session", 502);
  return signPayload({ connectionId, sessionUrl, expiresAt: Date.now() + 6 * 24 * 60 * 60_000 });
}

export async function forwardUploadChunk(sessionToken: string, contentRange: string, contentType: string, body: ArrayBuffer) {
  let state: UploadState;
  try { state = verifyPayload<UploadState>(sessionToken); } catch { throw new AppError("INVALID_UPLOAD_SESSION", "Upload session is invalid", 400); }
  if (state.expiresAt < Date.now()) throw new AppError("UPLOAD_SESSION_EXPIRED", "Upload session expired", 410);
  await getConnection(state.connectionId);
  const response = await fetch(state.sessionUrl, { method: "PUT", headers: { "content-range": contentRange, "content-type": contentType, "content-length": String(body.byteLength) }, body });
  if (response.status === 308) return { complete: false, range: response.headers.get("range") };
  const file = await jsonOrError<Record<string, unknown>>(response);
  return { complete: true, file };
}

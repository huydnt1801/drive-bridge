import { NextResponse } from "next/server";
import type { ApiResponse, BaseMetadata, PaginationMetadata } from "@/types/api";

function meta(requestId: string): BaseMetadata {
  return { requestId, timestamp: new Date().toISOString() };
}

/** 200 OK with a single resource */
export function ok<T>(
  data: T,
  requestId: string,
  status = 200
): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ data, metadata: meta(requestId), error: null }, { status });
}

/** 201 Created */
export function created<T>(data: T, requestId: string): NextResponse<ApiResponse<T>> {
  return ok(data, requestId, 201);
}

/** 200 OK with paginated list */
export function paginated<T>(
  data: T[],
  pagination: Omit<PaginationMetadata, keyof BaseMetadata>,
  requestId: string
): NextResponse<ApiResponse<T[]>> {
  return NextResponse.json({
    data,
    metadata: { ...meta(requestId), ...pagination },
    error: null,
  });
}

/** 204 No Content */
export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/** Error response */
export function apiError(
  code: string,
  message: string,
  status: number,
  requestId: string
): NextResponse<ApiResponse<null>> {
  return NextResponse.json(
    { data: null, metadata: meta(requestId), error: { code, message } },
    { status }
  );
}

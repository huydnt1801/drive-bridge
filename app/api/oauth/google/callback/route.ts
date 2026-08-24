import { NextResponse } from "next/server";
import { completeOAuth } from "@/services/googleDriveService";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const url = new URL(request.url); const code = url.searchParams.get("code"); const state = url.searchParams.get("state");
  const destination = new URL("/", request.url);
  if (!code || !state) { destination.searchParams.set("error", url.searchParams.get("error") || "OAuth callback is incomplete"); return NextResponse.redirect(destination); }
  try { await completeOAuth(code, state); destination.searchParams.set("connected", "1"); }
  catch (error) { destination.searchParams.set("error", error instanceof Error ? error.message : "OAuth failed"); }
  return NextResponse.redirect(destination);
}

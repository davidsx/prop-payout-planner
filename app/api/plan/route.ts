import { NextRequest, NextResponse } from "next/server";
import { kvConfigured, planKey, redis, sanitizeSpace } from "@/lib/kv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/plan?space=xyz  -> { configured, state }
export async function GET(req: NextRequest) {
  if (!kvConfigured || !redis) {
    return NextResponse.json({ configured: false, state: null });
  }
  const space = sanitizeSpace(req.nextUrl.searchParams.get("space"));
  try {
    const state = await redis.get(planKey(space));
    return NextResponse.json({ configured: true, state: state ?? null });
  } catch (err) {
    console.error("KV GET failed", err);
    return NextResponse.json({ configured: true, state: null, error: true }, { status: 502 });
  }
}

// PUT /api/plan?space=xyz  (body = PlannerState) -> { configured, ok }
export async function PUT(req: NextRequest) {
  if (!kvConfigured || !redis) {
    return NextResponse.json({ configured: false, ok: false });
  }
  const space = sanitizeSpace(req.nextUrl.searchParams.get("space"));
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ configured: true, ok: false, error: "bad json" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !Array.isArray((body as { accounts?: unknown }).accounts)) {
    return NextResponse.json({ configured: true, ok: false, error: "invalid plan" }, { status: 400 });
  }
  try {
    await redis.set(planKey(space), body);
    return NextResponse.json({ configured: true, ok: true });
  } catch (err) {
    console.error("KV PUT failed", err);
    return NextResponse.json({ configured: true, ok: false, error: true }, { status: 502 });
  }
}

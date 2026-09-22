import { NextRequest, NextResponse } from "next/server";
import { kvConfigured, planKey, randomSpace, redis } from "@/lib/kv";
import type { PlannerState, VersionMeta } from "@/lib/calc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/plans  -> { configured, versions: VersionMeta[] }  (newest updated first)
export async function GET() {
  if (!kvConfigured || !redis) {
    return NextResponse.json({ configured: false, versions: [] });
  }
  try {
    const keys = await redis.keys("plan:*");
    if (keys.length === 0) {
      return NextResponse.json({ configured: true, versions: [] });
    }
    const values = await redis.mget<PlannerState[]>(...keys);
    const versions: VersionMeta[] = keys.map((key, i) => {
      const s = values[i] || ({} as PlannerState);
      return {
        space: key.replace(/^plan:/, ""),
        name: (s.name || "").trim() || "Untitled",
        createdAt: s.createdAt || 0,
        updatedAt: s.updatedAt || 0,
        accountCount: Array.isArray(s.accounts) ? s.accounts.length : 0,
      };
    });
    versions.sort((a, b) => b.updatedAt - a.updatedAt);
    return NextResponse.json({ configured: true, versions });
  } catch (err) {
    console.error("KV list failed", err);
    return NextResponse.json({ configured: true, versions: [], error: true }, { status: 502 });
  }
}

// POST /api/plans  (body = { state: PlannerState, name?: string })
//   Creates a new version under a fresh key. -> { configured, ok, space, state }
export async function POST(req: NextRequest) {
  if (!kvConfigured || !redis) {
    return NextResponse.json({ configured: false, ok: false });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ configured: true, ok: false, error: "bad json" }, { status: 400 });
  }
  const src = (body as { state?: unknown })?.state;
  if (!src || typeof src !== "object" || !Array.isArray((src as { accounts?: unknown }).accounts)) {
    return NextResponse.json({ configured: true, ok: false, error: "invalid plan" }, { status: 400 });
  }
  const name = ((body as { name?: string })?.name || "").trim() || "Untitled";

  // Find a free key (keys are opaque; collisions are astronomically unlikely,
  // but check a few times to be safe).
  let space = randomSpace();
  try {
    for (let i = 0; i < 5 && (await redis.exists(planKey(space))); i++) {
      space = randomSpace();
    }
  } catch {
    /* ignore existence-check failures; proceed with generated key */
  }

  const now = Date.now();
  const state: PlannerState = {
    ...(src as PlannerState),
    name,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await redis.set(planKey(space), state);
    return NextResponse.json({ configured: true, ok: true, space, state });
  } catch (err) {
    console.error("KV create failed", err);
    return NextResponse.json({ configured: true, ok: false, error: true }, { status: 502 });
  }
}

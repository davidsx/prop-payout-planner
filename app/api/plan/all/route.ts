import { NextResponse } from "next/server";
import { kvConfigured, redis } from "@/lib/kv";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/plan/all  -> { configured, count, spaces: { [space]: state } }
// Returns every stored plan space as raw JSON.
export async function GET() {
  if (!kvConfigured || !redis) {
    return NextResponse.json({ configured: false, count: 0, spaces: {} });
  }
  try {
    const keys = await redis.keys("plan:*");
    if (keys.length === 0) {
      return NextResponse.json({ configured: true, count: 0, spaces: {} });
    }
    const values = await redis.mget<unknown[]>(...keys);
    const spaces: Record<string, unknown> = {};
    keys.forEach((key, i) => {
      const space = key.replace(/^plan:/, "");
      spaces[space] = values[i] ?? null;
    });
    return NextResponse.json({ configured: true, count: keys.length, spaces });
  } catch (err) {
    console.error("KV GET all failed", err);
    return NextResponse.json({ configured: true, count: 0, spaces: {}, error: true }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { runShadowSuite } from "@/lib/shadow-eval";

export const dynamic = "force-dynamic";

const requestSchema = z.object({ repeats: z.number().int().min(1).max(3).default(1) }).strict();

export async function POST(request: Request) {
  const hostname = new URL(request.url).hostname;
  if (process.env.ENABLE_SHADOW_EVAL !== "1" || !["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const input = requestSchema.parse(await request.json());
    return NextResponse.json(await runShadowSuite(input.repeats), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shadow evaluation failed.";
    return NextResponse.json({ error: "shadow_failed", message }, { status: 500 });
  }
}

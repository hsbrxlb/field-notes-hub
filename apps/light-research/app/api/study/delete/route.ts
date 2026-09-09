import { NextResponse } from "next/server";
import { z } from "zod";
import { tokenRequestSchema } from "@/lib/api-schemas";
import { deleteSession } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { entryToken } = tokenRequestSchema.parse(await request.json());
    const result = await deleteSession(entryToken);
    return NextResponse.json(result ?? { error: "not_found" }, { status: result ? 200 : 404, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
    return NextResponse.json({ error: invalid ? "invalid_request" : "unavailable" }, { status: invalid ? 400 : 503, headers: { "Cache-Control": "no-store" } });
  }
}

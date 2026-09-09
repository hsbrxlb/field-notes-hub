import { NextResponse } from "next/server";
import { tokenRequestSchema } from "@/lib/api-schemas";
import { exportSession, StorageAccessError } from "@/lib/storage";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { entryToken } = tokenRequestSchema.parse(await request.json());
    const record = await exportSession(entryToken);
    if (!record) return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return new NextResponse(JSON.stringify(record, null, 2) + "\n", {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${record.participationCode}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof StorageAccessError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
    return NextResponse.json({ error: invalid ? "invalid_request" : "unavailable" }, { status: invalid ? 400 : 503, headers: { "Cache-Control": "no-store" } });
  }
}

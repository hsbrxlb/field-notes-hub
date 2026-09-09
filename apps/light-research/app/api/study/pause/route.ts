import { NextResponse } from "next/server";
import { tokenRequestSchema } from "@/lib/api-schemas";
import { ConversationError, stopConversation } from "@/lib/conversation-service";
import { StorageAccessError } from "@/lib/storage";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { entryToken } = tokenRequestSchema.parse(await request.json());
    return NextResponse.json(await stopConversation(entryToken), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ConversationError || error instanceof StorageAccessError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
    return NextResponse.json({ error: invalid ? "invalid_request" : "unavailable" }, { status: invalid ? 400 : 503, headers: { "Cache-Control": "no-store" } });
  }
}

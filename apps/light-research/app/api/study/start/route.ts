import { NextResponse } from "next/server";
import { startRequestSchema } from "@/lib/api-schemas";
import { ConversationError, startConversation } from "@/lib/conversation-service";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = startRequestSchema.parse(await request.json());
    return NextResponse.json(await startConversation(input.consentVersion, input.consentLocale), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ConversationError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    const invalid = error instanceof z.ZodError || error instanceof SyntaxError;
    return NextResponse.json({ error: invalid ? "invalid_request" : "unavailable", message: "The study could not be started." }, { status: invalid ? 400 : 503, headers: { "Cache-Control": "no-store" } });
  }
}

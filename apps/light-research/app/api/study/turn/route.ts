import { NextResponse } from "next/server";
import { turnRequestSchema } from "@/lib/api-schemas";
import { ConversationError, respondToConversation } from "@/lib/conversation-service";
import { StorageAccessError } from "@/lib/storage";
import { ZodError } from "zod";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const input = turnRequestSchema.parse(await request.json());
    return NextResponse.json(await respondToConversation(input), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof StorageAccessError) return NextResponse.json({ error: error.code, message: error.message, answerSaved: false }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    if (error instanceof ConversationError) {
      return NextResponse.json({ error: error.code, message: error.message, answerSaved: error.answerSaved, diagnostic: error.diagnostic }, { status: error.status });
    }
    const invalid = error instanceof ZodError || error instanceof SyntaxError;
    return NextResponse.json({ error: invalid ? "invalid_request" : "processing_unavailable", message: "The answer could not be processed." }, { status: invalid ? 400 : 503 });
  }
}

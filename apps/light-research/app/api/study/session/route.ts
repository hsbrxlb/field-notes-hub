import { NextResponse } from "next/server";
import { ConversationError, getConversation } from "@/lib/conversation-service";
import { tokenRequestSchema } from "@/lib/api-schemas";
import { StorageAccessError } from "@/lib/storage";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ error: "token_transport_removed", message: "Restore a session using POST with a JSON body." }, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    const { entryToken: token } = tokenRequestSchema.parse(await request.json());
    return NextResponse.json(await getConversation(token), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ConversationError || error instanceof StorageAccessError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "invalid_request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: "unavailable", message: "The study session is unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

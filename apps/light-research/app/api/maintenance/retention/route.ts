import { purgeExpiredSessions } from "@/lib/storage";

export const dynamic = "force-dynamic";

// This endpoint exposes no records and can only erase sessions whose own
// recorded retention period has elapsed. A daily scheduler calls it.
export async function GET() {
  try {
    await purgeExpiredSessions();
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

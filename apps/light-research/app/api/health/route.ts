export const dynamic = "force-dynamic";

// Liveness only: hosting health probes must not create interviews or call AI.
export async function GET() {
  return Response.json({ status: "ok" });
}

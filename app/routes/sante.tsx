// unauthenticated, so it must leak nothing: no version, no shop names, no
// counts that hint at customer volume

import prisma from "../db.server"

export async function loader() {
  const startedAt = Date.now()

  try {
    // a real query, not just "the process is up" — the usual outage is the db
    // being unreachable while node happily keeps serving
    await prisma.$queryRaw`SELECT 1`
  } catch {
    return Response.json({ status: "degraded" }, { status: 503 })
  }

  return Response.json(
    { status: "ok", latencyMs: Date.now() - startedAt },
    { headers: { "cache-control": "no-store" } },
  )
}

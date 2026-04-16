/** Lightweight probe for deploys and monitoring (no secrets). */
export async function GET() {
  return Response.json({ ok: true, service: 'silicon-pulse' })
}

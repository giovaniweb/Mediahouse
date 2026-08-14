import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"
import { syncAllEmailInboxes } from "@/lib/email-inbox"

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET não configurado" }, { status: 500 })
  }
  const authorization = req.headers.get("authorization") ?? ""
  const bufA = Buffer.from(authorization)
  const bufB = Buffer.from(`Bearer ${secret}`)
  if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const results = await syncAllEmailInboxes()
  return NextResponse.json({ ok: true, caixas: results.length, results })
}

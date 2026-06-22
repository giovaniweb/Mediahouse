import { NextRequest, NextResponse } from "next/server"
import { syncAllEmailInboxes } from "@/lib/email-inbox"

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const authorization = req.headers.get("authorization")
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  }

  const results = await syncAllEmailInboxes()
  return NextResponse.json({ ok: true, caixas: results.length, results })
}

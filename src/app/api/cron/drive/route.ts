import { acompanharConsumidor } from "@/lib/automacoes-saude"
import { timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { driveCopiaAtiva, executarCopiaDrive } from "@/lib/drive-copias"
export const maxDuration = 300
export async function GET(req: NextRequest) {
  const esperado = process.env.CRON_SECRET, recebido = req.headers.get("authorization")
  if (!esperado || !recebido || Buffer.byteLength(recebido) !== Buffer.byteLength(`Bearer ${esperado}`) || !timingSafeEqual(Buffer.from(recebido),Buffer.from(`Bearer ${esperado}`))) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
  const org = process.env.DRIVE_SYNC_ORGANIZACAO_ID
  if (!org || !driveCopiaAtiva(org)) return NextResponse.json({ estado: "desativado" })
  return NextResponse.json(await acompanharConsumidor(org,"drive-copias",async () => {
    const dados = await executarCopiaDrive(prisma,org)
    return { dados, contadores: { concluidos: dados.estado === "concluido" ? 1 : 0, falhos: dados.estado === "erro" ? 1 : 0, pendentes: 0 } }
  }))
}

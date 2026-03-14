import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST /api/whatsapp/validar-numero
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { telefone } = await req.json()
  if (!telefone) return NextResponse.json({ error: "telefone é obrigatório" }, { status: 400 })

  // Formatar número (remover não-numéricos, adicionar 55 se necessário)
  const numeros = telefone.replace(/\D/g, "")
  const comDDI = numeros.startsWith("55") ? numeros : `55${numeros}`

  const config = await prisma.configWhatsapp.findFirst({ orderBy: { createdAt: "desc" } })
  if (!config || !config.ativo || !config.instanceUrl) {
    // Sem config: retorna validação básica de formato
    const valido = /^55\d{10,11}$/.test(comDDI)
    return NextResponse.json({ valido, jid: null, modo: "formato_apenas" })
  }

  try {
    const res = await fetch(
      `${config.instanceUrl}/chat/whatsappNumbers/${config.instanceId}`,
      {
        method: "POST",
        headers: { apikey: config.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ numbers: [`${comDDI}@s.whatsapp.net`] }),
      }
    )

    if (!res.ok) {
      // Fallback: validação de formato
      const valido = /^55\d{10,11}$/.test(comDDI)
      return NextResponse.json({ valido, jid: null, modo: "formato_apenas" })
    }

    const data = await res.json()
    // Evolution retorna array: [{ jid: "...", exists: true/false }]
    const resultado = Array.isArray(data) ? data[0] : data
    const valido = resultado?.exists === true

    return NextResponse.json({
      valido,
      jid: resultado?.jid ?? null,
      numero: comDDI,
      modo: "evolution_api",
    })
  } catch {
    const valido = /^55\d{10,11}$/.test(comDDI)
    return NextResponse.json({ valido, jid: null, modo: "formato_apenas" })
  }
}

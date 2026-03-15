import { auth } from "@/lib/auth"
import { sendWhatsappMessage } from "@/lib/whatsapp"
import { NextResponse } from "next/server"
import { z } from "zod"

const schema = z.object({
  telefone: z.string().min(8),
  mensagem: z.string().min(1).max(4096),
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 })
  }

  const { telefone, mensagem } = parsed.data

  const result = await sendWhatsappMessage(telefone, mensagem)
  if (!result) {
    return NextResponse.json({ error: "Falha ao enviar. Verifique se o WhatsApp está conectado." }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { requireDemandaOrg } from "@/lib/org"
import { emSegundoPlano } from "@/lib/notificar"
import { sendWhatsappMessage } from "@/lib/whatsapp"

type Params = { params: Promise<{ id: string }> }

// Menção no formato @[Nome](userId) — a interface monta assim ao escolher a
// pessoa na lista. Guardar o id evita a ambiguidade de casar por nome (dois
// "Gabriel", nome escrito diferente, apelido) e permite validar quem foi marcado.
const REGEX_MENCAO = /@\[([^\]]+)\]\(([a-z0-9]+)\)/gi

export function extrairMencionados(texto: string): string[] {
  const ids = new Set<string>()
  for (const m of texto.matchAll(REGEX_MENCAO)) ids.add(m[2])
  return [...ids]
}

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const { id } = await params
  const guard = await requireDemandaOrg(session, id)
  if (guard instanceof NextResponse) return guard
  const { organizacaoId } = guard
  const { comentario } = await req.json()

  if (!comentario?.trim()) {
    return NextResponse.json({ error: "Comentário vazio" }, { status: 400 })
  }

  const texto = comentario.trim()

  const novo = await prisma.comentario.create({
    data: { demandaId: id, usuarioId: session.user.id, comentario: texto },
    include: { usuario: { select: { id: true, nome: true } } },
  })

  // Comentar sem que nada volte para ninguém é o motivo de o recurso existir e
  // ter zero uso: quem escreve fala sozinho. Quem é marcado passa a receber
  // aviso no sino e, se tiver telefone, no WhatsApp.
  emSegundoPlano(async () => {
    const mencionados = extrairMencionados(texto).filter((uid) => uid !== session.user.id)
    if (mencionados.length === 0) return

    // Só notifica quem é da mesma empresa — um id colado de fora não vira aviso.
    const validos = await prisma.usuarioOrganizacao.findMany({
      where: { organizacaoId, usuarioId: { in: mencionados } },
      select: { usuario: { select: { id: true, nome: true, telefone: true } } },
    })
    if (validos.length === 0) return

    const demanda = await prisma.demanda.findUnique({
      where: { id },
      select: { codigo: true, titulo: true },
    })
    const autor = novo.usuario?.nome ?? "Alguém"
    const ref = demanda ? `${demanda.titulo} (${demanda.codigo})` : "uma demanda"
    // O texto exibido tira a marcação: quem lê quer "@Julie", não "@[Julie](id)".
    const legivel = texto.replace(REGEX_MENCAO, "@$1")
    const resumo = legivel.length > 160 ? `${legivel.slice(0, 160)}…` : legivel

    for (const v of validos) {
      await prisma.alertaIA.create({
        data: {
          organizacaoId,
          demandaId: id,
          usuarioId: v.usuario.id,
          tipoAlerta: "mencao_comentario",
          mensagem: `${autor} marcou você em ${ref}: "${resumo}"`,
          severidade: "info",
        },
      }).catch((e) => console.error("[Comentário] Falha ao criar aviso:", e))

      if (v.usuario.telefone) {
        await sendWhatsappMessage(
          v.usuario.telefone,
          `💬 ${autor} marcou você em ${ref}:\n\n"${resumo}"`,
          id,
          organizacaoId
        ).catch(() => null)
      }
    }
  }, "mencoes-comentario")

  return NextResponse.json(novo, { status: 201 })
}

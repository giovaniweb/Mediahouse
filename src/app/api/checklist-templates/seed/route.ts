import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { ehGestor } from "@/lib/papel"
import { prisma } from "@/lib/prisma"
import { getOrgId, semOrg } from "@/lib/org"

// POST — semeia os templates padrão NA EMPRESA de quem chama. Idempotente.
//
// Duas coisas mudaram. A credencial era um token fixo no código-fonte
// ("nfseed2026"), público para qualquer um que lesse o repositório ou o bundle;
// agora é a sessão de um gestor, como em todo o resto do painel. E os templates
// nasciam sem empresa, num balaio único: rodar o seed servia a instalação
// inteira, e a segunda empresa a chamar não criava nada, porque os nomes já
// existiam para outra.
export async function POST() {
  const session = await auth()
  if (!session || !ehGestor(session)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
  }
  const organizacaoId = await getOrgId(session)
  if (!organizacaoId) return semOrg()

  const templates = [
    {
      nome: "Geral",
      tipoVideo: null,
      papel: "geral",
      itens: ["Captar", "Baixar", "Decupar", "Editar", "Subir para pasta temporária Drive", "Enviar para o cliente", "Postar"],
    },
    {
      nome: "Entrega Equipamento — Videomaker Externo",
      tipoVideo: "entrega_equipamento",
      papel: "videomaker_externo",
      itens: ["Captar", "Coletar feedback", "Subir brutos para o Drive", "Anexar nota fiscal"],
    },
    {
      nome: "Entrega Equipamento — Editor",
      tipoVideo: "entrega_equipamento",
      papel: "editor",
      itens: ["Baixar", "Decupar", "Editar", "Subir para aprovação (Drive finalizado)"],
    },
    {
      nome: "Social Media",
      tipoVideo: null,
      papel: "social",
      itens: ["Baixar vídeo aprovado", "Postar (collab com cliente)"],
    },
    {
      nome: "Reels / Stories",
      tipoVideo: "reels",
      papel: "geral",
      itens: ["Captar", "Baixar", "Editar", "Subir para aprovação", "Postar"],
    },
    {
      nome: "VSL (Video Sales Letter)",
      tipoVideo: "vsl",
      papel: "geral",
      itens: ["Roteiro", "Captar", "Baixar", "Decupar", "Editar", "Revisão interna", "Subir para aprovação cliente", "Postar"],
    },
  ]

  const criados: string[] = []

  for (const t of templates) {
    const existente = await prisma.checklistTemplate.findFirst({ where: { organizacaoId, nome: t.nome } })
    if (existente) continue

    await prisma.checklistTemplate.create({
      data: {
        organizacaoId,
        nome: t.nome,
        tipoVideo: t.tipoVideo,
        papel: t.papel,
        itens: {
          create: t.itens.map((texto, idx) => ({ texto, ordem: idx })),
        },
      },
    })
    criados.push(t.nome)
  }

  return NextResponse.json({ ok: true, criados, total: criados.length })
}

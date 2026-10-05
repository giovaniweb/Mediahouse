// Dashboard por departamento: Growth e Social Media. O Audiovisual continua na
// própria rota (/api/dashboard/metrics), que já era dele.
//
// Cada departamento responde às mesmas três perguntas, com as palavras do seu
// quadro: onde está o trabalho agora, o que passou do prazo e quem está com o
// quê (ou, na social, o que está parado).
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { estaAtrasada } from "@/lib/status"
import { hojeEmSaoPaulo } from "@/lib/datas"
import { GROWTH_COLUNAS, growthColunaDe } from "@/lib/growth-kanban"
import { resumoSocial, type Contagem, type PessoaComCarga } from "@/lib/painel-departamento"

// ── Growth ──────────────────────────────────────────────────────────────────

export async function painelGrowth(organizacaoId: string) {
  return comOrg(organizacaoId, async () => {
    const abertas = (await prisma.demanda.findMany({
      where: { organizacaoId, area: "design", statusVisivel: { not: "finalizado" } },
      select: {
        statusInterno: true, statusVisivel: true, prioridade: true, dataLimite: true,
        responsavel: { select: { id: true, nome: true } },
        responsaveis: { select: { usuario: { select: { id: true, nome: true } } } },
      },
    })).filter((d) => growthColunaDe(d.statusInterno) !== "finalizado")

    const colunas: Contagem[] = GROWTH_COLUNAS.filter((c) => c.id !== "finalizado").map((c) => ({
      id: c.id, label: c.label,
      demandas: abertas.filter((d) => growthColunaDe(d.statusInterno) === c.id).length,
    }))

    // Quem está com o quê. No Growth o card é de alguém da casa (responsável);
    // o mesmo nome nos dois campos conta uma vez.
    const carga = new Map<string, PessoaComCarga>()
    for (const d of abertas) {
      const pessoas = new Map([d.responsavel, ...d.responsaveis.map((r) => r.usuario)].filter((u) => !!u).map((u) => [u!.id, u!.nome]))
      for (const [id, nome] of pessoas) {
        const p = carga.get(id) ?? { id, nome, abertas: 0 }
        p.abertas++
        carga.set(id, p)
      }
    }
    const semResponsavel = abertas.filter((d) => !d.responsavel && d.responsaveis.length === 0).length

    return {
      colunas,
      ativas: abertas.length,
      urgentes: abertas.filter((d) => d.prioridade === "urgente").length,
      atrasadas: abertas.filter(estaAtrasada).length,
      paraAprovar: colunas.find((c) => c.id === "para_aprovacao")?.demandas ?? 0,
      pessoas: [...carga.values()].sort((a, b) => b.abertas - a.abertas || a.nome.localeCompare(b.nome, "pt-BR")),
      semResponsavel,
    }
  })
}

export async function painelSocial(organizacaoId: string, hoje: string = hojeEmSaoPaulo()) {
  return comOrg(organizacaoId, async () => {
    const lidos = await prisma.demanda.findMany({
      where: { organizacaoId, socialId: { not: null }, statusVisivel: { not: "finalizado" } },
      select: {
        id: true, codigo: true, titulo: true, statusVisivel: true, statusInterno: true, dataLimite: true,
        linhaProjetoRef: { select: { nome: true } },
        historicos: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
      take: 1000,
    })
    return resumoSocial(lidos.map(({ linhaProjetoRef, historicos, ...d }) => ({
      ...d, linha: linhaProjetoRef?.nome ?? null, ultimaMudanca: historicos[0]?.createdAt ?? null,
    })), hoje)
  })
}

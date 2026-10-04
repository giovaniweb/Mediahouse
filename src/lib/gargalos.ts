import type { StatusVisivel } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { comOrg } from "@/lib/org-contexto"
import { STATUS_PARA_COLUNA, COLUNAS_LABEL, COLUNAS_ORDER } from "@/lib/status"

// Gargalo por etapa: quantos jobs estão em cada coluna do quadro agora e há
// quanto tempo, em média, entraram nela. É o bloco "Gargalos por etapa" do
// protótipo v8, que lá só tinha números de demonstração.
//
// A data de entrada vem do historico_status. A tabela também guarda eventos que
// não são troca de status (edição de campos, troca de responsável, espelho,
// captação iniciada), então só vale a linha cujo statusNovo é um status do
// quadro. No backup de 07/09/2026, 109 de 111 jobs ativos tinham a última troca
// registrada batendo com o status atual; os 2 restantes nasceram na Entrada e
// nunca mudaram. Quando o histórico não fecha com o status atual, o job conta na
// etapa mas fica fora da média: chutar uma data seria pior que dizer que falta.

export type EtapaAtiva = Exclude<StatusVisivel, "finalizado">

export const ETAPAS_ATIVAS: EtapaAtiva[] = COLUNAS_ORDER.filter(
  (c): c is EtapaAtiva => c !== "finalizado"
)

const COLUNA_DO_STATUS = new Map<string, StatusVisivel>(Object.entries(STATUS_PARA_COLUNA))
const STATUS_DO_QUADRO = [...COLUNA_DO_STATUS.keys()]
const DIA_MS = 86_400_000

export interface DemandaNaEtapa {
  id: string
  codigo: string
  statusVisivel: StatusVisivel
  createdAt: Date
}

export interface TrocaDeStatus {
  demandaId: string
  statusAnterior: string | null
  statusNovo: string
  createdAt: Date
}

export interface GargaloEtapa {
  etapa: EtapaAtiva
  label: string
  demandas: number
  /** Média dos jobs com entrada conhecida; null quando nenhum tem. */
  diasMedios: number | null
  /** Jobs na etapa cuja entrada o histórico não permite datar. */
  semHistorico: number
  maisAntiga: { codigo: string; dias: number } | null
}

function colunaDe(status: string | null): StatusVisivel | null {
  return status ? COLUNA_DO_STATUS.get(status) ?? null : null
}

/**
 * Quando o job entrou na etapa em que está. `trocas` são as do próprio job, em
 * ordem cronológica; eventos que não são status são ignorados aqui.
 */
export function entradaNaEtapa(d: DemandaNaEtapa, trocas: TrocaDeStatus[]): Date | null {
  const doQuadro = trocas.filter((t) => colunaDe(t.statusNovo) !== null)

  // Volta do fim enquanto as trocas ainda caem na etapa atual: a primeira delas
  // é a entrada. Um job que saiu e voltou (Aprovação → Edição → Aprovação) conta
  // da última volta, que é a espera que importa agora.
  let i = doQuadro.length - 1
  while (i >= 0 && colunaDe(doQuadro[i].statusNovo) === d.statusVisivel) i--

  if (i === doQuadro.length - 1) {
    // A última troca registrada leva a outra etapa, então o status atual mudou
    // sem passar pelo histórico. Sem troca nenhuma, só a Entrada tem data
    // certa: é onde o job nasce.
    return doQuadro.length === 0 && d.statusVisivel === "entrada" ? d.createdAt : null
  }
  if (i >= 0) return doQuadro[i + 1].createdAt

  // Todo o histórico está nesta etapa: o job nasceu nela, a não ser que a
  // primeira troca diga que veio de outra.
  const veioDe = colunaDe(doQuadro[0].statusAnterior)
  return veioDe && veioDe !== d.statusVisivel ? doQuadro[0].createdAt : d.createdAt
}

export function calcularGargalos(
  demandas: DemandaNaEtapa[],
  trocas: TrocaDeStatus[],
  agora: Date
): GargaloEtapa[] {
  const porDemanda = new Map<string, TrocaDeStatus[]>()
  const emOrdem = [...trocas].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  for (const t of emOrdem) {
    const lista = porDemanda.get(t.demandaId)
    if (lista) lista.push(t)
    else porDemanda.set(t.demandaId, [t])
  }

  return ETAPAS_ATIVAS.map((etapa) => {
    const naEtapa = demandas.filter((d) => d.statusVisivel === etapa)
    const datadas: { codigo: string; dias: number }[] = []
    for (const d of naEtapa) {
      const entrada = entradaNaEtapa(d, porDemanda.get(d.id) ?? [])
      if (entrada) datadas.push({ codigo: d.codigo, dias: Math.max(0, (agora.getTime() - entrada.getTime()) / DIA_MS) })
    }
    const soma = datadas.reduce((n, x) => n + x.dias, 0)
    const antiga = datadas.reduce<{ codigo: string; dias: number } | null>(
      (a, x) => (!a || x.dias > a.dias ? x : a),
      null
    )
    return {
      etapa,
      label: COLUNAS_LABEL[etapa],
      demandas: naEtapa.length,
      diasMedios: datadas.length ? Math.round((soma / datadas.length) * 10) / 10 : null,
      semHistorico: naEtapa.length - datadas.length,
      maisAntiga: antiga ? { codigo: antiga.codigo, dias: Math.floor(antiga.dias) } : null,
    }
  })
}

export async function gargalosPorEtapa(organizacaoId: string, agora = new Date()): Promise<GargaloEtapa[]> {
  return comOrg(organizacaoId, async () => {
    // Mesmo recorte dos outros números do Dashboard: audiovisual, desta empresa.
    const demandas = await prisma.demanda.findMany({
      where: { organizacaoId, area: "audiovisual", statusVisivel: { in: ETAPAS_ATIVAS } },
      select: { id: true, codigo: true, statusVisivel: true, createdAt: true },
    })
    if (demandas.length === 0) return calcularGargalos([], [], agora)

    const trocas = await prisma.historicoStatus.findMany({
      where: {
        demandaId: { in: demandas.map((d) => d.id) },
        demanda: { organizacaoId },
        statusNovo: { in: STATUS_DO_QUADRO },
      },
      select: { demandaId: true, statusAnterior: true, statusNovo: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    })
    return calcularGargalos(demandas, trocas, agora)
  })
}

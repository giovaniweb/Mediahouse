// Departamentos do dashboard e do histórico (Audiovisual, Growth, Social Media)
// e as regras sem banco do painel da social — servem à rota e à tela.
import { estaAtrasada } from "@/lib/status"
import { dataCalendario, dataEmSaoPaulo, diasEntre, hojeEmSaoPaulo } from "@/lib/datas"

export const DEPARTAMENTOS = ["audiovisual", "growth", "social"] as const
export type Departamento = (typeof DEPARTAMENTOS)[number]

export const NOME_DEPARTAMENTO: Record<Departamento, string> = {
  audiovisual: "Audiovisual",
  growth: "Growth",
  social: "Social Media",
}

export function lerDepartamento(valor: string | null | undefined): Departamento | null {
  if (!valor) return "audiovisual"
  return (DEPARTAMENTOS as readonly string[]).includes(valor) ? (valor as Departamento) : null
}

/**
 * Departamentos que esta pessoa vê no dashboard e no histórico. Mesmas regras
 * do menu lateral: Growth pela área ou pela permissão (e com o módulo ligado),
 * Social Media pelo cargo ou pela permissão; gestor e admin veem todos.
 */
export function departamentosVisiveis(me: {
  tipo?: string
  membership?: { papel?: string; areas?: string[] } | null
  permissoes?: Record<string, boolean | string> | null
  modulos?: Partial<Record<string, boolean>> | null
} | null | undefined): Departamento[] {
  if (!me) return ["audiovisual"]
  const gestor = me.tipo === "admin" || me.tipo === "gestor"
  const areas = me.membership?.areas ?? []
  const lista: Departamento[] = []
  if (gestor || areas.length === 0 || areas.includes("audiovisual")) lista.push("audiovisual")
  if (me.modulos?.growth !== false && (gestor || areas.includes("growth") || me.permissoes?.verDesign === true)) lista.push("growth")
  if (gestor || me.membership?.papel === "social" || me.permissoes?.verSocial === true) lista.push("social")
  return lista.length ? lista : ["audiovisual"]
}

export type Contagem = { id: string; label: string; demandas: number }

export type PessoaComCarga = { id: string; nome: string; abertas: number }

// ── Social Media ────────────────────────────────────────────────────────────
//
// Os pedidos da social são demandas com `socialId` (vídeo ou arte), e ela os vê
// em quatro palavras. As regras são as do quadro dela (lib/social-quadro, na
// área Social Media): a etapa sai do statusVisivel, o recusado na entrada fica
// de fora, e "parado" é a última mudança registrada no histórico há 3 dias ou mais.

export type EtapaSocial = "recebido" | "produzindo" | "revisar" | "pronto"

export const ETAPAS_SOCIAL: { id: EtapaSocial; label: string }[] = [
  { id: "recebido", label: "Recebido" },
  { id: "produzindo", label: "Produzindo" },
  { id: "revisar", label: "Revisar" },
  { id: "pronto", label: "Pronto" },
]

export const DIAS_PARADO = 3

export function etapaSocial(statusVisivel: string, statusInterno?: string | null): EtapaSocial | null {
  if (statusInterno === "encerrado" && statusVisivel === "entrada") return null // recusado
  switch (statusVisivel) {
    case "entrada": return "recebido"
    case "producao":
    case "edicao": return "produzindo"
    case "aprovacao": return "revisar"
    case "para_postar": return "pronto"
    default: return null // finalizado: já saiu do trabalho em andamento
  }
}

export type PedidoSocial = {
  id: string
  codigo: string
  titulo: string
  statusVisivel: string
  statusInterno: string | null
  dataLimite: Date | string | null
  linha: string | null
  ultimaMudanca: Date | string | null
}

/** `dias` null: prazo com data corrompida (ano 0026…), o pedido só diz "Atrasado". */
export type PedidoEmAlerta = { id: string; codigo: string; titulo: string; linha: string | null; etapa: string; dias: number | null }

/** Contas do painel da social, sem banco (testável). */
export function resumoSocial(pedidos: PedidoSocial[], hoje: string = hojeEmSaoPaulo()) {
  const comEtapa = pedidos.flatMap((p) => {
    const etapa = etapaSocial(p.statusVisivel, p.statusInterno)
    return etapa ? [{ ...p, etapa }] : []
  })
  const nome = (e: EtapaSocial) => ETAPAS_SOCIAL.find((x) => x.id === e)!.label
  const alerta = (p: (typeof comEtapa)[number], dias: number | null): PedidoEmAlerta =>
    ({ id: p.id, codigo: p.codigo, titulo: p.titulo, linha: p.linha, etapa: nome(p.etapa), dias })

  // Prazo é dia de calendário gravado como meia-noite UTC: dataCalendario, e não
  // o fuso de Brasília, senão o atraso ganha um dia (mesma conta de diasDeAtraso).
  const atrasados = comEtapa
    .filter((p) => estaAtrasada(p))
    .map((p) => {
      const prazo = dataCalendario(p.dataLimite!)
      const dias = prazo ? diasEntre(prazo, hoje) : 0
      return alerta(p, dias > 0 && dias < 3650 ? dias : null)
    })
    .sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0))

  // Parado só conta com a equipe: o "Pronto" está esperando ser postado, e
  // isso é com ela, não com quem produz.
  const parados = comEtapa
    .filter((p) => p.etapa !== "pronto" && p.ultimaMudanca)
    .map((p) => alerta(p, diasEntre(dataEmSaoPaulo(new Date(p.ultimaMudanca!)), hoje)))
    .filter((p) => p.dias! >= DIAS_PARADO)
    .sort((a, b) => b.dias! - a.dias!)

  return {
    etapas: ETAPAS_SOCIAL.map(({ id, label }) => ({ id, label, demandas: comEtapa.filter((p) => p.etapa === id).length })),
    comEquipe: comEtapa.filter((p) => p.etapa !== "pronto").length,
    atrasados,
    parados,
  }
}

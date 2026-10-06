// Departamentos do dashboard e do histórico (Audiovisual, Growth, Social Media)
// e as regras sem banco do painel da social — servem à rota e à tela.
import { estaAtrasada } from "@/lib/status"
import { dataCalendario, dataEmSaoPaulo, diasEntre, hojeEmSaoPaulo } from "@/lib/datas"
import { DIAS_PARADO, ETAPA_NOME, etapaDoPedido } from "@/lib/social-quadro"

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

export type MeDoMenu = {
  tipo?: string
  membership?: { papel?: string; areas?: string[] } | null
  permissoes?: Record<string, boolean | string> | null
  modulos?: Partial<Record<string, boolean>> | null
}

export type AcessoAreas = { gestor: boolean; audiovisual: boolean; growth: boolean; social: boolean }

/**
 * Que áreas esta pessoa vê. É a regra ÚNICA do menu lateral, do dashboard e do
 * histórico: em 06/10/2026 o menu mostrava "Histórico" no Growth e na Social
 * Media por uma conta e a página decidia por outra, e quem clicava caía no
 * histórico do Audiovisual.
 *
 * `null` enquanto /api/me não respondeu, ou se respondeu erro (sem
 * `membership`): quem decide com `null` não troca de área, espera.
 *
 * Gestor e admin pelo cargo legado (`tipo`) OU pelo papel na empresa — o papel
 * é a autoridade (lib/papel.ts); o `tipo` fica pelo que o menu já fazia.
 */
export function acessoDasAreas(me: MeDoMenu | null | undefined): AcessoAreas | null {
  if (!me || !("membership" in me)) return null
  const papel = me.membership?.papel ?? ""
  const gestor = ["admin", "gestor"].includes(me.tipo ?? "") || ["admin", "gestor"].includes(papel)
  const areas = me.membership?.areas ?? []
  const p = me.permissoes ?? {}
  return {
    gestor,
    audiovisual: gestor || areas.length === 0 || areas.includes("audiovisual"),
    growth: me.modulos?.growth !== false && (gestor || areas.includes("growth") || p.verDesign === true),
    social: gestor || papel === "social" || p.verSocial === true,
  }
}

/**
 * Departamentos que esta pessoa vê no dashboard e no histórico, pela mesma
 * regra do menu (acessoDasAreas). Lista vazia = ainda carregando.
 */
export function departamentosVisiveis(me: MeDoMenu | null | undefined): Departamento[] {
  const a = acessoDasAreas(me)
  if (!a) return []
  const lista = DEPARTAMENTOS.filter((d) => a[d])
  return lista.length ? lista : ["audiovisual"]
}

export type Contagem = { id: string; label: string; demandas: number }

export type PessoaComCarga = { id: string; nome: string; abertas: number }

// ── Social Media ────────────────────────────────────────────────────────────
//
// Os pedidos da social são demandas com `socialId` (vídeo ou arte), e ela os vê
// em quatro palavras. As regras são as do quadro dela (lib/social-quadro): a
// etapa é a de etapaDoPedido e "parado" é DIAS_PARADO sem mudança no histórico.
// Aqui só entra o trabalho em andamento: recusado e finalizado ficam de fora.

export type EtapaSocial = "recebido" | "produzindo" | "revisar" | "pronto"

export const ETAPAS_SOCIAL: { id: EtapaSocial; label: string }[] =
  (["recebido", "produzindo", "revisar", "pronto"] as const).map((id) => ({ id, label: ETAPA_NOME[id] }))

export { DIAS_PARADO }

export function etapaSocial(statusVisivel: string, statusInterno?: string | null): EtapaSocial | null {
  if (statusVisivel === "finalizado") return null
  const etapa = etapaDoPedido(statusVisivel, statusInterno)
  return etapa === "recusado" ? null : etapa
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

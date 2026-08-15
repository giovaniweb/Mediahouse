// Vocabulário único de "quem é a pessoa".
//
// Fica separado de pessoas.ts de propósito: aquele traduz o `tipo` LEGADO para as
// dimensões da membership, e continua sendo usado na criação e na promoção de
// pessoas. Este descreve o vocabulário NOVO (vínculo, nível, capacidade) que a
// tela de Pessoas & Acessos usa. Os dois convivem até a consolidação da fase 4.
//
// O problema que isto resolve: a tela de usuários particiona por `Usuario.tipo`
// com uma lista de tipos escrita à mão, enquanto /equipe e /videomakers contam
// fichas profissionais. Mesmas pessoas, tabelas diferentes — e por isso "equipe
// interna" dava 3, 6 ou 7 conforme onde se olhasse.
//
// Aqui existe UMA definição de cada dimensão, e todas as telas passam a usá-la.
//
// Nesta fase nada muda no banco: nível e perfil de acesso são DERIVADOS do papel
// que já existe. Quando virarem campos próprios (fases 3 e 4), só estas funções
// mudam — quem consome continua igual.

/** Relação da pessoa com a organização. Não confundir com o que ela faz. */
export type Vinculo = "interno" | "parceiro" | "cliente" | "sistema"

/** Posição na hierarquia. NÃO determina permissão — ver perfil de acesso. */
export type Nivel = "ceo" | "diretor" | "supervisor" | "lider" | "executor" | "solicitante"

export const LABEL_VINCULO: Record<Vinculo, string> = {
  interno: "Interno",
  parceiro: "Parceiro",
  cliente: "Cliente",
  sistema: "Sistema",
}

export const LABEL_NIVEL: Record<Nivel, string> = {
  ceo: "CEO",
  diretor: "Diretor",
  supervisor: "Supervisor",
  lider: "Líder",
  executor: "Executor",
  solicitante: "Solicitante",
}

// `categoria` na membership já guarda exatamente esta ideia, com outros nomes.
// Não é campo novo — é rótulo novo sobre dado que já existe.
export function vinculoDaCategoria(categoria: string | null | undefined): Vinculo {
  switch (categoria) {
    case "externo": return "parceiro"
    case "solicitante": return "cliente"
    case "sistema": return "sistema"
    default: return "interno"
  }
}

/**
 * Nível organizacional derivado do papel de acesso.
 *
 * É uma aproximação DELIBERADA e temporária: hoje `papel` mistura hierarquia com
 * acesso, que é justamente o problema. Quando `nivelOrganizacional` existir como
 * campo próprio, esta função vira o fallback para quem ainda não o tiver.
 */
export function nivelDoPapel(papel: string | null | undefined, liderAudiovisual?: boolean): Nivel {
  if (papel === "admin") return "supervisor"
  if (papel === "gestor" || papel === "gestor_eventos" || papel === "gestor_trafego") return "supervisor"
  if (liderAudiovisual) return "lider"
  if (papel === "solicitante") return "solicitante"
  return "executor"
}

/** Agrupamento dos filtros rápidos. "Gestão" reúne CEO, Diretor, Supervisor e Líder. */
export type GrupoRapido = "todos" | "gestao" | "executores" | "solicitantes" | "inativos"

export function grupoDoNivel(nivel: Nivel): Exclude<GrupoRapido, "todos" | "inativos"> {
  if (nivel === "executor") return "executores"
  if (nivel === "solicitante") return "solicitantes"
  return "gestao"
}

/**
 * Função profissional: o que a pessoa FAZ.
 *
 * Prioriza o que foi escrito à mão na membership; só cai nas fichas quando não
 * houver. Uma pessoa com ficha de videomaker E de editor aparece como as duas —
 * era exatamente o caso que fazia a mesma pessoa sumir de uma aba e brotar noutra.
 */
export function funcaoDaPessoa(
  funcaoProfissional: string | null | undefined,
  fichas: { videomaker?: boolean; editor?: boolean; designer?: boolean }
): string {
  if (funcaoProfissional?.trim()) return funcaoProfissional.trim()
  const partes: string[] = []
  if (fichas.videomaker) partes.push("Videomaker")
  if (fichas.editor) partes.push("Editor")
  if (fichas.designer) partes.push("Designer")
  return partes.join(" · ")
}

const LABEL_AREA: Record<string, string> = {
  audiovisual: "Audiovisual",
  growth: "Growth",
  eventos: "Eventos",
}

/** Equipes da pessoa. Hoje vem do enum `areas`; na fase 3 vira tabela própria. */
export function equipesDaPessoa(areas: string[] | null | undefined): string[] {
  return (areas ?? []).map((a) => LABEL_AREA[a] ?? a)
}

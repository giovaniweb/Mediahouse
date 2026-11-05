// A busca dentro da lista de escolha (videomaker, editor).
//
// Giovani, 05/11/2026: "na hora de encontra um videomaker tinha que ter uma
// pesquisa por nome ou cidade, um campo de pesquisa que fica na lista, a medida
// que for escrevendo vai filtrando".
//
// Casa pelo nome OU pela cidade (o detalhe da opção, "Nome · Cidade"), sem
// diferenciar acento nem maiúscula: "sao" acha "São Paulo", "CUR" acha
// "Curitiba". Com mais de uma palavra, todas precisam aparecer — "ana cur" é a
// Ana de Curitiba. Sem import de runtime: este módulo vai para o navegador.

export type OpcaoDaLista = {
  value: string
  label: string
  /** A cidade (videomaker) ou a especialidade (editor): entra na busca. */
  detalhe?: string | null
  /** Marca que só aparece, sem entrar na busca: " (usuário)", " (editor)". */
  extra?: string | null
}

export type GrupoDaLista = { rotulo?: string; opcoes: OpcaoDaLista[] }

/** Minúsculas e sem acento, para comparar. */
export function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

export function casaComABusca(opcao: OpcaoDaLista, termo: string): boolean {
  const palavras = semAcento(termo).split(/\s+/).filter(Boolean)
  if (palavras.length === 0) return true
  const alvo = semAcento(`${opcao.label} ${opcao.detalhe ?? ""}`)
  return palavras.every((p) => alvo.includes(p))
}

/** Os grupos com só o que casa; grupo que esvazia some. */
export function filtrarGrupos(grupos: GrupoDaLista[], termo: string): GrupoDaLista[] {
  return grupos
    .map((g) => ({ ...g, opcoes: g.opcoes.filter((o) => casaComABusca(o, termo)) }))
    .filter((g) => g.opcoes.length > 0)
}

/** O texto da opção, como o <select> antigo mostrava: "Nome · Cidade (usuário)". */
export function textoDaOpcao(o: OpcaoDaLista): string {
  return `${o.label}${o.detalhe ? ` · ${o.detalhe}` : ""}${o.extra ?? ""}`
}

// Critério "Pessoa" do "Filtrar por…": uma lista só com quem pode estar num card
// (videomaker, editor, responsável interno). A API filtra cada papel por um
// parâmetro próprio, porque são cadastros diferentes; o prefixo do valor diz
// qual. Antes eram três selects ("Videomaker", "Editor", "Responsável") para a
// mesma pergunta: de quem é este trabalho.

const PARAMETRO = { vm: "videomakerId", ed: "editorId", us: "responsavelId" } as const
export type PapelPessoa = keyof typeof PARAMETRO

export type PessoaDoFiltro = { papel: PapelPessoa; id: string; nome: string; funcao: string }

export function opcoesDePessoa(pessoas: PessoaDoFiltro[]): { valor: string; rotulo: string }[] {
  return [...pessoas]
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map(p => ({ valor: `${p.papel}:${p.id}`, rotulo: `${p.nome} · ${p.funcao}` }))
}

/** Parâmetro da API para o valor escolhido; null se o valor não for de pessoa. */
export function parametroDaPessoa(valor: string): [string, string] | null {
  const i = valor.indexOf(":")
  const papel = valor.slice(0, i) as PapelPessoa
  const id = valor.slice(i + 1)
  return i > 0 && id && papel in PARAMETRO ? [PARAMETRO[papel], id] : null
}

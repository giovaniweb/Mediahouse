// Etiqueta da empresa dona de uma demanda.
//
// O profissional é da REDE: recebe trabalho de mais de uma empresa e vê tudo na
// mesma lista. Sem o rótulo ele não sabe para quem está gravando — e, no caso da
// nota fiscal, para quem está cobrando. /campo já mostrava; as telas de
// videomaker no dashboard não.
//
// A regra é a mesma de lá: com uma empresa só, a etiqueta se repetiria em toda
// linha sem informar nada, então não aparece.
export type EmpresaEtiqueta = { nome: string; slug: string } | null | undefined

/** true quando a lista mistura empresas — é quando a etiqueta tem o que dizer. */
export function temMaisDeUmaEmpresa(itens: { empresa?: EmpresaEtiqueta }[]): boolean {
  return new Set(itens.map((i) => i.empresa?.slug).filter(Boolean)).size > 1
}

export function EtiquetaEmpresa({
  empresa,
  mostrar,
}: {
  empresa?: EmpresaEtiqueta
  mostrar: boolean
}) {
  if (!mostrar || !empresa) return null
  return (
    <span
      title={`Demanda de ${empresa.nome}`}
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-blue-500/25 bg-blue-500/10 text-blue-300 max-w-[12rem] truncate"
    >
      {empresa.nome}
    </span>
  )
}

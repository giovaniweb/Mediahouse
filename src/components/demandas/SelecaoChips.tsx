"use client"

// Seleção de vários itens: os escolhidos viram chips removíveis e o select
// abaixo só oferece o que ainda falta.
//
// Existe porque o card usava um <select> ÚNICO para responsável e para produto,
// e as rotas de gravação substituem o conjunto inteiro (deleteMany + recria).
// Resultado: abrir uma demanda com 3 responsáveis e tocar no campo deixava 1,
// em silêncio. Havia 47 demandas com mais de um responsável no banco quando
// isto foi escrito — a equipe sentia como "tiraram a opção de 2 responsáveis".
//
// O padrão visual segue o modal de Growth (design/page.tsx), que já fazia certo.

export type OpcaoChip = { value: string; label: string }

export function SelecaoChips({
  valores,
  opcoes,
  onChange,
  disabled,
  rotuloAdicionar = "+ Adicionar…",
  vazio = "— Nenhum —",
  salvando,
}: {
  valores: string[]
  opcoes: OpcaoChip[]
  onChange: (novos: string[]) => void
  disabled?: boolean
  rotuloAdicionar?: string
  vazio?: string
  salvando?: boolean
}) {
  const rotuloDe = (id: string) => opcoes.find((o) => o.value === id)?.label ?? id
  const disponiveis = opcoes.filter((o) => o.value && !valores.includes(o.value))

  if (disabled && valores.length === 0) {
    return (
      <span className="block rounded-lg border border-dashed border-zinc-800 bg-zinc-950/30 px-3 py-2 text-sm text-zinc-500">
        {vazio}
      </span>
    )
  }

  return (
    <div>
      {valores.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {valores.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
            >
              {rotuloDe(id)}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remover ${rotuloDe(id)}`}
                  onClick={() => onChange(valores.filter((v) => v !== id))}
                  className="text-indigo-300/70 hover:text-white leading-none focus:outline-none focus:ring-1 focus:ring-indigo-400 rounded"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {!disabled && (
        <select
          value=""
          disabled={salvando || disponiveis.length === 0}
          onChange={(e) => {
            if (e.target.value) onChange([...valores, e.target.value])
          }}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="">
            {disponiveis.length === 0 ? "Todos já adicionados" : rotuloAdicionar}
          </option>
          {disponiveis.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      {salvando && <p className="text-[11px] text-zinc-500 mt-1">Salvando…</p>}
    </div>
  )
}

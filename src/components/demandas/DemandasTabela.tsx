"use client"

import { useState } from "react"
import { ArrowUpDown, ArrowUp, ArrowDown, Download, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  type DemandaLista, responsavelResumo, estaAtrasada, diasDeAtraso, LABEL_STATUS,
} from "./tipos-visao"
import { formatarData, hojeEmSaoPaulo } from "@/lib/datas"

// Visão Tabela: denso, ordenável e exportável. Existe para quem se organiza em
// planilha — em vez de manter uma paralela no Excel e ficar sincronizando na mão,
// a planilha passa a ser uma leitura do próprio quadro.

type Coluna = "codigo" | "titulo" | "status" | "responsavel" | "produto" | "prazo" | "prioridade"
type Direcao = "asc" | "desc"

const COLUNAS: { id: Coluna; label: string; classe?: string }[] = [
  { id: "codigo", label: "Código", classe: "w-32" },
  { id: "titulo", label: "Título" },
  { id: "produto", label: "Produto", classe: "w-40 hidden lg:table-cell" },
  { id: "status", label: "Status", classe: "w-36" },
  { id: "responsavel", label: "Responsável", classe: "w-44 hidden md:table-cell" },
  { id: "prioridade", label: "Prioridade", classe: "w-28 hidden lg:table-cell" },
  { id: "prazo", label: "Prazo", classe: "w-32" },
]

const PESO_PRIORIDADE: Record<string, number> = { urgente: 0, alta: 1, normal: 2, baixa: 3 }

function valorDaColuna(d: DemandaLista, c: Coluna): string | number {
  switch (c) {
    case "codigo": return d.codigo
    case "titulo": return d.titulo.toLowerCase()
    case "status": return LABEL_STATUS[d.statusVisivel] ?? d.statusVisivel
    case "responsavel": return responsavelResumo(d)?.nome?.toLowerCase() ?? "zzz"
    case "produto": return d.produtos?.[0]?.produto?.nome?.toLowerCase() ?? "zzz"
    case "prioridade": return PESO_PRIORIDADE[d.prioridade] ?? 9
    // Sem prazo vai para o fim em vez de para o topo: uma demanda sem data não é
    // mais urgente que uma com data.
    case "prazo": return d.dataLimite ? new Date(d.dataLimite).getTime() : Number.MAX_SAFE_INTEGER
  }
}

// Exportação para planilha.
//
// A versão anterior tinha 7 colunas e perdia dado: `produtos?.[0]` mostrava só o
// primeiro equipamento e `responsavelResumo` só o principal. Quem tinha demanda
// com 3 responsáveis (metade delas, no banco) exportava um. Agora vai tudo, e a
// planilha serve para o controle interno que a equipe pediu.
function paraCsv(demandas: DemandaLista[]): string {
  const cab = [
    "Código", "Título", "Status", "Prioridade",
    "Prazo", "Criada em", "Finalizada em",
    "Responsáveis", "Videomaker", "Editor", "Solicitante",
    "Equipamentos", "Evento", "Comentários", "Arquivos",
  ]

  const escapar = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const data = (v?: string | null) => formatarData(v)

  const linhas = demandas.map((d) => {
    // Todos os responsáveis: a M2M primeiro, com o escalar como reserva para
    // demandas antigas que só têm a coluna derivada preenchida.
    const responsaveis = (d.responsaveis ?? [])
      .map((r) => r.usuario?.nome)
      .filter(Boolean)
    const listaResp = responsaveis.length > 0
      ? responsaveis
      : [d.responsavel?.nome, d.designer?.nome].filter(Boolean)

    return [
      d.codigo,
      d.titulo,
      LABEL_STATUS[d.statusVisivel] ?? d.statusVisivel,
      d.prioridade,
      data(d.dataLimite),
      data(d.createdAt),
      data(d.finalizadaEm),
      listaResp.join(", "),
      d.videomaker?.nome ?? "",
      d.editor?.nome ?? "",
      d.solicitante?.nome ?? "",
      (d.produtos ?? []).map((p) => p.produto?.nome).filter(Boolean).join(", "),
      d.eventoGestao?.nome ?? "",
      d._count?.comentarios ?? 0,
      d._count?.arquivos ?? 0,
    ].map(escapar).join(";")
  })

  // Ponto e vírgula e BOM para o Excel em português abrir sem passo de importação.
  return "﻿" + [cab.map(escapar).join(";"), ...linhas].join("\n")
}

export function DemandasTabela({ demandas, onAbrir }: {
  demandas: DemandaLista[]
  onAbrir: (id: string) => void
}) {
  const [coluna, setColuna] = useState<Coluna>("prazo")
  const [direcao, setDirecao] = useState<Direcao>("asc")

  function ordenarPor(c: Coluna) {
    if (c === coluna) setDirecao((d) => (d === "asc" ? "desc" : "asc"))
    else { setColuna(c); setDirecao("asc") }
  }

  const ordenadas = [...demandas].sort((a, b) => {
    const va = valorDaColuna(a, coluna), vb = valorDaColuna(b, coluna)
    const cmp = va < vb ? -1 : va > vb ? 1 : 0
    return direcao === "asc" ? cmp : -cmp
  })

  function baixarCsv() {
    const blob = new Blob([paraCsv(ordenadas)], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `demandas-${hojeEmSaoPaulo()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">{ordenadas.length} demanda(s)</p>
        <button
          onClick={baixarCsv}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 hover:border-zinc-500 transition-colors"
        >
          <Download className="w-3.5 h-3.5" /> Baixar planilha
        </button>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-x-auto">
        <table className="w-full text-sm min-w-[52rem]">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-500 text-[11px] uppercase tracking-wide">
              {COLUNAS.map((c) => {
                const ativa = coluna === c.id
                const Icone = !ativa ? ArrowUpDown : direcao === "asc" ? ArrowUp : ArrowDown
                return (
                  <th key={c.id} className={cn("text-left px-3 py-2.5 font-medium", c.classe)}>
                    <button
                      onClick={() => ordenarPor(c.id)}
                      className={cn("inline-flex items-center gap-1 hover:text-zinc-200 transition-colors",
                        ativa && "text-zinc-200")}
                    >
                      {c.label}
                      <Icone className="w-3 h-3 opacity-60" />
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((d) => {
              const resp = responsavelResumo(d)
              const atrasada = estaAtrasada(d)
              const dias = diasDeAtraso(d)
              return (
                <tr
                  key={d.id}
                  onClick={() => onAbrir(d.id)}
                  className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/50 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-2.5 font-mono text-[11px] text-zinc-500">{d.codigo}</td>
                  <td className="px-3 py-2.5 text-zinc-200 max-w-0 truncate">{d.titulo}</td>
                  <td className="px-3 py-2.5 text-zinc-400 hidden lg:table-cell truncate">
                    {d.produtos?.[0]?.produto?.nome ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 whitespace-nowrap">
                      {LABEL_STATUS[d.statusVisivel] ?? d.statusVisivel}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-zinc-400 hidden md:table-cell truncate">
                    {resp ? `${resp.nome}${resp.extras > 0 ? ` +${resp.extras}` : ""}` : <span className="italic text-zinc-600">—</span>}
                  </td>
                  <td className="px-3 py-2.5 hidden lg:table-cell">
                    <span className={cn("text-[10px] font-medium",
                      d.prioridade === "urgente" ? "text-red-400"
                      : d.prioridade === "alta" ? "text-orange-400" : "text-zinc-500")}>
                      {d.prioridade}
                    </span>
                  </td>
                  <td className={cn("px-3 py-2.5 whitespace-nowrap",
                    atrasada ? "text-red-400 font-semibold" : "text-zinc-400")}>
                    {atrasada && <AlertTriangle className="w-3 h-3 inline mr-1 align-[-1px]" />}
                    {d.dataLimite ? formatarData(d.dataLimite) : "—"}
                    {atrasada && dias ? <span className="text-[10px] ml-1">({dias}d)</span> : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {ordenadas.length === 0 && (
          <p className="text-center py-12 text-sm text-zinc-500">Nenhuma demanda com os filtros atuais.</p>
        )}
      </div>
    </div>
  )
}

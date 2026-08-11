"use client"

import { useRef, useState } from "react"
import { X, Loader2, Upload, ClipboardPaste, AlertTriangle, CheckCircle2, FileSpreadsheet } from "lucide-react"
import { toast } from "sonner"

// Planilha → cards, em duas etapas: analisar e confirmar. A prévia existe para
// ninguém descobrir que importou 40 linhas erradas depois de gravadas.

interface Analise {
  linha: number
  titulo: string
  prazo: string | null
  prioridade: string
  responsavel: string | null
  produto: string | null
  problemas: string[]
}

interface Previa {
  colunasReconhecidas: string[]
  colunasIgnoradas: string[]
  analises: Analise[]
  totalLinhas: number
  totalValidas: number
}

export function ImportarPlanilhaModal({ area, onClose, onImportado }: {
  area: "audiovisual" | "design"
  onClose: () => void
  onImportado: () => void
}) {
  const [texto, setTexto] = useState("")
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [carregando, setCarregando] = useState(false)
  const overlayRef = useRef<HTMLDivElement>(null)

  async function chamar(confirmar: boolean) {
    setCarregando(true)
    try {
      const res = await fetch("/api/demandas/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, area, confirmar }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? "Não foi possível ler a planilha"); return }

      if (confirmar) {
        toast.success(`${json.criadas} demanda(s) criada(s).`)
        if (json.falhas?.length) toast.warning(`${json.falhas.length} linha(s) não entraram.`)
        onImportado()
        onClose()
      } else {
        setPrevia(json)
      }
    } finally {
      setCarregando(false)
    }
  }

  function lerArquivo(file: File) {
    const leitor = new FileReader()
    leitor.onload = () => { setTexto(String(leitor.result ?? "")); setPrevia(null) }
    leitor.readAsText(file, "utf-8")
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <h2 className="font-semibold text-zinc-100 text-base">Importar planilha</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4 flex-1">
          {!previa ? (
            <>
              <div className="rounded-lg border border-zinc-800 bg-zinc-800/40 px-4 py-3">
                <p className="text-sm text-zinc-300 mb-1">Como montar a planilha</p>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  A primeira linha é o cabeçalho. Só <b>Título</b> é obrigatório; as demais colunas
                  entram se existirem: Descrição, Tipo, Departamento, Produto, Responsável, Prazo e
                  Prioridade. Acento e maiúscula não importam.
                </p>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-400 mb-1.5 flex items-center gap-1.5">
                  <ClipboardPaste className="w-3.5 h-3.5" /> Cole as células copiadas do Excel
                </label>
                <textarea
                  value={texto}
                  onChange={(e) => { setTexto(e.target.value); setPrevia(null) }}
                  rows={9}
                  placeholder={"Título\tPrazo\tResponsável\nVídeo institucional\t20/09/2026\tJulie\nReels do lançamento\t25/09/2026\tAlan"}
                  className="w-full font-mono text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-zinc-200 placeholder:text-zinc-600 outline-none focus:ring-2 focus:ring-purple-500/30 resize-y"
                />
              </div>

              <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-zinc-800 border border-dashed border-zinc-700 text-sm text-zinc-400 cursor-pointer hover:border-purple-500/50 hover:text-zinc-200 transition-colors w-fit">
                <Upload className="w-4 h-4" />
                <span>…ou envie um arquivo CSV</span>
                <input
                  type="file"
                  accept=".csv,.txt,text/csv"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) lerArquivo(f); e.target.value = "" }}
                />
              </label>
              <p className="text-[11px] text-zinc-600">
                Arquivo .xlsx não é lido direto — no Excel, copie as células e cole acima, ou salve como CSV.
              </p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  {previa.totalValidas} de {previa.totalLinhas} linha(s) prontas
                </span>
                {previa.colunasReconhecidas.length > 0 && (
                  <span className="px-2 py-1 rounded bg-zinc-800 text-zinc-400">
                    Colunas usadas: {previa.colunasReconhecidas.join(", ")}
                  </span>
                )}
                {previa.colunasIgnoradas.length > 0 && (
                  <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                    Ignoradas: {previa.colunasIgnoradas.join(", ")}
                  </span>
                )}
              </div>

              <div className="rounded-xl border border-zinc-800 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-zinc-800/60 text-zinc-500 uppercase tracking-wide text-[10px]">
                      <th className="text-left px-3 py-2 w-12">Linha</th>
                      <th className="text-left px-3 py-2">Título</th>
                      <th className="text-left px-3 py-2 w-24">Prazo</th>
                      <th className="text-left px-3 py-2 w-32">Responsável</th>
                      <th className="text-left px-3 py-2">Observações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.analises.map((a) => {
                      const bloqueia = a.problemas.some((p) => p.includes("título"))
                      return (
                        <tr key={a.linha} className="border-t border-zinc-800/70">
                          <td className="px-3 py-2 text-zinc-600 font-mono">{a.linha}</td>
                          <td className="px-3 py-2 text-zinc-200 max-w-0 truncate">{a.titulo || <i className="text-zinc-600">vazio</i>}</td>
                          <td className="px-3 py-2 text-zinc-400">
                            {a.prazo ? new Date(a.prazo).toLocaleDateString("pt-BR") : "—"}
                          </td>
                          <td className="px-3 py-2 text-zinc-400 truncate">{a.responsavel ?? "—"}</td>
                          <td className="px-3 py-2">
                            {a.problemas.length === 0 ? (
                              <span className="inline-flex items-center gap-1 text-emerald-400">
                                <CheckCircle2 className="w-3 h-3" /> ok
                              </span>
                            ) : (
                              <span className={`inline-flex items-start gap-1 ${bloqueia ? "text-red-400" : "text-amber-400"}`}>
                                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                                <span>{a.problemas.join("; ")}</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-[11px] text-zinc-500">
                Em âmbar: a demanda é criada, só sem aquele campo. Em vermelho: a linha não entra —
                sem título não há demanda.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800 shrink-0">
          {previa && (
            <button
              onClick={() => setPrevia(null)}
              className="px-4 py-2 text-sm text-zinc-400 border border-zinc-700 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              Voltar
            </button>
          )}
          <button
            onClick={() => chamar(!!previa)}
            disabled={carregando || !texto.trim()}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-60"
          >
            {carregando && <Loader2 className="w-4 h-4 animate-spin" />}
            {previa ? `Criar ${previa.totalValidas} demanda(s)` : "Conferir antes de criar"}
          </button>
        </div>
      </div>
    </div>
  )
}

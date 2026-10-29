"use client"

import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { BookOpen, ExternalLink, Loader2, Trash2 } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { cn } from "@/lib/utils"
import { TIPOS_DE_GRAVACAO, rotuloDoTipoDeGravacao } from "@/lib/etapas-da-gravacao"
import { COLINHA_ENTREGA_DE_EQUIPAMENTO, TIPOS_DE_MATERIAL, type Material, type TipoDeMaterial } from "@/lib/kit-videomaker"
import { ModalFormulario } from "@/components/demandas/ModalFormulario"
import { Seta, inputClass, selectClass } from "@/components/demandas/campos-formulario"

/**
 * O kit do videomaker (Giovani, 29/10/2026): guia de captação, vídeos de
 * referência e a colinha do dia, por tipo de gravação. Vai na primeira
 * gravação do videomaker, pelo botão do card e fica na página dele; a colinha
 * sai no WhatsApp no dia. Arquivos sobem direto para o armazenamento (os vídeos
 * de referência em 4K passam dos 100 MB).
 */
export function KitDoVideomaker({ aoFechar }: { aoFechar: () => void }) {
  const { data, mutate } = useSWR<{ materiais: Material[]; podeEditar: boolean }>("/api/gravacoes/kit", fetcher)
  const materiais = data?.materiais ?? []
  const podeEditar = data?.podeEditar ?? false
  const [tipo, setTipo] = useState<TipoDeMaterial>("guia")
  const [titulo, setTitulo] = useState("")
  const [tipoGravacao, setTipoGravacao] = useState("")
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [link, setLink] = useState("")
  const [texto, setTexto] = useState(COLINHA_ENTREGA_DE_EQUIPAMENTO)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null)

  async function subir(f: File): Promise<string> {
    const r = await fetch("/api/gravacoes/kit/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contentType: f.type }) })
    const json = await r.json().catch(() => ({})) as { uploadUrl?: string; url?: string; error?: string }
    if (!r.ok || !json.uploadUrl || !json.url) throw new Error(json.error ?? "Não foi possível preparar o envio.")
    const envio = await fetch(json.uploadUrl, { method: "PUT", headers: { "Content-Type": f.type }, body: f })
    if (!envio.ok) throw new Error(`O arquivo não subiu (${envio.status}).`)
    return json.url
  }

  async function adicionar(e: React.FormEvent) {
    e.preventDefault()
    if (enviando) return
    setEnviando("novo")
    try {
      const url = tipo === "colinha" ? undefined : arquivo ? await subir(arquivo) : link.trim()
      if (tipo !== "colinha" && !url) throw new Error("Escolha o arquivo ou cole um link.")
      const r = await fetch("/api/gravacoes/kit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo: titulo.trim(), tipo, tipoGravacao: tipoGravacao || null, ...(tipo === "colinha" ? { texto } : { url }) }),
      })
      const json = await r.json().catch(() => ({})) as { error?: string }
      if (!r.ok) throw new Error(json.error ?? "Não foi possível adicionar.")
      toast.success("Adicionado ao kit.")
      setTitulo(""); setArquivo(null); setLink("")
      await mutate()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível adicionar.")
    } finally {
      setEnviando(null)
    }
  }

  async function remover(m: Material) {
    if (!confirm(`Tirar "${m.titulo}" do kit?`)) return
    setEnviando(m.id)
    try {
      const r = await fetch(`/api/gravacoes/kit/${m.id}`, { method: "DELETE" })
      if (!r.ok) throw new Error()
      await mutate()
    } catch {
      toast.error("Não foi possível tirar do kit.")
    } finally {
      setEnviando(null)
    }
  }

  async function salvarColinha() {
    if (!editando) return
    setEnviando(editando.id)
    try {
      const r = await fetch(`/api/gravacoes/kit/${editando.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: editando.texto }) })
      if (!r.ok) throw new Error()
      setEditando(null)
      toast.success("Colinha salva.")
      await mutate()
    } catch {
      toast.error("Não foi possível salvar a colinha.")
    } finally {
      setEnviando(null)
    }
  }

  return (
    <ModalFormulario aberto titulo="Kit do videomaker" icone={BookOpen} aoTentarFechar={aoFechar} semRodape className="max-w-2xl">
      <div className="space-y-6">
      <p className="text-sm text-zinc-400">
        Vai na primeira gravação de cada videomaker, fica na página dele (o link do convite) e pode ser reenviado pelo card.
        A colinha sai no WhatsApp no dia da gravação.
      </p>

      {TIPOS_DE_MATERIAL.map((t) => {
        const doTipo = materiais.filter((m) => m.tipo === t.id)
        return (
          <section key={t.id} className="space-y-2" aria-label={t.rotulo}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">{t.rotulo}</h3>
            {doTipo.length === 0 && <p className="text-sm text-zinc-500">Nada ainda.</p>}
            <ul className="space-y-2">
              {doTipo.map((m) => (
                <li key={m.id} className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium text-zinc-100">{m.titulo}</span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border bg-zinc-700/50 text-zinc-400 border-zinc-600/50">
                      {rotuloDoTipoDeGravacao(m.tipoGravacao) ?? "Todos os tipos"}
                    </span>
                    <span className="ml-auto flex items-center gap-3">
                      {m.url && <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-sm text-purple-300 hover:text-purple-200 inline-flex items-center gap-1">Abrir <ExternalLink className="w-3.5 h-3.5" aria-hidden /></a>}
                      {m.tipo === "colinha" && podeEditar && editando?.id !== m.id && (
                        <button type="button" className="text-sm text-purple-300 hover:text-purple-200" onClick={() => setEditando({ id: m.id, texto: m.texto ?? "" })}>Editar</button>
                      )}
                      {podeEditar && (
                        <button type="button" aria-label={`Tirar ${m.titulo} do kit`} className="text-zinc-500 hover:text-red-400" disabled={enviando === m.id} onClick={() => void remover(m)}>
                          <Trash2 className="w-4 h-4" aria-hidden />
                        </button>
                      )}
                    </span>
                  </div>
                  {m.tipo === "colinha" && (editando?.id === m.id ? (
                    <div className="mt-3 space-y-2">
                      <textarea value={editando.texto} onChange={(e) => setEditando({ id: m.id, texto: e.target.value })} rows={12} className={inputClass} aria-label="Texto da colinha" />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => void salvarColinha()} disabled={enviando === m.id} className="px-4 py-2 text-sm font-semibold bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-60">Salvar</button>
                        <button type="button" onClick={() => setEditando(null)} className="px-4 py-2 text-sm text-zinc-300 border border-zinc-700 rounded-xl hover:bg-zinc-800">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-zinc-400 line-clamp-4">{m.texto}</p>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {podeEditar && (
        <form onSubmit={adicionar} className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5" aria-busy={!!enviando}>
          <h3 className="font-semibold text-white">Adicionar ao kit</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="kit-tipo" className="block text-xs font-medium text-zinc-400 mb-1.5">O que é</label>
              <div className="relative">
                <select id="kit-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeMaterial)} className={selectClass}>
                  {TIPOS_DE_MATERIAL.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
                </select>
                <Seta />
              </div>
            </div>
            <div>
              <label htmlFor="kit-tipo-gravacao" className="block text-xs font-medium text-zinc-400 mb-1.5">Para qual gravação</label>
              <div className="relative">
                <select id="kit-tipo-gravacao" value={tipoGravacao} onChange={(e) => setTipoGravacao(e.target.value)} className={selectClass}>
                  <option value="">Todos os tipos</option>
                  {TIPOS_DE_GRAVACAO.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
                </select>
                <Seta />
              </div>
            </div>
          </div>
          <div>
            <label htmlFor="kit-titulo" className="block text-xs font-medium text-zinc-400 mb-1.5">Título</label>
            <input id="kit-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} required minLength={2} maxLength={120}
              placeholder={tipo === "guia" ? "Guia Operacional de Captação" : tipo === "referencia" ? "Referência: entrega Unyque Pro" : "Colinha da entrega de equipamento"} className={inputClass} />
          </div>
          {tipo === "colinha" ? (
            <div>
              <label htmlFor="kit-texto" className="block text-xs font-medium text-zinc-400 mb-1.5">Texto que vai no WhatsApp</label>
              <textarea id="kit-texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={12} maxLength={4000} className={inputClass} />
              <p className="text-xs text-zinc-500 mt-1">{"{cliente}, {hora}, {endereco} e {link} viram os dados da gravação."}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label htmlFor="kit-arquivo" className="block text-xs font-medium text-zinc-400 mb-1.5">Arquivo (PDF ou vídeo)</label>
                <input id="kit-arquivo" type="file" accept="application/pdf,video/mp4,video/quicktime,image/jpeg,image/png"
                  onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} className={cn(inputClass, "file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-700 file:px-3 file:py-1 file:text-zinc-100")} />
              </div>
              <div>
                <label htmlFor="kit-link" className="block text-xs font-medium text-zinc-400 mb-1.5">Ou um link (Drive, YouTube)</label>
                <input id="kit-link" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} disabled={!!arquivo} placeholder="https://" className={inputClass} />
              </div>
            </div>
          )}
          <button type="submit" disabled={!!enviando} className="w-full flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-60">
            {enviando === "novo" && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
            {enviando === "novo" && arquivo ? "Subindo o arquivo…" : "Adicionar ao kit"}
          </button>
        </form>
      )}
      </div>
    </ModalFormulario>
  )
}

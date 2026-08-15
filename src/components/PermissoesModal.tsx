"use client"

import { useState, useEffect } from "react"
import { X, Shield, RotateCcw, Save, Loader2, KeyRound, Copy, SlidersHorizontal, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { PERMISSAO_LABELS, PERMISSAO_GRUPOS, type PermissaoKey } from "@/lib/permissoes"
import { mensagemDeErro, erroDaResposta } from "@/lib/erro-cliente"
import { toast } from "sonner"

// Os dois quadros que existem hoje. `eventos` fica de fora de propósito: o
// módulo está congelado e mostrá-lo aqui só criaria uma escolha sem efeito.
const QUADROS = [
  { area: "audiovisual", titulo: "Audiovisual", desc: "Demandas de vídeo, coberturas e entregas" },
  { area: "growth", titulo: "Growth", desc: "Artes, criativos e conteúdo" },
] as const

interface Props {
  usuarioId: string
  usuarioNome: string
  usuarioTipo: string
  usuarioAreas?: string[]
  open: boolean
  onClose: () => void
  onSalvo?: () => void
}

export function PermissoesModal({
  usuarioId, usuarioNome, usuarioTipo, usuarioAreas, open, onClose, onSalvo,
}: Props) {
  const [perms, setPerms] = useState<Record<string, boolean>>({})
  const [areas, setAreas] = useState<string[]>(usuarioAreas ?? [])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  // As 29 permissões ficam recolhidas: quem abre esta tela quase sempre quer
  // ajustar área ou senha, não caçar uma caixinha entre 29.
  const [mostrarPerms, setMostrarPerms] = useState(false)
  const [senhaNova, setSenhaNova] = useState<string | null>(null)
  const [resetando, setResetando] = useState(false)

  useEffect(() => {
    if (!open || !usuarioId) return
    setLoading(true)
    fetch(`/api/permissoes?usuarioId=${usuarioId}`)
      .then((r) => r.json())
      .then((data) => {
        const p: Record<string, boolean> = {}
        for (const key of Object.keys(PERMISSAO_LABELS)) {
          p[key] = !!data[key]
        }
        setPerms(p)
      })
      .finally(() => setLoading(false))
  }, [open, usuarioId])

  function alternarArea(area: string) {
    setAreas((prev) => (prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]))
  }

  async function salvar() {
    setSaving(true)
    try {
      // Área e permissões são gravadas juntas porque, para quem usa, são a mesma
      // decisão: "o que essa pessoa alcança".
      const rArea = await fetch(`/api/usuarios/${usuarioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areas }),
      })
      if (!rArea.ok) throw await erroDaResposta(rArea)

      const res = await fetch("/api/permissoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuarioId, ...perms }),
      })
      if (!res.ok) throw await erroDaResposta(res)

      toast.success("Acesso salvo")
      onSalvo?.()
      onClose()
    } catch (e: unknown) {
      toast.error(mensagemDeErro(e, "Erro ao salvar"))
    } finally {
      setSaving(false)
    }
  }

  async function redefinirSenha() {
    setResetando(true)
    try {
      const res = await fetch(`/api/usuarios/${usuarioId}/senha`, { method: "POST" })
      if (!res.ok) throw await erroDaResposta(res)
      const data = await res.json()
      setSenhaNova(data.senha)
    } catch (e: unknown) {
      toast.error(mensagemDeErro(e, "Erro ao redefinir senha"))
    } finally {
      setResetando(false)
    }
  }

  async function resetar() {
    setSaving(true)
    try {
      const res = await fetch("/api/permissoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuarioId }),
      })
      if (!res.ok) throw await erroDaResposta(res)
      const data = await res.json()
      const p: Record<string, boolean> = {}
      for (const key of Object.keys(PERMISSAO_LABELS)) {
        p[key] = !!data[key]
      }
      setPerms(p)
      toast.success("Voltou ao padrão do tipo")
    } catch (e: unknown) {
      toast.error(mensagemDeErro(e, "Erro ao resetar"))
    } finally {
      setSaving(false)
    }
  }

  function toggle(key: string) {
    setPerms((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100">Acesso de {usuarioNome}</h2>
              <p className="text-xs text-zinc-500 capitalize">{usuarioTipo}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            </div>
          ) : (
            <>
              {/* ── Quadros que a pessoa acompanha ── */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Quadros
                </h3>
                <p className="text-xs text-zinc-600 mb-3">
                  Onde a pessoa atua. Desmarcar esconde o quadro inteiro dela.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {QUADROS.map((q) => {
                    const ativo = areas.includes(q.area)
                    return (
                      <button
                        key={q.area}
                        type="button"
                        onClick={() => alternarArea(q.area)}
                        className={cn(
                          "text-left px-4 py-3 rounded-xl border transition-all",
                          ativo
                            ? "bg-purple-500/10 border-purple-700"
                            : "bg-zinc-800/40 border-zinc-800 hover:border-zinc-700"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn("text-sm font-medium", ativo ? "text-purple-200" : "text-zinc-500")}>
                            {q.titulo}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                              ativo ? "bg-purple-500/20 text-purple-300" : "bg-zinc-800 text-zinc-600"
                            )}
                          >
                            {ativo ? "VÊ" : "NÃO VÊ"}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-600 mt-0.5 leading-snug">{q.desc}</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ── Senha ── */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                  Senha
                </h3>
                {senhaNova ? (
                  <div className="rounded-xl border border-amber-800 bg-amber-500/10 px-4 py-3">
                    <p className="text-xs text-amber-300 mb-2">
                      Senha nova — aparece uma vez só. Copie e envie para a pessoa.
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-sm font-mono text-amber-100 bg-zinc-900/60 rounded-lg px-3 py-2 tracking-wide">
                        {senhaNova}
                      </code>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(senhaNova)
                          toast.success("Copiada")
                        }}
                        className="p-2 rounded-lg border border-amber-800 text-amber-300 hover:bg-amber-500/20 transition-colors"
                        title="Copiar"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={redefinirSenha}
                    disabled={resetando}
                    className="flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border border-zinc-700 bg-zinc-800/40 text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-50"
                  >
                    {resetando ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                    Redefinir senha
                  </button>
                )}
              </div>

              {/* ── Permissões (recolhidas) ── */}
              <div className="border-t border-zinc-800 pt-4">
                <button
                  type="button"
                  onClick={() => setMostrarPerms((v) => !v)}
                  className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Ajuste fino de permissões
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", mostrarPerms && "rotate-180")} />
                </button>

                {mostrarPerms && (
                  <div className="mt-4 space-y-5">
                    <button
                      onClick={resetar}
                      disabled={saving}
                      className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700 transition-colors flex items-center gap-1"
                    >
                      <RotateCcw className="w-3 h-3" /> Voltar ao padrão do tipo
                    </button>

                    {PERMISSAO_GRUPOS.map((grupo) => (
                      <div key={grupo.label}>
                        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                          {grupo.label}
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                          {grupo.keys.map((key) => (
                            <label
                              key={key}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all",
                                perms[key]
                                  ? "bg-purple-500/10 border-purple-700 text-purple-300"
                                  : "bg-zinc-800/50 border-zinc-800 text-zinc-500 hover:border-zinc-700"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={!!perms[key]}
                                onChange={() => toggle(key)}
                                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-0 cursor-pointer"
                              />
                              <span className="text-sm">{PERMISSAO_LABELS[key as PermissaoKey]}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={saving || loading}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

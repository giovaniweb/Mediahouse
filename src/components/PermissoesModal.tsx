"use client"

import { useState, useEffect } from "react"
import { X, Shield, RotateCcw, Save, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { PERMISSAO_LABELS, PERMISSAO_GRUPOS, type PermissaoKey } from "@/lib/permissoes"
import { toast } from "sonner"

interface Props {
  usuarioId: string
  usuarioNome: string
  usuarioTipo: string
  open: boolean
  onClose: () => void
}

export function PermissoesModal({ usuarioId, usuarioNome, usuarioTipo, open, onClose }: Props) {
  const [perms, setPerms] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

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

  async function salvar() {
    setSaving(true)
    try {
      const res = await fetch("/api/permissoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuarioId, ...perms }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Permissoes salvas!")
      onClose()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar")
    } finally {
      setSaving(false)
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
      if (!res.ok) throw new Error((await res.json()).error)
      const data = await res.json()
      const p: Record<string, boolean> = {}
      for (const key of Object.keys(PERMISSAO_LABELS)) {
        p[key] = !!data[key]
      }
      setPerms(p)
      toast.success("Permissoes resetadas para o padrão do tipo!")
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao resetar")
    } finally {
      setSaving(false)
    }
  }

  function toggle(key: string) {
    setPerms((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function marcarTodos(value: boolean) {
    const p: Record<string, boolean> = {}
    for (const key of Object.keys(PERMISSAO_LABELS)) {
      p[key] = value
    }
    setPerms(p)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100">Permissoes de {usuarioNome}</h2>
              <p className="text-xs text-zinc-500 capitalize">Tipo: {usuarioTipo}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            </div>
          ) : (
            <>
              {/* Quick actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => marcarTodos(true)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-green-600/20 text-green-400 border border-green-800 hover:bg-green-600/30 transition-colors"
                >
                  Marcar Todos
                </button>
                <button
                  onClick={() => marcarTodos(false)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-red-600/20 text-red-400 border border-red-800 hover:bg-red-600/30 transition-colors"
                >
                  Desmarcar Todos
                </button>
                <button
                  onClick={resetar}
                  disabled={saving}
                  className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700 transition-colors flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" /> Resetar Padrao
                </button>
              </div>

              {/* Permission groups */}
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
            Salvar Permissoes
          </button>
        </div>
      </div>
    </div>
  )
}

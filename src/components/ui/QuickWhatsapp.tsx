"use client"

import { useState } from "react"
import { Send, MessageSquare, Check, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface QuickWhatsappProps {
  telefone: string
  nome: string
  label?: string
  className?: string
}

function formatTelefone(tel: string) {
  const digits = tel.replace(/\D/g, "")
  // Brazilian format: +55 (XX) XXXXX-XXXX
  const m = digits.match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/)
  if (m) return `+${m[1]} (${m[2]}) ${m[3]}-${m[4]}`
  return tel
}

export function QuickWhatsapp({ telefone, nome, label, className }: QuickWhatsappProps) {
  const [expanded, setExpanded] = useState(false)
  const [mensagem, setMensagem] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  const digits = telefone.replace(/\D/g, "")

  async function enviar() {
    if (!mensagem.trim()) return
    setEnviando(true)
    try {
      const res = await fetch("/api/whatsapp/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone: digits, mensagem }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success(`Mensagem enviada para ${nome}!`)
      setEnviado(true)
      setMensagem("")
      setTimeout(() => {
        setEnviado(false)
        setExpanded(false)
      }, 2000)
    } catch (e) {
      toast.error(String(e))
    } finally { setEnviando(false) }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center gap-2">
        {label && <p className="text-xs text-zinc-500">{label}</p>}
        <a
          href={`https://wa.me/${digits}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-green-400 hover:text-green-300 flex items-center gap-1.5 transition-colors"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.75.75 0 00.913.913l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.336 0-4.512-.752-6.278-2.034l-.438-.332-2.844.954.954-2.844-.332-.438A9.935 9.935 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
          </svg>
          {formatTelefone(telefone)}
        </a>
        <button
          onClick={() => setExpanded(v => !v)}
          title="Enviar mensagem rápida"
          className={cn(
            "flex items-center gap-1 text-xs px-2 py-0.5 rounded-md transition-all border",
            expanded
              ? "bg-purple-600/20 border-purple-600/50 text-purple-300"
              : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
          )}
        >
          <MessageSquare className="w-3 h-3" />
          <span>Mensagem</span>
        </button>
      </div>

      {expanded && (
        <div className="bg-zinc-800/60 border border-zinc-700/60 rounded-xl p-3 space-y-2">
          <p className="text-xs text-zinc-500 font-medium">Para: {nome}</p>
          <textarea
            value={mensagem}
            onChange={e => setMensagem(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) enviar()
              if (e.key === "Escape") setExpanded(false)
            }}
            placeholder={`Mensagem para ${nome}...`}
            rows={3}
            autoFocus
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 resize-none outline-none focus:ring-1 focus:ring-purple-500/50"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-600">Ctrl+Enter para enviar · Esc para fechar</p>
            <div className="flex gap-2">
              <button
                onClick={() => { setExpanded(false); setMensagem("") }}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={enviar}
                disabled={enviando || !mensagem.trim()}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all disabled:opacity-40",
                  enviado
                    ? "bg-green-600 text-white"
                    : "bg-purple-600 hover:bg-purple-700 text-white"
                )}
              >
                {enviado ? (
                  <><Check className="w-3.5 h-3.5" /> Enviado</>
                ) : enviando ? (
                  <span className="animate-pulse">Enviando...</span>
                ) : (
                  <><Send className="w-3.5 h-3.5" /> Enviar</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

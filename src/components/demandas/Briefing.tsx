"use client"

import { useState } from "react"
import { Check, Copy, Loader2, Pencil } from "lucide-react"
import { toast } from "sonner"
import { mensagemDeErro } from "@/lib/erro-cliente"
import surface from "./DemandSurface.module.css"

// Briefing inteiro, grande e copiável; editar só pelo botão.
//
// Antes o texto vinha dobrado em 400 caracteres e clicar em cima abria uma
// caixinha de 4 linhas. Quem usa no dia a dia clica no briefing para
// selecionar e copiar, não para editar — e para editar um texto longo precisa
// vê-lo inteiro. Agora o clique seleciona; "Editar" abre um editor do tamanho
// do texto, com Salvar e Cancelar.
export function Briefing({ texto, podeEditar, onSalvar, titulo = "Briefing" }: {
  texto: string
  podeEditar: boolean
  onSalvar: (novo: string) => Promise<void>
  titulo?: string
}) {
  const [rascunho, setRascunho] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const editando = rascunho !== null

  // Do tamanho do texto, entre 10 e 28 linhas; passando disso o editor rola.
  const linhas = editando
    ? Math.min(28, Math.max(10, rascunho.split("\n").length + Math.ceil(rascunho.length / 90) + 1))
    : 0

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 1600)
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie.")
    }
  }

  function cancelar() {
    if (rascunho !== texto && !confirm("Descartar o que você escreveu no briefing?")) return
    setRascunho(null)
    setErro(null)
  }

  async function salvar() {
    if (rascunho === null) return
    if (rascunho === texto) { setRascunho(null); return }
    setSalvando(true)
    setErro(null)
    try {
      await onSalvar(rascunho)
      setRascunho(null)
      toast.success("Briefing salvo.")
    } catch (e) {
      // Fica em edição com o texto preservado: perder o que foi escrito é pior que o erro.
      setErro(mensagemDeErro(e, "Não foi possível salvar o briefing."))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className={surface.briefing}>
      <div className={surface.sectionHead}>
        <h2 className={surface.sectionTitle}>{titulo}</h2>
        {!editando && (
          <div className={surface.sectionActions}>
            {texto && (
              <button type="button" className={surface.btnGhost} onClick={copiar}>
                {copiado ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
                {copiado ? "Copiado" : "Copiar"}
              </button>
            )}
            {podeEditar && (
              <button type="button" className={surface.btn} onClick={() => { setRascunho(texto); setErro(null) }}>
                <Pencil size={15} aria-hidden /> {texto ? "Editar" : "Escrever briefing"}
              </button>
            )}
          </div>
        )}
      </div>

      {editando ? (
        <div className={surface.briefingEditor}>
          <textarea
            autoFocus
            value={rascunho}
            rows={linhas}
            disabled={salvando}
            aria-label={`Editar ${titulo.toLowerCase()}`}
            aria-invalid={!!erro}
            onChange={(e) => { setRascunho(e.target.value); setErro(null) }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void salvar() }
              if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelar() }
            }}
          />
          {erro && <p role="alert" className={surface.fieldError}>{erro}</p>}
          <div className={surface.briefingEditorActions}>
            <span>Ctrl/⌘ + Enter salva · Esc cancela</span>
            <button type="button" className={surface.btn} onClick={cancelar} disabled={salvando}>Cancelar</button>
            <button type="button" className={surface.btnPrimary} onClick={() => void salvar()} disabled={salvando}>
              {salvando ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Salvando…</> : "Salvar"}
            </button>
          </div>
        </div>
      ) : texto ? (
        <div className={surface.briefingText}>{texto}</div>
      ) : (
        <p className={surface.empty}>Sem briefing ainda.</p>
      )}
    </div>
  )
}

"use client"

import { useEffect, useState, useRef } from "react"
import { Upload, Check, Loader2, FileText, AlertTriangle, X } from "lucide-react"

interface NFData {
  id: string
  status: string
  nomeArquivo?: string
  videomaker: { nome: string }
  demanda: { codigo: string; titulo: string }
}

interface NFUploadModalProps {
  token: string
  onClose: () => void
  onSuccess?: () => void
}

export function NFUploadModal({ token, onClose, onSuccess }: NFUploadModalProps) {
  const [nf, setNF] = useState<NFData | null>(null)
  const [erro, setErro] = useState("")
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  useEffect(() => {
    fetch(`/api/nf-upload/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error)
        return r.json()
      })
      .then(setNF)
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false))
  }, [token])

  // Fechar com ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  async function enviar() {
    if (!selectedFile) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("arquivo", selectedFile)
      const r = await fetch(`/api/nf-upload/${token}`, { method: "POST", body: fd })
      if (!r.ok) throw new Error((await r.json()).error)
      setSucesso(true)
      onSuccess?.()
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro ao enviar")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Botão fechar */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-1 rounded-full bg-black/30 text-white/60 hover:text-white hover:bg-black/50 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
          </div>
        ) : erro && !nf ? (
          <div className="p-8 text-center">
            <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-zinc-100 mb-2">Link indisponível</h2>
            <p className="text-zinc-400 text-sm">{erro}</p>
            <button onClick={onClose} className="mt-4 text-xs text-zinc-500 hover:text-zinc-300">Fechar</button>
          </div>
        ) : sucesso || nf?.status === "enviada" ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-400" />
            </div>
            <h2 className="text-xl font-bold text-zinc-100 mb-2">Nota Fiscal Enviada! ✅</h2>
            <p className="text-zinc-400 text-sm mb-6">Obrigado! Sua nota fiscal será processada em breve.</p>
            <button
              onClick={onClose}
              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm px-5 py-2 rounded-lg transition-colors"
            >
              Fechar
            </button>
          </div>
        ) : (
          <>
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 relative">
              <p className="text-emerald-200 text-sm font-medium">Upload de Nota Fiscal</p>
              <h2 className="text-xl font-bold text-white mt-1">
                {nf!.demanda.codigo} — {nf!.demanda.titulo}
              </h2>
            </div>

            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-zinc-300">
                Olá <span className="font-semibold text-white">{nf!.videomaker.nome}</span>, envie sua nota fiscal referente a esta demanda.
              </p>

              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-600 hover:bg-emerald-600/5 transition-all"
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
                {selectedFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileText className="w-8 h-8 text-emerald-400" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-zinc-200">{selectedFile.name}</p>
                      <p className="text-xs text-zinc-500">{(selectedFile.size / 1024).toFixed(0)} KB</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-zinc-600 mx-auto mb-2" />
                    <p className="text-sm text-zinc-400">Clique para selecionar o arquivo</p>
                    <p className="text-xs text-zinc-600 mt-1">PDF, PNG ou JPG</p>
                  </>
                )}
              </div>

              {erro && <p className="text-sm text-red-400">{erro}</p>}
            </div>

            <div className="px-6 py-4 border-t border-zinc-800">
              <button
                onClick={enviar}
                disabled={!selectedFile || uploading}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                {uploading ? "Enviando..." : "Enviar Nota Fiscal"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

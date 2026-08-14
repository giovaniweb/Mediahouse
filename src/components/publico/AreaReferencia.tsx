"use client"

// Área de referência visual do formulário público: arrastar, colar (Ctrl+V) ou
// clicar para escolher.
//
// Antes só existia um campo de link. Quem pega uma imagem no Pinterest copia a
// imagem, não a URL — e acabava colando um link que expira, ou nada.
//
// Os arquivos ficam na memória até a demanda existir (o upload é por demandaId),
// e sobem logo depois do envio, com o token temporário devolvido pela criação.

import { useRef, useState, useEffect } from "react"
import { ImagePlus, X, FileText } from "lucide-react"

export const MAX_REFERENCIAS = 5
const TAMANHO_MAXIMO = 4 * 1024 * 1024
const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]

export function AreaReferencia({
  arquivos,
  onChange,
  desabilitado,
}: {
  arquivos: File[]
  onChange: (novos: File[]) => void
  desabilitado?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [arrastando, setArrastando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  function adicionar(novos: FileList | File[]) {
    const lista = Array.from(novos)
    const aceitos: File[] = []
    let recusado: string | null = null

    for (const f of lista) {
      if (arquivos.length + aceitos.length >= MAX_REFERENCIAS) {
        recusado = `Máximo de ${MAX_REFERENCIAS} arquivos.`
        break
      }
      if (!TIPOS.includes(f.type)) { recusado = `"${f.name}" não é imagem nem PDF.`; continue }
      if (f.size > TAMANHO_MAXIMO) { recusado = `"${f.name}" passa de 4 MB.`; continue }
      aceitos.push(f)
    }

    if (aceitos.length > 0) onChange([...arquivos, ...aceitos])
    setAviso(recusado)
  }

  // Colar imagem da área de transferência — é como se copia do Pinterest.
  useEffect(() => {
    if (desabilitado) return
    const aoColar = (e: ClipboardEvent) => {
      const itens = Array.from(e.clipboardData?.files ?? [])
      if (itens.length > 0) { e.preventDefault(); adicionar(itens) }
    }
    window.addEventListener("paste", aoColar)
    return () => window.removeEventListener("paste", aoColar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arquivos, desabilitado])

  const cheio = arquivos.length >= MAX_REFERENCIAS

  return (
    <div>
      {!cheio && (
        <button
          type="button"
          disabled={desabilitado}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
          onDragLeave={() => setArrastando(false)}
          onDrop={(e) => {
            e.preventDefault()
            setArrastando(false)
            if (e.dataTransfer.files?.length) adicionar(e.dataTransfer.files)
          }}
          className={`w-full rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors disabled:opacity-50 ${
            arrastando
              ? "border-purple-500 bg-purple-500/10"
              : "border-zinc-700 bg-zinc-800/40 hover:border-zinc-500"
          }`}
        >
          <ImagePlus className="w-7 h-7 mx-auto mb-2 text-zinc-500" />
          <span className="block text-sm font-medium text-zinc-300">
            Arraste uma referência aqui
          </span>
          <span className="block text-xs text-zinc-500 mt-1">
            ou clique para escolher — dá para colar direto com Ctrl+V
          </span>
          <span className="block text-[11px] text-zinc-600 mt-2">
            Imagem ou PDF, até 4 MB cada
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={TIPOS.join(",")}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) adicionar(e.target.files)
          e.target.value = ""
        }}
      />

      {aviso && <p className="text-xs text-amber-400 mt-2">{aviso}</p>}

      {arquivos.length > 0 && (
        <ul className="mt-3 space-y-2">
          {arquivos.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/60 p-2"
            >
              {f.type.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={URL.createObjectURL(f)}
                  alt=""
                  className="w-11 h-11 rounded object-cover shrink-0"
                  onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                />
              ) : (
                <span className="w-11 h-11 rounded bg-zinc-700 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-zinc-400" />
                </span>
              )}
              <span className="flex-1 min-w-0">
                <span className="block text-xs text-zinc-300 truncate">{f.name}</span>
                <span className="block text-[11px] text-zinc-500">
                  {(f.size / 1024 / 1024).toFixed(1)} MB
                </span>
              </span>
              {!desabilitado && (
                <button
                  type="button"
                  aria-label={`Remover ${f.name}`}
                  onClick={() => onChange(arquivos.filter((_, idx) => idx !== i))}
                  className="text-zinc-500 hover:text-rose-400 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

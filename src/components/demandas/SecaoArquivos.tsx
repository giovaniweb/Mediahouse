"use client"

// O "rodapé" dos formulários de criação: anexos, links de referência e link dos
// brutos. É a mesma peça no audiovisual e no Growth de propósito — quem abre um
// pedido não deveria descobrir que o campo de referência existe só numa das duas
// telas.
//
// Componente controlado: o estado mora no formulário, porque é ele quem grava o
// rascunho e monta o payload. Anexos ficam de fora do rascunho (File não
// sobrevive ao localStorage).

import { Plus, Link2, Paperclip, UploadCloud, FileText, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { documentoMuitoGrande, ACCEPT_DOCUMENTOS } from "@/lib/upload-documento"
import { useState } from "react"
import { Secao, Campo, Chip, inputClass } from "./campos-formulario"

interface SecaoArquivosProps {
  anexos: File[]
  onAnexos: (atualizar: (atuais: File[]) => File[]) => void
  referencias: string[]
  onReferencias: (atualizar: (atuais: string[]) => string[]) => void
  novaReferencia: string
  onNovaReferencia: (valor: string) => void
  linkBrutos: string
  onLinkBrutos: (valor: string) => void
  titulo?: string
}

/**
 * Junta as referências confirmadas com a que ficou digitada no campo. Perder o
 * que a pessoa acabou de colar por causa de um clique a menos é o tipo de
 * detalhe que faz o campo parecer quebrado.
 */
export function juntarReferencias(referencias: string[], novaReferencia: string): string | undefined {
  const pendente = novaReferencia.trim()
  const todas = pendente && !referencias.includes(pendente) ? [...referencias, pendente] : referencias
  return todas.join("\n") || undefined
}

export function SecaoArquivos({
  anexos, onAnexos, referencias, onReferencias, novaReferencia, onNovaReferencia,
  linkBrutos, onLinkBrutos, titulo = "Arquivos e referências",
}: SecaoArquivosProps) {
  const [arrastando, setArrastando] = useState(false)

  function receberArquivos(lista: FileList | File[]) {
    const escolhidos = Array.from(lista)
    const grandes = escolhidos.filter(documentoMuitoGrande)
    if (grandes.length > 0) {
      toast.error(`Acima de 25 MB: ${grandes.map((f) => f.name).join(", ")}`)
    }
    onAnexos((atuais) => [...atuais, ...escolhidos.filter((f) => !documentoMuitoGrande(f))])
  }

  function adicionarReferencia() {
    const valor = novaReferencia.trim()
    if (!valor) return
    onReferencias((prev) => (prev.includes(valor) ? prev : [...prev, valor]))
    onNovaReferencia("")
  }

  return (
    <Secao icone={Paperclip} titulo={titulo}>
      {/* O anexo passa pela rota de documento: briefing, contrato, planilha,
          imagem de referência. Material bruto de vídeo não cabe aqui (25 MB)
          — vai por link, no campo logo abaixo. */}
      <label
        onDragOver={e => { e.preventDefault(); setArrastando(true) }}
        onDragLeave={() => setArrastando(false)}
        onDrop={e => {
          e.preventDefault()
          setArrastando(false)
          if (e.dataTransfer.files?.length) receberArquivos(e.dataTransfer.files)
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-7 text-center transition-colors",
          arrastando
            ? "border-purple-400 bg-purple-500/10"
            : "border-purple-500/40 bg-zinc-900/40 hover:border-purple-500/70 hover:bg-purple-500/5"
        )}
      >
        <UploadCloud className="h-6 w-6 text-purple-400" />
        <span className="text-sm font-medium text-zinc-200">Arraste arquivos para cá</span>
        <span className="text-xs text-zinc-500">
          ou <span className="text-purple-400 underline underline-offset-2">clique para selecionar</span>
        </span>
        <span className="text-[11px] text-zinc-600">PDF, Word, Excel, PNG, JPG — até 25 MB cada</span>
        <input
          type="file"
          multiple
          accept={ACCEPT_DOCUMENTOS}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) receberArquivos(e.target.files)
            e.target.value = ""
          }}
        />
      </label>

      {anexos.length > 0 && (
        <ul className="space-y-1.5">
          {anexos.map((file, i) => (
            <li key={`${file.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-zinc-900/70 px-2.5 py-1.5 text-xs text-zinc-300">
              <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              <span className="flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-zinc-500">{Math.max(1, Math.round(file.size / 1024))} KB</span>
              <button
                type="button"
                onClick={() => onAnexos((atuais) => atuais.filter((_, idx) => idx !== i))}
                className="shrink-0 text-zinc-500 transition-colors hover:text-red-400"
                aria-label={`Remover ${file.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Campo label="Links de referência">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              value={novaReferencia}
              onChange={e => onNovaReferencia(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); adicionarReferencia() }
              }}
              placeholder="Cole aqui links do Drive, Instagram, YouTube..."
              className={cn(inputClass, "pl-10")}
            />
          </div>
          <button
            type="button"
            onClick={adicionarReferencia}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 text-xs font-medium text-zinc-300 transition-colors hover:border-purple-500/50 hover:text-purple-300"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar link
          </button>
        </div>
      </Campo>

      {referencias.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {referencias.map(ref => (
            <Chip
              key={ref}
              texto={ref}
              onRemover={() => onReferencias(prev => prev.filter(r => r !== ref))}
            />
          ))}
        </div>
      )}

      <Campo label="Link dos brutos" opcional>
        <div className="relative">
          <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="url"
            value={linkBrutos}
            onChange={e => onLinkBrutos(e.target.value)}
            placeholder="https://drive.google.com/... (pasta com o material bruto)"
            className={cn(inputClass, "pl-10")}
          />
        </div>
      </Campo>
    </Secao>
  )
}

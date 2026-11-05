"use client"

import { Download, ExternalLink, Film, FolderOpen, Pencil, Play } from "lucide-react"
import { midiaDaGravacao, type TrocaNoAgora } from "@/lib/etapas-da-gravacao"
import { paraDownload } from "@/lib/midia-download"
import { cn } from "@/lib/utils"
import surface from "@/components/demandas/DemandSurface.module.css"

/**
 * A mídia da gravação externa, só para ler, no "Arquivos" do card aberto.
 *
 * Giovani, 04/11/2026: "esse sistema ficou confuso, 2 lugar para anexar a
 * midia, temos que simplificar". A mídia entra só pelo "Agora"; aqui fica o
 * que já chegou, num bloco só: os brutos, o vídeo final (tocar, baixar, abrir)
 * e as pastas antigas (linkFolderBrutos e linkFolderFinal), que não têm mais
 * campo no card mas não somem. O mesmo link aparece uma vez. "Trocar" abre o
 * campo no "Agora" — não há um segundo lugar de envio.
 */

const hostDe = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "")
  } catch {
    return url
  }
}

export function MidiaDaGravacao({ job, podeEditar, referencias, onTocar, onTrocar }: {
  job: Parameters<typeof midiaDaGravacao>[0]
  podeEditar: boolean
  /** As referências do pedido (uma por linha), como antes. */
  referencias?: string | null
  onTocar: (url: string) => void
  onTrocar?: (qual: TrocaNoAgora) => void
}) {
  const itens = midiaDaGravacao(job)
  const refs = (referencias ?? "").split("\n").map((r) => r.trim()).filter(Boolean)

  return (
    <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-5">
      <div className={surface.sectionHead}>
        <h2 className={surface.sectionTitle}>
          <Film aria-hidden /> Mídia da gravação
          {itens.length > 0 && <span className={surface.count}>{itens.length}</span>}
        </h2>
      </div>

      {itens.length === 0 ? (
        <p className={surface.empty}>Nada chegou ainda. Os brutos e o vídeo final entram pelo “Agora”, lá em cima.</p>
      ) : (
        <div className={surface.fileList}>
          {itens.map((m) => {
            const nome = m.nomeArquivo ?? m.rotulo
            const detalhe = m.nomeArquivo ? m.rotulo : m.noNuflow ? "subido no NuFlow" : hostDe(m.url)
            return (
              <div key={m.url} className={surface.fileRow}>
                <span className={surface.fileBadge}>{m.toca ? <Film className="w-4 h-4" aria-hidden /> : <FolderOpen className="w-4 h-4" aria-hidden />}</span>
                <span className={surface.fileName}>
                  <span title={m.url}>{nome}</span>
                  <span>{m.antigo ? `${detalhe} · pasta antiga` : detalhe}</span>
                </span>
                <span className={surface.fileActions}>
                  {m.toca && (
                    <button type="button" onClick={() => onTocar(m.url)} title="Tocar" aria-label={`Tocar ${nome}`} className={surface.iconBtn}>
                      <Play aria-hidden />
                    </button>
                  )}
                  {m.noNuflow && (
                    <a href={paraDownload(m.originalUrl ?? m.url) ?? m.url} target="_blank" rel="noopener noreferrer"
                      title={m.originalUrl ? "Baixar original" : "Baixar"} aria-label={`Baixar ${nome}`} className={surface.iconBtn}>
                      <Download aria-hidden />
                    </a>
                  )}
                  <a href={m.url} target="_blank" rel="noopener noreferrer" title="Abrir" aria-label={`Abrir ${nome}`} className={surface.iconBtn}>
                    <ExternalLink aria-hidden />
                  </a>
                  {podeEditar && !m.antigo && onTrocar && (
                    <button type="button" onClick={() => onTrocar(m.qual)} title="Trocar (abre no “Agora”)"
                      aria-label={m.qual === "brutos" ? "Trocar o link dos brutos" : "Trocar o vídeo final"} className={surface.iconBtn}>
                      <Pencil aria-hidden />
                    </button>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {refs.length > 0 && (
        <div className="mt-5">
          <p className={surface.subTitle}>Referências</p>
          <div className="space-y-1.5">
            {refs.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className={cn(surface.linkBtn, "max-w-full")}>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden /> <span className="truncate">{url}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

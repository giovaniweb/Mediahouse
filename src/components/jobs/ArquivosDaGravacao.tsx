"use client"

import { useRef, useState, type ReactNode } from "react"
import { CheckCircle2, Circle, Copy, Download, ExternalLink, Film, FolderOpen, Loader2, MinusCircle, Play, Plus, Send, Upload } from "lucide-react"
import { toast } from "sonner"
import { hojeEmSaoPaulo } from "@/lib/datas"
import {
  foiCancelada,
  itensDosArquivos,
  linkValido,
  patchDosBrutos,
  situacaoDaNota,
  statusAoGravarMaterial,
  type ItemDosArquivos,
  type TrocaNoAgora,
} from "@/lib/etapas-da-gravacao"
import { paraDownload } from "@/lib/midia-download"
import { nomeDoVideo, provedorDoVideo, videosDaGravacao, type VideoParaMostrar } from "@/lib/videos-da-gravacao"
import { MiniaturasDeVideo } from "@/components/video/MiniaturasDeVideo"
import { LightboxDeVideo, type VideoDoLightbox } from "@/components/video/LightboxDeVideo"
import { LIMITE_VIDEO_NA_TELA_MB } from "@/lib/upload-video"
import { cn } from "@/lib/utils"
import surface from "@/components/demandas/DemandSurface.module.css"
import styles from "./FichaDoJob.module.css"
import { TAG_DA_NOTA } from "./etiquetas"
import type { GravacaoDoPasso } from "./PassoDaGravacao"

/**
 * O bloco "Arquivos" da ficha da gravação, na coluna da esquerda.
 *
 * Giovani, 05/11/2026: "colocar os anexar links de arquivos como na interface.
 * ... a aba la embaixo de arquivo pode remover pq vamos subir para cima". É o
 * lugar único de VER e de MANDAR o material: os brutos (link ou arquivo), o
 * vídeo final (arquivo ou link, com tocar, baixar e trocar), as pastas antigas
 * que ainda existirem, a nota fiscal do videomaker e os documentos. Cada linha
 * diz também se chegou, como diziam as "Entregas do videomaker" — que deixaram
 * de ser uma segunda lista da mesma coisa.
 *
 * O que vale desde o 32768df continua: uma linha por coisa (o mesmo link uma
 * vez), dado antigo aparece, e completar o material anda a gravação como no
 * link do convite (statusAoGravarMaterial).
 */

const hostDe = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "")
  } catch {
    return url
  }
}

const ICONE_DO_ESTADO: Record<ItemDosArquivos["estado"], ReactNode> = {
  feito: <CheckCircle2 aria-hidden />,
  falta: <Circle aria-hidden />,
  depois: <Circle aria-hidden />,
  pulado: <MinusCircle aria-hidden />,
}

function copiar(texto: string, aviso: string) {
  navigator.clipboard.writeText(texto).then(() => toast.success(aviso), () => toast.error("Não foi possível copiar."))
}

export function ArquivosDaGravacao({
  job,
  podeEditar,
  onSalvar,
  onAvancar,
  onAtualizar,
  onEnviarArquivo,
  onRegistrarVideo,
  onRemoverVideo,
  documentos,
  referencias,
}: {
  job: GravacaoDoPasso
  podeEditar: boolean
  /** Grava campos sem mudar o status. Lança com a frase do servidor. */
  onSalvar: (patch: Record<string, unknown>) => Promise<void>
  /** Grava os campos (se houver) e muda o status. Lança com a frase do servidor. */
  onAvancar: (statusInterno: string, patch?: Record<string, unknown>) => Promise<void>
  /** Recarrega o card depois de agir na nota. */
  onAtualizar: () => Promise<unknown> | void
  /** Sobe o arquivo pelo envio de Demandas (lib/upload-video) e devolve o endereço. */
  onEnviarArquivo?: (tipo: "brutos" | "final", file: File, onProgress: (pct: number) => void) => Promise<string>
  /** Registra um link colado como vídeo do card (vira Arquivo, como o arquivo subido). */
  onRegistrarVideo?: (url: string) => Promise<void>
  /** Tira um vídeo do card: o registro (por id) ou, no link antigo sem registro, o linkFinal. */
  onRemoverVideo?: (arquivoId: string | null) => Promise<void>
  /** Os documentos do card (PDF, Word, planilha), com o "Anexar" deles. */
  documentos?: ReactNode
  /** As referências do pedido, uma por linha. */
  referencias?: string | null
}) {
  const itens = itensDosArquivos(job, hojeEmSaoPaulo())
  const [abertos, setAbertos] = useState<Partial<Record<TrocaNoAgora, boolean>>>({})
  const [portas, setPortas] = useState<Record<TrocaNoAgora, "arquivo" | "link">>({ brutos: "link", video: "arquivo" })
  const [links, setLinks] = useState<Record<TrocaNoAgora, string>>({ brutos: "", video: "" })
  const [salvando, setSalvando] = useState<TrocaNoAgora | null>(null)
  const [enviando, setEnviando] = useState<{ qual: TrocaNoAgora; nome: string; pct: number } | null>(null)
  const [agindo, setAgindo] = useState<string | null>(null)
  const [plano, setPlano] = useState<string | null>(null)
  const arquivoRef = useRef<Partial<Record<TrocaNoAgora, HTMLInputElement | null>>>({})
  // Os vídeos do card (lib/videos-da-gravacao): um ou mais. Trocar um deles
  // sobe o novo e tira o registro do trocado; "Adicionar outro vídeo" só soma.
  const videos: VideoParaMostrar[] = videosDaGravacao(job.linkFinal,
    (job.arquivos ?? []).filter((a) => a.tipoArquivo === "final").map((a) => ({
      id: a.id ?? null, url: a.url, originalUrl: a.originalUrl, nomeArquivo: a.nomeArquivo, thumbnailUrl: a.thumbnailUrl,
    })))
  const [trocando, setTrocando] = useState<VideoParaMostrar | null>(null)
  const [removendo, setRemovendo] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ videos: VideoDoLightbox[]; inicio: number } | null>(null)
  const ocupado = salvando !== null || enviando !== null || removendo !== null
  const paraLightbox = (lista: VideoParaMostrar[]): VideoDoLightbox[] => lista.map((v, i) => ({
    url: v.url, nome: nomeDoVideo(v, i + 1), thumbnailUrl: v.thumbnailUrl,
    download: provedorDoVideo(v.url) === "nuflow" ? paraDownload(v.originalUrl ?? v.url) : null,
  }))

  const fechar = (qual: TrocaNoAgora) => {
    setAbertos((a) => ({ ...a, [qual]: false }))
    setLinks((l) => ({ ...l, [qual]: "" }))
    if (qual === "video") setTrocando(null)
  }

  // Trocou um vídeo: o novo já está registrado; sai o registro do trocado (o
  // arquivo continua guardado). O link antigo sem registro sai sozinho, porque
  // o linkFinal passou a ser o novo.
  async function tirarOTrocado() {
    if (trocando?.id && onRemoverVideo) await onRemoverVideo(trocando.id)
  }

  async function removerVideo(v: VideoParaMostrar) {
    if (!onRemoverVideo) return
    if (!confirm(`Tirar "${nomeDoVideo(v)}" do card? O arquivo continua guardado.`)) return
    setRemovendo(v.id ?? v.url)
    try {
      await onRemoverVideo(v.id ?? null)
      toast.success("Vídeo tirado do card.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível tirar o vídeo.")
    } finally {
      setRemovendo(null)
    }
  }

  // O link ou o arquivo que completa o material anda a gravação junto, como
  // na entrega pelo link do convite. Fora do material, só grava.
  async function gravar(qual: TrocaNoAgora, patch: { linkBrutos?: string; linkFinal?: string }, jaGravado: Partial<typeof patch> = {}) {
    const status = statusAoGravarMaterial(job, patch)
    const resto = Object.fromEntries(Object.entries(patch).filter(([k]) => !(k in jaGravado)))
    const temResto = Object.keys(resto).length > 0
    if (status) await onAvancar(status, temResto ? resto : undefined)
    else if (temResto) await onSalvar(resto)
    return !!status
  }

  async function salvarLink(qual: TrocaNoAgora) {
    const valor = links[qual].trim()
    if (!linkValido(valor)) return void toast.error("Cole um link que comece com https://")
    setSalvando(qual)
    try {
      let andou: boolean
      if (qual === "video" && onRegistrarVideo) {
        // O link do vídeo vira um registro do card, como o arquivo subido: dá
        // para ter mais de um, e cada um tem miniatura.
        await onRegistrarVideo(valor)
        andou = await gravar(qual, { linkFinal: valor }, { linkFinal: valor })
        await tirarOTrocado()
      } else {
        andou = await gravar(qual, qual === "brutos" ? patchDosBrutos(job, valor) : { linkFinal: valor })
      }
      if (!andou) toast.success(qual === "brutos" ? "Link dos brutos salvo." : "Link do vídeo salvo.")
      fechar(qual)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o link.")
    } finally {
      setSalvando(null)
    }
  }

  async function enviarArquivo(qual: TrocaNoAgora, file: File) {
    if (!onEnviarArquivo) return
    setEnviando({ qual, nome: file.name, pct: 0 })
    try {
      const url = await onEnviarArquivo(qual === "brutos" ? "brutos" : "final", file, (pct) => setEnviando({ qual, nome: file.name, pct }))
      // O registro do envio já gravou o link do arquivo; sem edição, o vídeo final segue os brutos.
      const patch = qual === "brutos" ? patchDosBrutos(job, url) : { linkFinal: url }
      const andou = await gravar(qual, patch, qual === "brutos" ? { linkBrutos: url } : { linkFinal: url })
      if (qual === "video") await tirarOTrocado()
      if (!andou) toast.success(qual === "brutos" ? "Brutos enviados." : "Vídeo final enviado.")
      fechar(qual)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar o arquivo.")
    } finally {
      setEnviando(null)
      const input = arquivoRef.current[qual]
      if (input) input.value = ""
    }
  }

  // ── A nota fiscal do videomaker ────────────────────────────────────────────
  const nota = job.videomaker ? situacaoDaNota(job) : null
  const tokenNota = job.notasFiscais?.find((n) => n.token && n.status === "pendente")?.token ?? job.notasFiscais?.find((n) => n.token)?.token
  const linkDaNota = tokenNota ? `${typeof window === "undefined" ? "" : window.location.origin}/nf-upload/${tokenNota}` : null
  const arquivoDaNota = job.custos?.find((c) => c.notaFiscalUrl)?.notaFiscalUrl ?? job.notasFiscais?.find((n) => n.url)?.url ?? null

  async function agirNaNota(acao: "enviar_compras" | "marcar_enviada" | "marcar_paga") {
    setAgindo(acao)
    try {
      const res = await fetch(`/api/jobs/${job.id}/nota`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      })
      const json = await res.json().catch(() => ({})) as { mensagem?: string; error?: string }
      if (!res.ok) {
        // O e-mail não saiu: o plano B fica na tela, não só no toast.
        if (acao === "enviar_compras") setPlano(json.error ?? "O e-mail para compras não saiu.")
        toast.error(json.error ?? "Não foi possível concluir.")
        return
      }
      setPlano(null)
      toast.success(json.mensagem ?? "Feito.")
      await onAtualizar()
    } catch {
      toast.error("Sem conexão. Tente de novo.")
    } finally {
      setAgindo(null)
    }
  }

  async function enviarKit() {
    setAgindo("kit")
    try {
      const r = await fetch(`/api/jobs/${job.id}/kit`, { method: "POST" })
      const json = await r.json().catch(() => ({})) as { mensagem?: string; error?: string }
      if (!r.ok) toast.error(json.error ?? "Não foi possível enviar.")
      else toast.success(json.mensagem ?? "Enviado.")
    } catch {
      toast.error("Sem conexão. Tente de novo.")
    } finally {
      setAgindo(null)
    }
  }

  const botaoNota = (acao: "enviar_compras" | "marcar_enviada" | "marcar_paga", rotulo: string, principal: boolean) => (
    <button type="button" className={principal ? surface.btnPrimary : surface.btn} onClick={() => void agirNaNota(acao)} disabled={agindo !== null}>
      {agindo === acao ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : null}
      {rotulo}
    </button>
  )
  const baixarNota = arquivoDaNota && (
    <a className={surface.btn} href={arquivoDaNota} target="_blank" rel="noopener noreferrer"><Download className="w-3.5 h-3.5" aria-hidden />Baixar nota</a>
  )

  // ── As linhas ──────────────────────────────────────────────────────────────
  const oQueChegou = (item: ItemDosArquivos) => {
    const m = item.midia!
    const nome = m.nomeArquivo ?? (m.noNuflow ? "Arquivo enviado" : hostDe(m.url))
    const detalhe = m.antigo ? `pasta antiga · ${hostDe(m.url)}` : m.noNuflow ? "subido no NuFlow" : m.nomeArquivo ? hostDe(m.url) : "link"
    return (
      <div className={cn(surface.fileRow, "w-full")}>
        <span className={surface.fileBadge}>{m.toca ? <Film className="w-4 h-4" aria-hidden /> : <FolderOpen className="w-4 h-4" aria-hidden />}</span>
        <span className={surface.fileName}>
          <span title={m.url}>{nome}</span>
          <span>{detalhe}</span>
        </span>
        <span className={surface.fileActions}>
          {m.toca && (
            <button type="button" onClick={() => setLightbox({ videos: paraLightbox([{ id: null, url: m.url, originalUrl: m.originalUrl, nomeArquivo: m.nomeArquivo }]), inicio: 0 })} title="Tocar" aria-label={`Tocar ${item.rotulo}`} className={surface.iconBtn}><Play aria-hidden /></button>
          )}
          {m.noNuflow && (
            <a href={paraDownload(m.originalUrl ?? m.url) ?? m.url} target="_blank" rel="noopener noreferrer"
              title={m.originalUrl ? "Baixar original" : "Baixar"} aria-label={`Baixar ${item.rotulo}`} className={surface.iconBtn}><Download aria-hidden /></a>
          )}
          <a href={m.url} target="_blank" rel="noopener noreferrer" title="Abrir" aria-label={`Abrir ${item.rotulo}`} className={surface.iconBtn}><ExternalLink aria-hidden /></a>
        </span>
      </div>
    )
  }

  // "Enviar arquivo" | "Colar link": as abas da janela de envio de Demandas.
  const campoDeEnvio = (item: ItemDosArquivos) => {
    const qual = item.qual
    const porta = onEnviarArquivo ? portas[qual] : "link"
    const enviandoAqui = enviando?.qual === qual ? enviando : null
    const podeCancelar = !!item.midia || !item.agora
    return (
      <div className={styles.anexar}>
        {onEnviarArquivo && (
          <div className={surface.segmented} style={{ margin: 0 }}>
            <button type="button" aria-pressed={porta === "arquivo"} disabled={ocupado} onClick={() => setPortas((p) => ({ ...p, [qual]: "arquivo" }))}>Enviar arquivo</button>
            <button type="button" aria-pressed={porta === "link"} disabled={ocupado} onClick={() => setPortas((p) => ({ ...p, [qual]: "link" }))}>Colar link</button>
          </div>
        )}
        {porta === "arquivo" ? (
          <>
            <input
              ref={(el) => { arquivoRef.current[qual] = el }}
              type="file"
              accept="video/*"
              className="hidden"
              aria-label={`Arquivo: ${item.rotulo}`}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void enviarArquivo(qual, f) }}
            />
            {enviandoAqui ? (
              <div className={surface.fileRow} role="status" aria-live="polite">
                <span className={surface.fileBadge}><Loader2 className="w-4 h-4 animate-spin" aria-hidden /></span>
                <span className={surface.fileName}>
                  <span>{enviandoAqui.nome}</span>
                  <span>Enviando… {enviandoAqui.pct}%</span>
                </span>
              </div>
            ) : (
              <button type="button" className={surface.dropzone} onClick={() => arquivoRef.current[qual]?.click()} disabled={ocupado}>
                <Upload className="w-5 h-5" aria-hidden />
                <span>Escolher arquivo</span>
                <span className={surface.hint}>mp4, mov, avi, webm · até {LIMITE_VIDEO_NA_TELA_MB} MB</span>
              </button>
            )}
          </>
        ) : (
          <div className="flex w-full flex-wrap gap-2">
            <input
              className={cn(surface.input, "flex-1 min-w-0")}
              type="url"
              inputMode="url"
              aria-label={qual === "brutos" ? "Link dos brutos (drive)" : "Link do vídeo final"}
              placeholder={qual === "brutos" ? "Link dos brutos (drive)" : "Link do vídeo final"}
              value={links[qual]}
              onChange={(e) => setLinks((l) => ({ ...l, [qual]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void salvarLink(qual) } }}
            />
            <button type="button" className={surface.btnPrimary} onClick={() => void salvarLink(qual)} disabled={ocupado || !links[qual].trim()}>
              {salvando === qual ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : null}Salvar
            </button>
          </div>
        )}
        {podeCancelar && !enviandoAqui && (
          <button type="button" className={surface.linkBtn} onClick={() => fechar(qual)} disabled={ocupado}>Cancelar</button>
        )}
      </div>
    )
  }

  // A linha do vídeo final: uma miniatura por vídeo (Giovani, 05/11/2026), o
  // play abre o lightbox; embaixo de cada uma, baixar, trocar e tirar.
  const linhaDosVideos = (item: ItemDosArquivos) => {
    const mandar = podeEditar && item.podeMandar
    const campoAberto = mandar && abertos.video
    const situacao = videos.length > 1 ? `${videos.length} vídeos` : item.situacao
    return (
      <li key="video" className={styles.itemArquivo} data-estado={item.estado}>
        <div className={styles.itemTopo}>
          <span className={styles.entregaRotulo}>{ICONE_DO_ESTADO[item.estado]}{videos.length > 1 ? (item.rotulo === "Vídeo pronto" ? "Vídeos prontos" : "Vídeos finais") : item.rotulo}</span>
          <span className={surface.hint}>{situacao}</span>
        </div>
        <MiniaturasDeVideo
          videos={videos}
          onAbrir={(i) => setLightbox({ videos: paraLightbox(videos), inicio: i })}
          acoes={(v) => (
            <>
              {provedorDoVideo(v.url) === "nuflow" && (
                <a className={surface.linkBtn} href={paraDownload(v.originalUrl ?? v.url) ?? v.url} target="_blank" rel="noopener noreferrer">Baixar</a>
              )}
              {mandar && (
                <button type="button" className={surface.linkBtn} disabled={ocupado}
                  onClick={() => { setTrocando(v); setAbertos((a) => ({ ...a, video: true })) }}>Trocar</button>
              )}
              {mandar && onRemoverVideo && (
                <button type="button" className={surface.linkBtn} data-perigo disabled={ocupado} onClick={() => void removerVideo(v)}>
                  {removendo === (v.id ?? v.url) ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : null}Tirar
                </button>
              )}
            </>
          )}
        />
        {campoAberto ? (
          <>
            <span className={surface.hint}>{trocando ? `Trocar “${nomeDoVideo(trocando)}”: o novo entra no lugar dele.` : "Outro vídeo: os que já estão continuam."}</span>
            {campoDeEnvio({ ...item, midia: item.midia, agora: false })}
          </>
        ) : mandar && (
          <button type="button" className={surface.linkBtn} disabled={ocupado} onClick={() => { setTrocando(null); setAbertos((a) => ({ ...a, video: true })) }}>
            <Plus className="w-3.5 h-3.5" aria-hidden />Adicionar outro vídeo
          </button>
        )}
      </li>
    )
  }

  const linha = (item: ItemDosArquivos) => {
    if (item.qual === "video" && !item.midia?.antigo && videos.length > 0) return linhaDosVideos(item)
    const mandar = podeEditar && item.podeMandar
    const campoAberto = mandar && (abertos[item.qual] || (item.agora && !item.midia))
    return (
      <li key={`${item.qual}-${item.rotulo}`} className={styles.itemArquivo} data-estado={item.estado}>
        <div className={styles.itemTopo}>
          <span className={styles.entregaRotulo}>{ICONE_DO_ESTADO[item.estado]}{item.rotulo}</span>
          <span className="flex items-center gap-3">
            <span className={surface.hint}>{item.situacao}</span>
            {mandar && !campoAberto && (
              <button type="button" className={surface.linkBtn} onClick={() => setAbertos((a) => ({ ...a, [item.qual]: true }))} disabled={ocupado}>
                {item.midia ? "Trocar" : "Adicionar"}
              </button>
            )}
          </span>
        </div>
        {item.midia && oQueChegou(item)}
        {campoAberto && campoDeEnvio(item)}
      </li>
    )
  }

  const cancelada = foiCancelada(job)
  const refs = (referencias ?? "").split("\n").map((r) => r.trim()).filter(Boolean)

  return (
    <section className={styles.entregas} aria-label="Arquivos">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={styles.rotulo}>Arquivos</span>
        {/* O guia, as referências e a colinha do kit, no WhatsApp dele. */}
        {podeEditar && job.videomaker && !cancelada && (
          <button type="button" className={surface.linkBtn} onClick={() => void enviarKit()} disabled={agindo !== null}>
            {agindo === "kit" ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Send className="w-3.5 h-3.5" aria-hidden />}
            Enviar instruções e referências
          </button>
        )}
      </div>

      <ul className={styles.listaEntregas}>
        {itens.map(linha)}
        {job.videomaker && (
          <li className={styles.itemArquivo} data-estado={nota?.etapa === "paga" || nota?.etapa === "compras" || nota?.etapa === "recebida" ? "feito" : nota ? "falta" : "depois"}>
            <div className={styles.itemTopo}>
              <span className={styles.entregaRotulo}>{nota && nota.etapa !== "falta" && nota.etapa !== "contestada" ? <CheckCircle2 aria-hidden /> : <Circle aria-hidden />}Nota fiscal</span>
              <span className={nota ? TAG_DA_NOTA[nota.tom] : surface.hint}>{nota ? nota.texto : "depois do material"}</span>
            </div>
            {(nota?.etapa === "falta" || nota?.etapa === "contestada") && linkDaNota && (
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className={surface.linkBtn} onClick={() => copiar(linkDaNota, "Link da nota copiado — mande para o videomaker")}>Copiar link da nota <Copy className="w-3.5 h-3.5" aria-hidden /></button>
                <a className={surface.linkBtn} href={linkDaNota} target="_blank" rel="noopener noreferrer">Anexar a nota por ele <ExternalLink className="w-3.5 h-3.5" aria-hidden /></a>
              </div>
            )}
            {nota?.etapa === "recebida" && (
              <>
                <div className="flex flex-wrap gap-2">
                  {botaoNota("enviar_compras", "Enviar nota para compras", true)}
                  {baixarNota}
                </div>
                <span className={surface.hint}>O e-mail vai com a nota e com cópia para você.</span>
                {plano && (
                  <div className={surface.notice} role="alert">
                    <p>{plano}</p>
                    <div className="flex flex-wrap gap-2">
                      {baixarNota}
                      {botaoNota("marcar_enviada", "Já mandei por fora", false)}
                    </div>
                  </div>
                )}
              </>
            )}
            {nota?.etapa === "compras" && (
              <div className="flex flex-wrap gap-2">
                {botaoNota("marcar_paga", "Marcar nota como paga", true)}
                {baixarNota}
              </div>
            )}
          </li>
        )}
      </ul>

      {documentos && <div className={styles.documentos}>{documentos}</div>}

      {lightbox && <LightboxDeVideo videos={lightbox.videos} inicio={lightbox.inicio} onFechar={() => setLightbox(null)} />}

      {refs.length > 0 && (
        <div className={styles.documentos}>
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
    </section>
  )
}

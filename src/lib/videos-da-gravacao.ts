// Os vídeos de um card e como mostrá-los: miniatura e lightbox.
//
// Giovani, 05/11/2026: "crie uma thumbnail para a pessoa saber que tem um vídeo
// ali anexado ... se tiver mais de um vídeo, coloca mais de uma thumbnail ... e
// coloca um íconezinho de play ... abrir ali ampliado no sistema".
//
// Um card de gravação pode ter mais de um vídeo final. Cada um é um Arquivo
// "final" (subido no NuFlow ou link colado, que também vira Arquivo). O
// "Trocar" apaga o registro do vídeo trocado (o arquivo continua guardado), então
// os Arquivos "final" do card são os vídeos que valem. O linkFinal aponta para o
// último. Link colado antes disso, que não virou Arquivo, vale sozinho: era o
// que substituía tudo (a regra do 07f6783).
//
// Sem import de runtime: este módulo vai para o navegador.

export type ProvedorDoVideo = "nuflow" | "drive" | "youtube" | "vimeo" | "arquivo" | "link"

export type VideoParaMostrar = {
  /** O Arquivo do card; null (ou ausente) para o link colado que não virou Arquivo. */
  id?: string | null
  url: string
  /** O original enviado, quando houve conversão: é o que se baixa. */
  originalUrl?: string | null
  nomeArquivo?: string | null
  thumbnailUrl?: string | null
}

const IMAGEM = /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i
const VIDEO_DIRETO = /\.(mp4|m4v|mov|webm|ogv)(\?|#|$)/i

function host(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, "").toLowerCase()
  } catch {
    return null
  }
}

/** O id do arquivo no Drive: /file/d/<id>/..., /open?id=<id> ou /uc?id=<id>. */
export function idDoDrive(url: string): string | null {
  const h = host(url)
  if (!h || !/(^|\.)drive\.google\.com$|(^|\.)docs\.google\.com$/.test(h)) return null
  const porCaminho = url.match(/\/(?:file\/)?d\/([a-zA-Z0-9_-]{10,})/)
  if (porCaminho) return porCaminho[1]
  try {
    return new URL(url).searchParams.get("id")
  } catch {
    return null
  }
}

export function idDoYoutube(url: string): string | null {
  const h = host(url)
  if (!h) return null
  try {
    const u = new URL(url)
    if (h === "youtu.be") return u.pathname.slice(1).split("/")[0] || null
    if (!/(^|\.)youtube\.com$/.test(h)) return null
    if (u.pathname === "/watch") return u.searchParams.get("v")
    const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([a-zA-Z0-9_-]+)/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

export function idDoVimeo(url: string): string | null {
  const h = host(url)
  if (!h || !/(^|\.)vimeo\.com$/.test(h)) return null
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  return m ? m[1] : null
}

export function provedorDoVideo(url: string): ProvedorDoVideo {
  const u = url.trim()
  if (u.startsWith("/api/midia/") || /supabase\.(co|in)\//.test(u)) return "nuflow"
  if (idDoDrive(u) || /drive\.google\.com/.test(u)) return "drive"
  if (idDoYoutube(u)) return "youtube"
  if (idDoVimeo(u)) return "vimeo"
  if (VIDEO_DIRETO.test(u)) return "arquivo"
  return "link"
}

/** O nome que a miniatura mostra. Link do Drive não vira "view" (o fim da URL). */
export function nomeDoVideo(v: Pick<VideoParaMostrar, "url" | "nomeArquivo">, posicao = 1): string {
  const p = provedorDoVideo(v.url)
  if (p === "drive") return "Vídeo no Drive"
  if (p === "youtube") return "Vídeo no YouTube"
  if (p === "vimeo") return "Vídeo no Vimeo"
  const nome = v.nomeArquivo?.trim()
  if ((p === "nuflow" || p === "arquivo") && nome) return nome
  if (p === "link") return host(v.url) ?? "Link do vídeo"
  return `Vídeo ${posicao}`
}

export type ComoTocar =
  | { tipo: "video"; src: string }
  | { tipo: "imagem"; src: string }
  | { tipo: "iframe"; src: string }
  | { tipo: "fora"; src: string }

/** Como o lightbox mostra o vídeo: no player, embutido (Drive, YouTube, Vimeo) ou "abrir em nova aba". */
export function comoTocar(url: string): ComoTocar {
  const u = url.trim()
  if (IMAGEM.test(u)) return { tipo: "imagem", src: u }
  const p = provedorDoVideo(u)
  if (p === "nuflow" || p === "arquivo") return { tipo: "video", src: u }
  const drive = idDoDrive(u)
  if (drive) return { tipo: "iframe", src: `https://drive.google.com/file/d/${drive}/preview` }
  const yt = idDoYoutube(u)
  if (yt) return { tipo: "iframe", src: `https://www.youtube.com/embed/${yt}` }
  const vimeo = idDoVimeo(u)
  if (vimeo) return { tipo: "iframe", src: `https://player.vimeo.com/video/${vimeo}` }
  return { tipo: "fora", src: u }
}

export type CapaDoVideo =
  | { tipo: "imagem"; src: string }
  /** O primeiro quadro do próprio vídeo (<video preload="metadata">). */
  | { tipo: "quadro"; src: string }
  | { tipo: "drive" }
  | { tipo: "neutra" }

/** De onde vem a miniatura: a capa gerada no envio, a do YouTube, o primeiro quadro, ou um quadro neutro. */
export function capaDoVideo(v: Pick<VideoParaMostrar, "url" | "thumbnailUrl">): CapaDoVideo {
  if (v.thumbnailUrl?.trim()) return { tipo: "imagem", src: v.thumbnailUrl.trim() }
  const p = provedorDoVideo(v.url)
  if (p === "drive") return { tipo: "drive" }
  const yt = idDoYoutube(v.url)
  if (yt) return { tipo: "imagem", src: `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` }
  if (p === "nuflow" || p === "arquivo") return { tipo: "quadro", src: `${v.url.split("#")[0]}#t=0.1` }
  return { tipo: "neutra" }
}

/**
 * Os vídeos do card de gravação: os Arquivos "final", na ordem em que
 * chegaram. Link colado antes que não virou Arquivo vale sozinho (era o que
 * substituía tudo); sem linkFinal, valem os Arquivos.
 */
export function videosDaGravacao<A extends VideoParaMostrar>(linkFinal: string | null | undefined, finais: A[]): (A | VideoParaMostrar)[] {
  const link = linkFinal?.trim()
  if (!link) return finais
  if (finais.some((a) => a.url === link || a.originalUrl === link)) return finais
  return [{ id: null, url: link, nomeArquivo: null, thumbnailUrl: null }]
}

/**
 * "Adicionar outro vídeo" com o link colado antes, que não virou Arquivo: ele
 * vira registro primeiro. Sem isso, o vídeo novo passava a ser o linkFinal e o
 * antigo sumia do card e da página de quem pediu (revisão do #135). No "Trocar",
 * nada: o antigo é o que sai.
 */
export function linkAntigoParaGuardar(videos: VideoParaMostrar[], trocando: VideoParaMostrar | null): string | null {
  if (trocando) return null
  return videos.find((v) => !v.id)?.url ?? null
}

/**
 * Depois do "Trocar", sai o registro do trocado, menos quando o novo é o mesmo
 * vídeo: o envio não duplica o registro (lib/arquivo-registro devolve o que já
 * existe), e apagar o trocado apagaria o próprio vídeo (revisão do #135).
 */
export function trocadoSai(trocando: VideoParaMostrar | null, novo: string): trocando is VideoParaMostrar & { id: string } {
  if (!trocando?.id) return false
  const n = novo.trim()
  return trocando.url !== n && trocando.originalUrl !== n
}

"use client"

// A aprovação de uma entrega — vídeo ou arte — numa peça só.
//
// Mora em dois lugares: no link do cliente (/aprovar/[token]) e dentro do
// detalhe da demanda, na aba Aprovação. Antes o sistema mostrava só o link: quem
// pediu tinha de sair do NuFlow para ver o vídeo, e não havia onde aprovar nem
// dizer o que estava errado. Agora é a mesma tela nos dois lados; o que muda é
// por onde a resposta entra (o token do link, ou a sessão de quem está logado)
// e quem pode decidir (lib/quem-aprova.ts → podeAprovarEntrega).
import { useCallback, useEffect, useRef, useState } from "react"
import {
  Film, Play, CheckCircle2, MessageSquare, ThumbsUp, Send, AlertCircle, Clock,
  Loader2, Copy, Check, Package, Layers, Eye,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { ArteViewer } from "./ArteViewer"
import { TextoComMomentos, irPara, timecode } from "./Momentos"
import { extrairCopy } from "@/lib/copy-criativo"
import { rotuloDoTipo } from "@/lib/tipos-demanda"

interface ArquivoArte { id: string; url: string; nomeArquivo: string; sequencia: number | null }
export interface AprovacaoData {
  id: string
  status: string
  urlVideo: string
  nomeVideo: string | null
  createdAt: string
  expiresAt: string | null
  aprovadoPor: string | null
  comentario: string | null
  demanda: {
    codigo: string
    titulo: string
    tipoVideo: string
    departamento?: string | null
    area?: string | null
    descricao?: string | null
    detalhesEntrega?: Record<string, unknown> | null
    arquivos?: ArquivoArte[]
    linhaProjetoRef?: { nome: string } | null
    produtos?: { produto: { nome: string } }[]
  }
}

interface VersaoAnterior {
  urlVideo: string
  nomeVideo: string | null
  comentario: string | null
  status: string
  createdAt: string
}

type Dados = { aprovacao: AprovacaoData; versaoAnterior: VersaoAnterior | null; urlDownload: string | null; expirado: boolean }

/** Lê a aprovação pelo token — a mesma rota para o cliente e para a equipe. */
export function useAprovacao(token: string | null | undefined) {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    if (!token) return
    let vivo = true
    ;(async () => {
      try {
        const res = await fetch(`/api/aprovacao-video/${token}`)
        const json = await res.json().catch(() => ({}))
        if (!vivo) return
        if (!res.ok) { setErro(json.error ?? "Link inválido"); return }
        setErro(null)
        setDados({
          aprovacao: json.aprovacao,
          versaoAnterior: json.versaoAnterior ?? null,
          urlDownload: json.urlDownload ?? null,
          expirado: !!json.expirado,
        })
      } catch {
        if (vivo) setErro("Erro ao carregar a aprovação")
      } finally {
        if (vivo) setCarregando(false)
      }
    })()
    return () => { vivo = false }
  }, [token, versao])

  const recarregar = useCallback(() => setVersao((v) => v + 1), [])
  return { dados, erro, carregando, recarregar }
}

/**
 * Player com capa de "toque para assistir".
 *
 * Um <video> parado mostra o primeiro frame — e roteiro de reels costuma abrir
 * em tela escura. O resultado é um retângulo preto que parece player quebrado:
 * o cliente não sabe se o vídeo não carregou, se a internet dele falhou, ou se
 * não há nada ali. Aconteceu em produção e chegou como "a tela de aprovação não
 * mostra o vídeo" — o vídeo estava lá, carregado e íntegro.
 *
 * A capa some no primeiro play e não volta.
 */
function PlayerVideo({ url, refVideo }: { url: string; refVideo?: React.RefObject<HTMLVideoElement | null> }) {
  const [tocando, setTocando] = useState(false)
  const interno = useRef<HTMLVideoElement | null>(null)
  const el = refVideo ?? interno

  return (
    <div className="relative">
      <video
        ref={el}
        className="w-full rounded-xl max-h-[70vh] bg-black"
        controls
        playsInline
        preload="metadata"
        src={url}
        onPlay={() => setTocando(true)}
      >
        Seu navegador não suporta o player de vídeo.
      </video>

      {!tocando && (
        <button
          type="button"
          onClick={() => el.current?.play()}
          aria-label="Assistir ao vídeo"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-black/45 backdrop-blur-[1px] transition-colors hover:bg-black/35"
        >
          <span className="w-16 h-16 rounded-full bg-white/95 flex items-center justify-center shadow-lg">
            <Play className="w-7 h-7 text-zinc-900 ml-1" fill="currentColor" />
          </span>
          <span className="text-sm font-medium text-white">Toque para assistir</span>
        </button>
      )}
    </div>
  )
}

/**
 * O que aparece no lugar do player quando não há o que tocar.
 *
 * Antes, link de pasta do Drive e arquivo que não é vídeo caíam no <video> e
 * rendiam um retângulo preto sem explicação — o cliente ficava sem saber se o
 * vídeo não carregou, se o navegador travou, ou se era ele que estava fazendo
 * algo errado. Dizer o que aconteceu e oferecer a saída custa o mesmo espaço.
 */
function ForaDoPlayer({ url, titulo, detalhe, rotuloBotao }: {
  url: string
  titulo: string
  detalhe: string
  rotuloBotao: string
}) {
  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-6 text-center space-y-3">
      <p className="text-sm font-semibold text-zinc-100">{titulo}</p>
      <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">{detalhe}</p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center justify-center gap-2 border border-zinc-600 text-zinc-100 hover:bg-zinc-800 font-medium px-5 py-2.5 rounded-xl transition-colors text-sm"
      >
        {rotuloBotao}
      </a>
    </div>
  )
}

// `refVideo` vai só no vídeo em avaliação — é ele que "Marcar este momento" lê
// quando os dois cortes estão lado a lado na comparação. O player toca a prévia;
// o botão de baixar entrega o original (`download`), que só existe para ele.
function Midia({ url, refVideo, download }: { url: string; refVideo?: React.RefObject<HTMLVideoElement | null>; download?: string | null }) {
  const isYoutube = url.includes("youtube.com") || url.includes("youtu.be")
  const isVimeo = url.includes("vimeo.com")
  const isDrive = url.includes("drive.google.com")
  const urlLimpa = url.split("?")[0].toLowerCase()

  if (/\.(jpg|jpeg|png|webp|gif|svg)$/.test(urlLimpa)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="Arte para aprovação" className="w-full rounded-xl max-h-[75vh] object-contain bg-zinc-950" />
  }
  if (urlLimpa.endsWith(".pdf")) return <iframe className="w-full rounded-xl h-[75vh] bg-zinc-950" src={url} />

  if (isYoutube) {
    const videoId = url.match(/(?:v=|youtu\.be\/|embed\/)([^&?/]+)/)?.[1]
    if (videoId) {
      return (
        <iframe
          className="w-full aspect-video rounded-xl"
          src={`https://www.youtube.com/embed/${videoId}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      )
    }
  }
  if (isVimeo) {
    const videoId = url.match(/vimeo\.com\/(\d+)/)?.[1]
    if (videoId) {
      return (
        <iframe
          className="w-full aspect-video rounded-xl"
          src={`https://player.vimeo.com/video/${videoId}?h=auto&color=ffffff`}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
        />
      )
    }
  }
  if (isDrive) {
    const fileId = url.match(/\/d\/([^/]+)/)?.[1]
    if (fileId) {
      return <iframe className="w-full aspect-video rounded-xl" src={`https://drive.google.com/file/d/${fileId}/preview`} allow="autoplay" />
    }
    // Link de PASTA do Drive (/drive/folders/...). Não tem o que tocar: é uma
    // lista de arquivos. Antes caía no <video> abaixo com uma URL que devolve
    // HTML — o cliente via um retângulo preto e nenhuma explicação.
    return (
      <ForaDoPlayer
        url={url}
        titulo="Este é um link de pasta, não de um vídeo"
        detalhe="Abra a pasta para ver os arquivos. Se você esperava um vídeo aqui, avise a equipe — o link enviado aponta para uma pasta inteira."
        rotuloBotao="Abrir pasta no Drive"
      />
    )
  }

  // Só tocamos no <video> o que o navegador consegue tocar. Qualquer outra
  // coisa que tenha sido anexada como "vídeo final" — PDF, planilha, um link
  // qualquer — vira aviso em vez de player quebrado.
  if (!/\.(mp4|webm|ogg|mov|qt|m4v)$/.test(urlLimpa)) {
    return (
      <ForaDoPlayer
        url={url}
        titulo="Não consegui exibir este arquivo aqui"
        detalhe="O que foi anexado não é um vídeo que o navegador saiba abrir. Você ainda pode abri-lo pelo botão abaixo."
        rotuloBotao="Abrir arquivo"
      />
    )
  }

  const isMov = urlLimpa.endsWith(".mov") || urlLimpa.endsWith(".qt")
  return (
    <div className="space-y-3">
      <PlayerVideo url={url} refVideo={refVideo} />
      {isMov && (
        <p className="text-xs text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          Este vídeo está em formato <b>.mov</b> (Apple). Em alguns navegadores (ex: Chrome) a imagem pode aparecer preta.
          Use o botão abaixo para abrir ou baixar e assistir no seu dispositivo.
        </p>
      )}
      <a
        href={download ?? url}
        target="_blank"
        rel="noreferrer"
        download
        className="flex items-center justify-center gap-2 w-full border border-zinc-700 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800/60 font-medium py-3 rounded-xl transition-colors text-sm"
      >
        <Film className="w-4 h-4" />
        {!download ? "Abrir / baixar vídeo" : download.split("?")[0] !== url.split("?")[0] ? "Baixar vídeo original" : "Baixar vídeo"}
      </a>
    </div>
  )
}

type PropsAprovacao = {
  token: string
  /** "cliente": o link público. "equipe": dentro do detalhe, logado. */
  modo: "cliente" | "equipe"
  /** Equipe: a resposta entra por /api/demandas/[id]/responder-entrega. */
  demandaId?: string
  /** Equipe: a régua de quem aprova, já resolvida pelo servidor. */
  podeDecidir?: boolean
  /** Equipe: o que mostrar a quem vê mas não decide (quem fez a peça). */
  porQueNaoDecide?: string
  /** Para quem está fora do componente (o aviso do topo) levar o player a um momento. */
  refVideo?: React.RefObject<HTMLVideoElement | null>
  onRespondido?: () => void
}

/** Lê a aprovação pelo token e desenha. */
export function AprovacaoEntrega(props: PropsAprovacao) {
  const estado = useAprovacao(props.token)
  return <CorpoAprovacao {...props} estado={estado} />
}

/** O mesmo, para quem já leu a aprovação (o link do cliente usa o título no cabeçalho). */
export function CorpoAprovacao({ token, modo, demandaId, podeDecidir = true, porQueNaoDecide, refVideo, onRespondido, estado }: PropsAprovacao & {
  estado: ReturnType<typeof useAprovacao>
}) {
  const { dados, erro, carregando, recarregar } = estado
  const interno = useRef<HTMLVideoElement | null>(null)
  const videoRef = refVideo ?? interno

  const [enviando, setEnviando] = useState(false)
  const [nome, setNome] = useState("")
  const [comentario, setComentario] = useState("")
  const [pedindoAjuste, setPedindoAjuste] = useState(false)
  const [copiado, setCopiado] = useState(false)
  // Corte anterior do mesmo vídeo, quando existe. "O que mudou?" é a pergunta
  // que quem aprova faz toda vez, e sem isso a resposta dependia da memória.
  const [comparando, setComparando] = useState(false)
  const [renovando, setRenovando] = useState(false)
  const campoId = `campo-ajuste-${token}`

  if (carregando) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-zinc-500 animate-spin" /></div>
  }
  if (erro || !dados) {
    return (
      <div className="text-center py-12 px-6">
        <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-white mb-1">Link inválido</h2>
        <p className="text-zinc-400 text-sm">{erro}</p>
      </div>
    )
  }

  const { aprovacao, versaoAnterior, urlDownload, expirado } = dados
  const pendente = aprovacao.status === "pendente"
  const decide = pendente && (modo === "cliente" || podeDecidir)
  const ehArte = aprovacao.demanda.area === "design"
  const tipo = rotuloDoTipo(aprovacao.demanda.tipoVideo)
  const irAoMomento = ehArte ? undefined : (s: number) => irPara(videoRef.current, s)

  // Pausa no instante atual e começa uma linha do ajuste já marcada com o
  // timecode. Antes só existia a caixa de texto livre, e o ajuste chegava ao
  // editor como "arrumar lá pelo meio" — ele tinha de caçar o ponto.
  function marcarMomento() {
    const v = videoRef.current
    if (!v) return
    v.pause()
    const marca = `[${timecode(v.currentTime)}] `
    setPedindoAjuste(true)
    setComentario((atual) => (atual.trim() ? `${atual.replace(/\s*$/, "")}\n${marca}` : marca))
    // Foca a caixa para a pessoa já sair digitando o que viu naquele ponto.
    requestAnimationFrame(() => {
      const ta = document.getElementById(campoId) as HTMLTextAreaElement | null
      ta?.focus()
      ta?.setSelectionRange(ta.value.length, ta.value.length)
    })
  }

  async function responder(acao: "aprovar" | "feedback") {
    if (acao === "feedback" && !comentario.trim()) return alert("Descreva o que precisa ser ajustado.")
    setEnviando(true)
    try {
      const res = modo === "equipe"
        ? await fetch(`/api/demandas/${demandaId}/responder-entrega`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ acao, token, comentario: comentario || undefined }),
          })
        : await fetch(`/api/aprovacao-video/${token}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ acao, aprovadoPor: nome || undefined, comentario: comentario || undefined }),
          })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? "Erro ao enviar resposta")
      setPedindoAjuste(false)
      setComentario("")
      recarregar()
      onRespondido?.()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Erro ao enviar resposta")
    } finally {
      setEnviando(false)
    }
  }

  // Link vencido para o cliente. A equipe continua vendo e decidindo (a API libera
  // quem está logado na empresa) — este aviso só oferece a renovação do link público.
  async function renovarLink() {
    setRenovando(true)
    try {
      const res = await fetch(`/api/aprovacao-video/${token}`, { method: "PATCH" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error)
      recarregar()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Não foi possível renovar o link")
    } finally {
      setRenovando(false)
    }
  }

  // ── O que já foi respondido ────────────────────────────────────────────────
  const resposta = aprovacao.status === "aprovado" ? (
    <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-5 text-center">
      <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-2" />
      <h2 className="text-lg font-bold text-green-300 mb-1">{ehArte ? "Arte aprovada!" : "Vídeo aprovado!"} 🎉</h2>
      <p className="text-sm text-green-400/80">
        {aprovacao.aprovadoPor ? `${aprovacao.aprovadoPor} aprovou.` : "Aprovado."} {modo === "cliente" ? "Nossa equipe seguirá com a publicação." : "Segue para postar."}
      </p>
    </div>
  ) : aprovacao.status === "feedback_solicitado" ? (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <MessageSquare className="w-5 h-5 text-amber-300" />
        <h2 className="font-bold text-amber-200">
          {modo === "cliente" ? "Feedback enviado!" : `Ajuste pedido${aprovacao.aprovadoPor ? ` por ${aprovacao.aprovadoPor}` : " pelo cliente"}`}
        </h2>
      </div>
      {modo === "cliente" && <p className="text-sm text-amber-300/80 mb-2">Nossa equipe já recebeu suas observações e irá realizar os ajustes solicitados.</p>}
      {aprovacao.comentario && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-3 text-sm text-zinc-200 leading-relaxed">
          <TextoComMomentos texto={aprovacao.comentario} onIr={irAoMomento} />
        </div>
      )}
      {modo === "equipe" && <p className="text-xs text-zinc-500 mt-2">Esta é a versão que voltou. A nova sai em “Enviar nova versão”, no topo.</p>}
    </div>
  ) : null

  // ── A decisão ──────────────────────────────────────────────────────────────
  // Nunca por cima do vídeo: ao lado em tela larga, logo abaixo no celular. A
  // versão anterior ficava grudada no rodapé e, numa janela baixa, tapava
  // justamente a parte de baixo do player — onde costuma estar a legenda.
  const decisao = decide ? (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
      <h2 className="font-semibold text-sm text-white">
        {modo === "cliente" ? `O que você acha d${ehArte ? "a arte" : "o vídeo"}?` : `Decidir sobre ${ehArte ? "a arte" : "o vídeo"}`}
      </h2>

      {modo === "cliente" && (
        <input
          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Seu nome (opcional)"
          aria-label="Seu nome (opcional)"
        />
      )}

      {pedindoAjuste && (
        <div>
          <label htmlFor={campoId} className="text-xs font-medium text-zinc-400 block mb-1.5">O que precisa ser ajustado? *</label>
          <textarea
            id={campoId}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10 resize-none"
            rows={4}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder={ehArte
              ? "Ex: trocar a cor do título no 2º slide, ajustar a copy, corrigir o logo…"
              : "Ex: cortar a parte dos 0:30 a 0:45, ajustar a legenda na segunda cena, incluir logo no final..."}
          />
          {!ehArte && (
            <p className="text-xs text-zinc-500 mt-1.5">
              Dica: use <b>Marcar este momento</b> enquanto assiste — o instante entra no texto e o editor vai direto ao ponto.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {!pedindoAjuste ? (
          <>
            <button onClick={() => responder("aprovar")} disabled={enviando}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 text-sm">
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
              {ehArte ? "Aprovar arte" : "Aprovar vídeo"}
            </button>
            <button onClick={() => setPedindoAjuste(true)}
              className="w-full flex items-center justify-center gap-2 border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white font-medium py-3 rounded-xl transition-colors text-sm">
              <MessageSquare className="w-4 h-4" /> {modo === "cliente" ? "Solicitar ajuste" : "Pedir ajuste"}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => responder("feedback")} disabled={enviando || !comentario.trim()}
              className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50 text-sm">
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {modo === "cliente" ? "Enviar feedback" : "Enviar pedido de ajuste"}
            </button>
            <button onClick={() => { setPedindoAjuste(false); setComentario("") }}
              className="w-full border border-zinc-700 text-zinc-300 font-medium py-3 rounded-xl hover:bg-zinc-800 transition-colors text-sm">
              Cancelar
            </button>
          </>
        )}
      </div>

      <p className="text-xs text-zinc-500 text-center">
        {modo === "cliente"
          ? <>Ao clicar em &ldquo;Aprovar&rdquo;, {ehArte ? "a arte seguirá" : "o vídeo seguirá"} para publicação.</>
          : <>Aprovar leva o card para Para postar. Pedir ajuste devolve a peça para quem fez, com o seu texto.</>}
      </p>
    </div>
  ) : pendente && modo === "equipe" ? (
    <div className="flex items-start gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
      <Eye className="w-4 h-4 mt-0.5 shrink-0 text-zinc-500" />
      <p>{porQueNaoDecide ?? "Aguardando a aprovação de quem pediu."}</p>
    </div>
  ) : null

  const etiquetas = (
    <div className="flex items-center gap-2 text-xs text-zinc-400 flex-wrap">
      {tipo && <span className="px-2 py-0.5 rounded-full bg-zinc-800">{tipo}</span>}
      {aprovacao.demanda.produtos?.[0]?.produto?.nome && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300"><Package className="w-3 h-3" /> {aprovacao.demanda.produtos[0].produto.nome}</span>
      )}
      {aprovacao.demanda.linhaProjetoRef?.nome && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300"><Layers className="w-3 h-3" /> {aprovacao.demanda.linhaProjetoRef.nome}</span>
      )}
      {aprovacao.expiresAt && (
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {modo === "cliente" ? "Expira em" : "Link do cliente expira em"} {new Date(aprovacao.expiresAt).toLocaleDateString("pt-BR")}</span>
      )}
      <span className={cn("px-2 py-0.5 rounded-full font-medium",
        aprovacao.status === "aprovado" ? "bg-green-500/20 text-green-300" :
        aprovacao.status === "feedback_solicitado" ? "bg-amber-500/20 text-amber-300" :
        "bg-zinc-800 text-zinc-400")}>
        {pendente ? (modo === "cliente" ? "Aguardando sua resposta" : "Aguardando aprovação") : aprovacao.status === "aprovado" ? "Aprovado" : "Ajuste solicitado"}
      </span>
    </div>
  )

  const avisoExpirado = expirado && modo === "equipe" && (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
      <p className="text-sm text-amber-200 flex-1 min-w-[16rem]">
        O link enviado ao cliente venceu. Você continua vendo e decidindo por aqui — para o cliente abrir, renove.
      </p>
      <button onClick={renovarLink} disabled={renovando}
        className="text-sm font-medium px-3 py-1.5 rounded-md bg-amber-500/20 text-amber-100 border border-amber-500/40 hover:bg-amber-500/30 disabled:opacity-50 transition-colors">
        {renovando ? "Renovando…" : "Renovar por 30 dias"}
      </button>
    </div>
  )

  // ── Arte: carrossel + copy ────────────────────────────────────────────────
  if (ehArte) {
    const artes = (aprovacao.demanda.arquivos && aprovacao.demanda.arquivos.length > 0)
      ? aprovacao.demanda.arquivos.map((a) => a.url)
      : [aprovacao.urlVideo]
    const copyText = extrairCopy(aprovacao.demanda.detalhesEntrega, aprovacao.demanda.descricao)
    return (
      <div className="@container space-y-4">
        {avisoExpirado}
        <div className="grid gap-5 @3xl:grid-cols-[1fr_340px] items-start">
          <ArteViewer artes={artes} />
          <div className="space-y-4 @3xl:sticky @3xl:top-4">
            <div>
              <h2 className="text-lg font-bold text-white mb-1">{aprovacao.demanda.titulo}</h2>
              {etiquetas}
              {artes.length > 1 && <p className="text-xs text-zinc-500 mt-1">{artes.length} artes</p>}
            </div>
            {resposta}
            {copyText && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Copy / legenda</p>
                  <button onClick={() => { navigator.clipboard.writeText(copyText); setCopiado(true); setTimeout(() => setCopiado(false), 1500) }}
                    className="text-xs text-zinc-400 hover:text-white inline-flex items-center gap-1">
                    {copiado ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
                  </button>
                </div>
                <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap max-h-[40vh] overflow-y-auto">{copyText}</p>
              </div>
            )}
            {decisao}
          </div>
        </div>
      </div>
    )
  }

  // ── Vídeo: player + marcar momento + comparar ─────────────────────────────
  return (
    <div className="@container space-y-4">
      {avisoExpirado}
      <div className="grid gap-5 @3xl:grid-cols-[1fr_340px] items-start">
        <div className="space-y-3 min-w-0">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            {comparando && versaoAnterior ? (
              <div className="grid gap-3 @2xl:grid-cols-2 p-3">
                <div>
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2 px-1">
                    Versão anterior · {new Date(versaoAnterior.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                  <Midia url={versaoAnterior.urlVideo} />
                  {versaoAnterior.comentario && (
                    <p className="mt-2 px-1 text-xs text-zinc-400 italic">
                      {modo === "cliente" ? "Seu retorno" : "O que foi pedido"}: “{versaoAnterior.comentario}”
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wide mb-2 px-1">Versão nova · para aprovar</p>
                  <Midia url={aprovacao.urlVideo} refVideo={videoRef} download={urlDownload} />
                </div>
              </div>
            ) : (
              <Midia url={aprovacao.urlVideo} refVideo={videoRef} download={urlDownload} />
            )}
          </div>

          {/* Ferramentas de quem avalia. Aparecem só enquanto há decisão a tomar. */}
          {decide && (
            <div className="flex flex-wrap gap-2">
              <button onClick={marcarMomento}
                className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-200 hover:border-zinc-500 transition-colors">
                <Clock className="w-4 h-4" /> Marcar este momento
              </button>
              {versaoAnterior && (
                <button onClick={() => setComparando((v) => !v)}
                  className={cn("flex items-center gap-2 text-sm px-3 py-2 rounded-xl border transition-colors",
                    comparando ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200" : "bg-zinc-800 border-zinc-700 text-zinc-200 hover:border-zinc-500")}>
                  <Layers className="w-4 h-4" /> {comparando ? "Ver só a versão nova" : "Comparar com a anterior"}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4 @3xl:sticky @3xl:top-4">
          <div>
            <h2 className="text-lg font-bold text-white mb-1">{aprovacao.nomeVideo || aprovacao.demanda.titulo}</h2>
            {etiquetas}
          </div>
          {resposta}
          {decisao}
        </div>
      </div>
    </div>
  )
}


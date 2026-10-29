"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Check, CheckCircle2, X, Loader2, FileText, PlayCircle } from "lucide-react"
import { LogoNuFlow } from "@/components/marca/Marca"
import { formatarData } from "@/lib/datas"
import { momentoDoJob, rotuloDoMomento } from "@/lib/ficha-do-job"
import { levarDaGravacao, materialCompleto, rotuloDoTipoDeGravacao } from "@/lib/etapas-da-gravacao"
import SystemState from "@/components/system/SystemState"
import styles from "./Convite.module.css"

interface ConviteData {
  versao: number
  tarifaDiaria: string | null
  condicoes: string | null
  id: string
  status: string
  expiresAt: string
  videomaker: { id: string; nome: string }
  demanda: {
    codigo: string
    titulo: string
    descricao: string
    tipoVideo: string
    cidade: string
    dataEvento?: string
    localEvento?: string
    localGravacao?: string
    dataCaptacao?: string
    prioridade: string
    clienteFinalNome?: string | null
    tipoGravacao?: string | null
    temBrinde?: boolean | null
    brinde?: string | null
    levar?: string | null
    edicaoPor?: string | null
    linkBrutos?: string | null
    linkFinal?: string | null
    statusInterno: string
  }
  /** Depois do aceite, o mesmo link é a página de entrega (lib/entrega-da-gravacao.ts). */
  entrega?: { liberada: boolean; nota: { token: string; status: string } | null }
  /** O kit do videomaker: guia, referências e a colinha do dia (lib/kit-videomaker.ts). */
  kit?: KitDaPagina
}

type KitDaPagina = { materiais: { id: string; titulo: string; tipo: string; url: string | null }[]; colinha: string | null }

/** Guia, referências e colinha: para consultar antes e durante a gravação. */
function KitNaPagina({ kit }: { kit?: KitDaPagina }) {
  if (!kit || (kit.materiais.length === 0 && !kit.colinha)) return null
  return <section className={styles.kit} aria-label="Instruções e referências">
    <h2>Instruções e referências</h2>
    {kit.materiais.length > 0 && <ul className={styles.kitLista}>
      {kit.materiais.filter(m => m.url).map(m => <li key={m.id}>
        <a href={m.url!} target="_blank" rel="noopener noreferrer">
          {m.tipo === "guia" ? <FileText size={18} aria-hidden="true" /> : <PlayCircle size={18} aria-hidden="true" />}
          {m.titulo}<small>{m.tipo === "guia" ? "Guia" : "Referência"}</small>
        </a>
      </li>)}
    </ul>}
    {kit.colinha && <details className={styles.colinha}><summary>Colinha do dia da gravação</summary><p>{kit.colinha}</p></details>}
  </section>
}

type ErroState = {
  mensagem: string
  statusConvite?: "aceito" | "recusado" | "expirado"
}

export default function ConvitePage() {
  const { token } = useParams<{ token: string }>()
  const [convite, setConvite] = useState<ConviteData | null>(null)
  const [erro, setErro] = useState<ErroState | null>(null)
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [respondendo, setRespondendo] = useState(false)
  const [erroResposta, setErroResposta] = useState("")
  const [resultado, setResultado] = useState<"aceito" | "recusado" | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setErro(null); setErroResposta("")
    fetch(`/api/convites/${encodeURIComponent(token)}`, { signal: controller.signal })
      .then(async r => {
        const data = await r.json()
        if (!r.ok) {
          const statusConvite = ["aceito", "recusado", "expirado"].includes(data.status) ? data.status : undefined
          throw { mensagem: data.error || "Não foi possível carregar o convite.", statusConvite }
        }
        return data
      })
      .then(data => { if (!controller.signal.aborted) setConvite(data) })
      .catch(e => { if (!controller.signal.aborted) setErro({ mensagem: e.mensagem || "Confira sua conexão e tente novamente.", statusConvite: e.statusConvite }) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [token, retry])

  async function responder(acao: "aceitar" | "recusar") {
    if (respondendo) return
    setRespondendo(true); setErroResposta("")
    try {
      const r = await fetch(`/api/convites/${encodeURIComponent(token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao, versao: convite?.versao }),
      })
      if (!r.ok) {
        const data = await r.json()
        throw new Error(data.error || "Não foi possível registrar sua resposta.")
      }
      setResultado(acao === "aceitar" ? "aceito" : "recusado")
      // Aceito, o mesmo link vira a página de entrega: recarrega em vez de encerrar.
      if (acao === "aceitar") setRetry(r => r + 1)
    } catch (e: unknown) {
      setErroResposta(e instanceof Error ? e.message : "Confira sua conexão e tente novamente.")
    } finally { setRespondendo(false) }
  }

  if (convite?.entrega?.liberada) return <EntregaDaGravacao token={token} convite={convite} aceitouAgora={resultado === "aceito"} onAtualizar={() => setRetry(r => r + 1)} />
  if (loading) return <SystemState label="CONVITE DE PRODUÇÃO" title="Buscando seu próximo job." description="Estamos verificando os detalhes deste convite."><p role="status"><Loader2 className="animate-spin" aria-hidden="true"/>Carregando convite…</p></SystemState>
  const status = resultado || erro?.statusConvite
  if (status) {
    const textos = {
      aceito: ["Participação confirmada.", "Sua resposta está registrada. Combine os próximos passos com a equipe responsável pela produção."],
      recusado: ["Convite recusado.", "Sua resposta está registrada. A equipe poderá seguir com a organização da produção."],
      expirado: ["Este convite expirou.", "O prazo para responder terminou. Entre em contato com a equipe para solicitar um novo convite."],
    }
    return <SystemState label="CONVITE DE PRODUÇÃO" title={textos[status][0]} description={textos[status][1]}><a href="/login">Entrar no NuFlow</a></SystemState>
  }
  if (erro || !convite) return <SystemState label="CONVITE DE PRODUÇÃO" title="Convite indisponível." description={erro?.mensagem || "Confira o endereço recebido e tente novamente."}><button onClick={() => setRetry(r => r + 1)}>Tentar novamente</button><a href="/login">Entrar no NuFlow</a></SystemState>

  const d = convite.demanda
  const local = d.localEvento || d.localGravacao
  const data = d.dataEvento || d.dataCaptacao
  return <main className={styles.page}>
    <div className={styles.wrapper}>
      <a href="/" className={styles.brand} aria-label="NuFlow, início"><LogoNuFlow /></a>
      <header className={styles.header}><p className={styles.eyebrow}>CONVITE DE PRODUÇÃO · {d.codigo}</p><h1>{d.titulo}</h1><p>Olá, {convite.videomaker.nome}. Veja os detalhes e confirme sua disponibilidade para este job.</p></header>
      <section className={styles.card} aria-label="Detalhes da produção">
        <dl className={styles.details}>
          <div><dt>Formato</dt><dd>{d.tipoVideo}</dd></div>
          {d.cidade && <div><dt>Cidade</dt><dd>{d.cidade}</dd></div>}
          {local && <div><dt>Local da produção</dt><dd>{local}</dd></div>}
          {data && <div><dt>Data</dt><dd>{formatarData(data, { day: "2-digit", month: "long", year: "numeric" })}</dd></div>}
          {d.prioridade !== "normal" && <div><dt>Prioridade</dt><dd>{d.prioridade}</dd></div>}
        </dl>
        {d.descricao && <div className={styles.brief}><h2>Sobre a gravação</h2><p>{d.descricao}</p></div>}
        <KitNaPagina kit={convite.kit} />
        <div className={styles.payment}><h2>Pagamento</h2><p>{convite.tarifaDiaria ? `Diária de referência: ${Number(convite.tarifaDiaria).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.` : "Valor a confirmar com a equipe."}</p><p>{convite.condicoes || "Convite antigo sem condição registrada. Confirme valor e prazo com a equipe antes do serviço."}</p></div>
        <p className={styles.expiry}>Responda até {new Date(convite.expiresAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })} (horário de Brasília).</p>
        {erroResposta && <p role="alert" className={styles.error}>{erroResposta} Sua confirmação ainda não foi recebida nesta tela. Confira o convite antes de tentar novamente.</p>}
        <div className={styles.actions} aria-busy={respondendo}>
          <button disabled={respondendo} onClick={() => responder("aceitar")}>{respondendo ? <Loader2 className="animate-spin" size={18}/> : <Check size={18}/>}Aceitar convite</button>
          <button disabled={respondendo} onClick={() => responder("recusar")}><X size={18}/>Recusar convite</button>
        </div>
        {erroResposta && <button className={styles.refresh} disabled={respondendo} onClick={() => setRetry(r => r + 1)}>Conferir estado do convite</button>}
      </section>
      <p className={styles.footer}>Recebeu este link por engano? Confirme com a equipe que enviou o convite.</p>
    </div>
  </main>
}

// ── Depois do aceite: entregar a gravação pelo mesmo link ────────────────────
//
// Pedido do Giovani (29/10/2026): o videomaker entrega sozinho o drive dos
// brutos e, se a edição é dele, o vídeo pronto; depois, a nota. Material
// completo anda a gravação e abre a nota aqui mesmo.

const EDICAO_PARA_O_VIDEOMAKER: Record<string, string> = {
  equipe: "A edição é nossa: mande só os brutos.",
  videomaker: "A edição é sua: mande os brutos e o vídeo pronto.",
  sem_edicao: "Sem edição: mande os brutos, que vão direto para o cliente.",
}

function EntregaDaGravacao({ token, convite, aceitouAgora, onAtualizar }: {
  token: string
  convite: ConviteData
  aceitouAgora: boolean
  onAtualizar: () => void
}) {
  const d = convite.demanda
  const [brutos, setBrutos] = useState("")
  const [video, setVideo] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState("")
  const editaEle = d.edicaoPor === "videomaker"
  const momento = momentoDoJob(d)
  const levar = levarDaGravacao(d)
  const completo = materialCompleto(d)
  const nota = convite.entrega?.nota ?? null
  const faltaAlgo = !d.linkBrutos || (editaEle && !d.linkFinal)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (enviando) return
    setErro("")
    const corpo: Record<string, string> = {}
    if (!d.linkBrutos && brutos.trim()) corpo.linkBrutos = brutos.trim()
    if (editaEle && !d.linkFinal && video.trim()) corpo.linkVideo = video.trim()
    if (Object.keys(corpo).length === 0) return setErro("Cole o link antes de enviar.")
    setEnviando(true)
    try {
      const r = await fetch(`/api/convites/${encodeURIComponent(token)}/entrega`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
      })
      const json = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(json.error || "Não foi possível enviar.")
      setBrutos(""); setVideo("")
      onAtualizar()
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : "Confira sua conexão e tente novamente.")
    } finally { setEnviando(false) }
  }

  return <main className={styles.page}>
    <div className={styles.wrapper}>
      <a href="/" className={styles.brand} aria-label="NuFlow, início"><LogoNuFlow /></a>
      <header className={styles.header}>
        <p className={styles.eyebrow}>GRAVAÇÃO · {d.codigo}</p>
        <h1>{d.clienteFinalNome?.trim() || d.titulo}</h1>
        <p>Olá, {convite.videomaker.nome}. Depois da gravação, entregue tudo por aqui.</p>
      </header>
      <section className={styles.card} aria-label="Gravação">
        {aceitouAgora && <p className={styles.ok}>Participação confirmada. Este link continua valendo para entregar o material.</p>}
        <dl className={styles.details}>
          {rotuloDoTipoDeGravacao(d.tipoGravacao) && <div><dt>Tipo</dt><dd>{rotuloDoTipoDeGravacao(d.tipoGravacao)}</dd></div>}
          {momento && <div><dt>Quando</dt><dd>{rotuloDoMomento(momento)}</dd></div>}
          {(d.localGravacao || d.localEvento) && <div><dt>Onde</dt><dd>{d.localGravacao || d.localEvento}</dd></div>}
          {levar && <div><dt>Levar</dt><dd>{levar}</dd></div>}
        </dl>

        <KitNaPagina kit={convite.kit} />

        <form className={styles.entregas} onSubmit={enviar} aria-busy={enviando}>
          <h2>Entrega</h2>
          {d.edicaoPor && EDICAO_PARA_O_VIDEOMAKER[d.edicaoPor] && <p className={styles.expiry}>{EDICAO_PARA_O_VIDEOMAKER[d.edicaoPor]}</p>}

          <div className={styles.passo}>
            <h3>1. Brutos</h3>
            {d.linkBrutos
              ? <p className={styles.feito}><CheckCircle2 size={16} aria-hidden="true" />Recebido · <a href={d.linkBrutos} target="_blank" rel="noopener noreferrer">abrir</a></p>
              : <input type="url" inputMode="url" aria-label="Link do drive com os brutos" placeholder="Link do drive com os brutos" value={brutos} onChange={e => setBrutos(e.target.value)} />}
          </div>

          {editaEle && (
            <div className={styles.passo}>
              <h3>2. Vídeo pronto</h3>
              {d.linkFinal
                ? <p className={styles.feito}><CheckCircle2 size={16} aria-hidden="true" />Recebido · <a href={d.linkFinal} target="_blank" rel="noopener noreferrer">abrir</a></p>
                : <input type="url" inputMode="url" aria-label="Link do vídeo pronto" placeholder="Link do vídeo editado" value={video} onChange={e => setVideo(e.target.value)} />}
            </div>
          )}

          {faltaAlgo && (
            <div className={styles.actions}>
              <button type="submit" disabled={enviando}>{enviando ? <Loader2 className="animate-spin" size={18} /> : <Check size={18} />}Enviar material</button>
            </div>
          )}
          {erro && <p role="alert" className={styles.error}>{erro}</p>}

          <div className={styles.passo}>
            <h3>{editaEle ? "3" : "2"}. Nota fiscal</h3>
            {!completo || !nota
              ? <p>Depois do material, a nota abre aqui.</p>
              : nota.status === "pendente"
                ? <><p>Material recebido. Agora mande a nota para o pagamento ser programado.</p><a className={styles.botaoNota} href={`/nf-upload/${encodeURIComponent(nota.token)}`}>Enviar nota fiscal</a></>
                : <p className={styles.feito}><CheckCircle2 size={16} aria-hidden="true" />Nota recebida. Obrigado!</p>}
          </div>
        </form>
      </section>
      <p className={styles.footer}>Dúvida sobre a gravação? Fale com a equipe que enviou este link.</p>
    </div>
  </main>
}


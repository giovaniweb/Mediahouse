"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { Check, X, Loader2 } from "lucide-react"
import { LogoNuFlow } from "@/components/marca/Marca"
import { formatarData } from "@/lib/datas"
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
  }
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
    setLoading(true); setErro(null); setConvite(null); setResultado(null); setErroResposta("")
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
    } catch (e: unknown) {
      setErroResposta(e instanceof Error ? e.message : "Confira sua conexão e tente novamente.")
    } finally { setRespondendo(false) }
  }

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
        {d.descricao && <div className={styles.brief}><h2>Sobre o job</h2><p>{d.descricao}</p></div>}
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

"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Header } from "@/components/layout/Header"
import {
  Bot,
  Send,
  Sparkles,
  Zap,
  Bell,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronRight,
  Terminal,
  Activity,
  BarChart2,
  MessageSquare,
  Loader2,
  CalendarCheck,
  ShieldCheck,
  MessageCircle,
  X,
} from "lucide-react"

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Mensagem {
  id: string
  role: "user" | "assistant"
  conteudo: string
  ferramentas?: string[]
  loading?: boolean
}

interface AgenteCard {
  id: string
  nome: string
  descricao: string
  icon: React.ElementType
  cor: string
  endpoint: string
}

interface ExecucaoAgente {
  id?: string
  agente: string
  status: "executando" | "concluido" | "erro"
  resultado?: string
  alertasGerados?: number
  tokens?: number
  inicio: number
}

// ─── Agentes disponíveis ──────────────────────────────────────────────────────

const AGENTES: AgenteCard[] = [
  {
    id: "gerar_alertas",
    nome: "Gerar Alertas",
    descricao: "Varre todo o sistema identificando problemas: demandas paradas, atrasos, sobrecarga de equipe e anomalias de custo",
    icon: Bell,
    cor: "text-red-400",
    endpoint: "/api/ia/agentes/gerar-alertas",
  },
  {
    id: "monitor",
    nome: "Monitor de Fluxo",
    descricao: "Analisa o pipeline completo, detecta gargalos, vê distribuição de carga e recomenda ações para as próximas 24h",
    icon: Activity,
    cor: "text-blue-400",
    endpoint: "/api/ia/agentes/monitor",
  },
  {
    id: "prazos",
    nome: "Agente de Prazos",
    descricao: "Notifica videomakers sobre prazos em 24h, cobra atrasados via WhatsApp e motiva projetos parados há 3+ dias",
    icon: CalendarCheck,
    cor: "text-orange-400",
    endpoint: "/api/ia/agentes/prazos",
  },
  {
    id: "vistoria",
    nome: "Vistoria do Sistema",
    descricao: "Auditoria completa: pipeline, custos, produtividade, oportunidades de melhoria — envia relatório ao gestor via WhatsApp",
    icon: ShieldCheck,
    cor: "text-purple-400",
    endpoint: "/api/ia/agentes/vistoria",
  },
  {
    id: "relatorio_rapido",
    nome: "Relatório Executivo",
    descricao: "Análise executiva em tempo real com KPIs, tendências financeiras e recomendações prioritárias",
    icon: BarChart2,
    cor: "text-green-400",
    endpoint: "/api/relatorios/gerar",
  },
  {
    id: "whatsapp_status",
    nome: "Testar Secretária IA",
    descricao: "Executa o monitor de fluxo e mostra como a IA está gerenciando o sistema em tempo real",
    icon: MessageSquare,
    cor: "text-emerald-400",
    endpoint: "/api/ia/agentes/monitor",
  },
]

// ─── Sugestões rápidas ────────────────────────────────────────────────────────

const SUGESTOES = [
  "Quais demandas estão em atraso agora?",
  "Qual videomaker tem a maior carga de trabalho?",
  "Como estão os custos esse mês vs semana passada?",
  "Tem alguma demanda parada há mais de 3 dias?",
  "Quantas demandas foram concluídas essa semana?",
  "Qual é a saúde geral do sistema hoje?",
  "Quem são os videomakers mais eficientes em custo-benefício?",
  "Quais alertas críticos precisam de atenção urgente?",
  "Me dá um resumo executivo do pipeline para hoje",
  "Quais oportunidades de redução de custo você identifica?",
]

// ─── Componente principal ─────────────────────────────────────────────────────

export default function IAPage() {
  const [mensagens, setMensagens] = useState<Mensagem[]>([
    {
      id: "boas-vindas",
      role: "assistant",
      conteudo: "Olá! Sou o assistente IA do NuFlow.\n\nTenho acesso em tempo real a demandas, custos, agenda e equipe. Como posso ajudar agora?",
    },
  ])
  const [input, setInput] = useState("")
  const [carregando, setCarregando] = useState(false)
  const [execucoes, setExecucoes] = useState<ExecucaoAgente[]>([])
  const [abaAtiva, setAbaAtiva] = useState<"chat" | "agentes">("chat")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [mensagens])

  // ─── Enviar mensagem no chat ─────────────────────────────────────────────

  const enviarMensagem = useCallback(async (texto?: string) => {
    const conteudo = (texto ?? input).trim()
    if (!conteudo || carregando) return

    setInput("")
    setCarregando(true)

    const userMsg: Mensagem = {
      id: `u-${Date.now()}`,
      role: "user",
      conteudo,
    }

    const assistantId = `a-${Date.now()}`
    const assistantMsg: Mensagem = {
      id: assistantId,
      role: "assistant",
      conteudo: "",
      ferramentas: [],
      loading: true,
    }

    setMensagens(prev => [...prev, userMsg, assistantMsg])

    try {
      // Monta histórico para enviar ao backend
      const historico = [...mensagens, userMsg]
        .filter(m => !m.loading)
        .map(m => ({ role: m.role, content: m.conteudo }))

      const resp = await fetch("/api/ia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historico }),
      })

      if (!resp.ok) throw new Error("Erro na API")
      if (!resp.body) throw new Error("Sem stream")

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let textoBuf = ""
      const ferrsUsadas: string[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split("\n")

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const evento = JSON.parse(line.slice(6))

            if (evento.type === "text") {
              textoBuf += evento.text
              setMensagens(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, conteudo: textoBuf, loading: false }
                    : m
                )
              )
            } else if (evento.type === "tool_call") {
              ferrsUsadas.push(evento.label ?? evento.name)
              setMensagens(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, ferramentas: [...ferrsUsadas], loading: true, conteudo: m.conteudo }
                    : m
                )
              )
            } else if (evento.type === "done") {
              setMensagens(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, loading: false, ferramentas: ferrsUsadas }
                    : m
                )
              )
            } else if (evento.type === "error") {
              setMensagens(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, conteudo: "❌ Erro ao processar. Tente novamente.", loading: false }
                    : m
                )
              )
            }
          } catch { /* json inválido, ignora */ }
        }
      }
    } catch {
      setMensagens(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, conteudo: "❌ Erro de conexão. Verifique sua API key da Anthropic.", loading: false }
            : m
        )
      )
    } finally {
      setCarregando(false)
    }
  }, [input, mensagens, carregando])

  // ─── Executar agente ────────────────────────────────────────────────────

  const executarAgente = useCallback(async (agente: AgenteCard) => {
    const execId = `exec-${Date.now()}`
    const nova: ExecucaoAgente = {
      agente: agente.nome,
      status: "executando",
      inicio: Date.now(),
    }
    setExecucoes(prev => [nova, ...prev.slice(0, 9)])
    setAbaAtiva("agentes")

    try {
      const body = agente.endpoint.includes("relatorios/gerar")
        ? JSON.stringify({ tipo: "realtime" })
        : JSON.stringify({})

      const resp = await fetch(agente.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      })

      const data = await resp.json()

      setExecucoes(prev =>
        prev.map((e, i) =>
          i === 0
            ? {
                ...e,
                status: resp.ok ? "concluido" : "erro",
                resultado: data.analise ?? data.resumo ?? data.conteudo ?? JSON.stringify(data).slice(0, 200),
                alertasGerados: data.alertasGerados ?? 0,
                tokens: data.tokens ?? 0,
              }
            : e
        )
      )
    } catch (err) {
      setExecucoes(prev =>
        prev.map((e, i) =>
          i === 0
            ? { ...e, status: "erro", resultado: String(err) }
            : e
        )
      )
    }
    void execId
  }, [])

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-zinc-950 overflow-hidden">
      <Header title="Central de IA" />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Painel esquerdo: Chat ───────────────────────────────────────── */}
        <div className="flex flex-col flex-1 border-r border-zinc-800 min-w-0">
          {/* Tabs */}
          <div className="flex border-b border-zinc-800 px-4">
            <button
              onClick={() => setAbaAtiva("chat")}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                abaAtiva === "chat"
                  ? "border-white text-white"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Bot className="w-4 h-4" />
              Chat IA
            </button>
            <button
              onClick={() => setAbaAtiva("agentes")}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                abaAtiva === "agentes"
                  ? "border-white text-white"
                  : "border-transparent text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Zap className="w-4 h-4" />
              Agentes
              {execucoes.some(e => e.status === "executando") && (
                <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              )}
            </button>
          </div>

          {/* ── Aba Chat ─────────────────────────────────────────────────── */}
          {abaAtiva === "chat" && (
            <>
              {/* Mensagens */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {mensagens.map(msg => (
                  <MensagemBolha key={msg.id} msg={msg} />
                ))}
                <div ref={messagesEndRef} />
              </div>


              {/* Sugestões rápidas */}
              {mensagens.length === 1 && (
                <div className="px-4 pb-3">
                  <p className="text-xs text-zinc-500 mb-2">Sugestões:</p>
                  <div className="flex flex-wrap gap-2">
                    {SUGESTOES.slice(0, 4).map(s => (
                      <button
                        key={s}
                        onClick={() => enviarMensagem(s)}
                        className="text-xs px-3 py-1.5 rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors border border-zinc-700"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="p-4 border-t border-zinc-800">
                <div className="flex items-end gap-3 bg-zinc-900 rounded-xl border border-zinc-700 focus-within:border-zinc-500 px-4 py-3">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        enviarMensagem()
                      }
                    }}
                    placeholder="Pergunte sobre demandas, custos, equipe..."
                    className="flex-1 bg-transparent text-white text-sm placeholder-zinc-500 resize-none outline-none max-h-32"
                    rows={1}
                    disabled={carregando}
                  />
                  <button
                    onClick={() => enviarMensagem()}
                    disabled={!input.trim() || carregando}
                    className="p-2 rounded-lg bg-white text-zinc-900 hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    {carregando ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-zinc-600 mt-2 text-center">
                  Claude Opus 4.6 · Acesso em tempo real ao sistema
                </p>
              </div>
            </>
          )}

          {/* ── Aba Agentes ─────────────────────────────────────────────── */}
          {abaAtiva === "agentes" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {execucoes.length === 0 && (
                <div className="text-center py-12 text-zinc-500">
                  <Terminal className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nenhum agente executado ainda.</p>
                  <p className="text-xs mt-1">Use os botões ao lado para iniciar.</p>
                </div>
              )}
              {execucoes.map((exec, i) => (
                <ExecucaoCard key={i} exec={exec} />
              ))}
            </div>
          )}
        </div>

        {/* ── Painel direito: Agentes ─────────────────────────────────────── */}
        <div className="w-80 shrink-0 flex flex-col bg-zinc-900/50 overflow-y-auto">
          <div className="p-4 border-b border-zinc-800">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-semibold text-white">Agentes Autônomos</span>
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Clique para executar uma análise completa com IA
            </p>
          </div>

          <div className="p-3 space-y-2">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium px-1 pt-1">Monitoramento</p>
            {AGENTES.filter(a => ["gerar_alertas", "monitor"].includes(a.id)).map(agente => (
              <AgenteCardUI
                key={agente.id}
                agente={agente}
                executando={execucoes.some(e => e.agente === agente.nome && e.status === "executando")}
                onExecutar={() => executarAgente(agente)}
              />
            ))}
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium px-1 pt-2">Automação</p>
            {AGENTES.filter(a => ["prazos", "vistoria"].includes(a.id)).map(agente => (
              <AgenteCardUI
                key={agente.id}
                agente={agente}
                executando={execucoes.some(e => e.agente === agente.nome && e.status === "executando")}
                onExecutar={() => executarAgente(agente)}
              />
            ))}
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-medium px-1 pt-2">Relatórios</p>
            {AGENTES.filter(a => ["relatorio_rapido", "whatsapp_status"].includes(a.id)).map(agente => (
              <AgenteCardUI
                key={agente.id}
                agente={agente}
                executando={execucoes.some(e => e.agente === agente.nome && e.status === "executando")}
                onExecutar={() => executarAgente(agente)}
              />
            ))}
          </div>

          {/* Sugestões de chat */}
          <div className="p-4 border-t border-zinc-800 mt-2">
            <p className="text-xs text-zinc-500 font-medium mb-3">Perguntas frequentes</p>
            <div className="space-y-1.5">
              {SUGESTOES.map(s => (
                <button
                  key={s}
                  onClick={() => {
                    setAbaAtiva("chat")
                    enviarMensagem(s)
                  }}
                  className="w-full text-left text-xs text-zinc-400 hover:text-white flex items-center gap-2 py-1.5 px-2 rounded hover:bg-zinc-800 transition-colors"
                >
                  <ChevronRight className="w-3 h-3 shrink-0 text-zinc-600" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function MensagemBolha({ msg }: { msg: Mensagem }) {
  const isUser = msg.role === "user"
  const [wppAberto, setWppAberto] = useState(false)
  const [wppTelefone, setWppTelefone] = useState("")
  const [wppEnviando, setWppEnviando] = useState(false)
  const [wppStatus, setWppStatus] = useState<"" | "ok" | "erro">("")

  async function enviarWhatsApp() {
    if (!wppTelefone.trim()) return
    setWppEnviando(true)
    setWppStatus("")
    try {
      const res = await fetch("/api/whatsapp/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone: wppTelefone.trim(), mensagem: msg.conteudo }),
      })
      setWppStatus(res.ok ? "ok" : "erro")
      if (res.ok) setTimeout(() => { setWppAberto(false); setWppStatus(""); setWppTelefone("") }, 1500)
    } catch {
      setWppStatus("erro")
    } finally {
      setWppEnviando(false)
    }
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} gap-3`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-4 h-4 text-zinc-300" />
        </div>
      )}

      <div className={`max-w-[85%] space-y-2`}>
        {/* Tool calls indicador */}
        {!isUser && msg.ferramentas && msg.ferramentas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {msg.ferramentas.map((f, i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20"
              >
                {f}
              </span>
            ))}
          </div>
        )}

        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? "bg-white text-zinc-900 rounded-br-sm"
              : "bg-zinc-800 text-zinc-100 rounded-bl-sm border border-zinc-700/50"
          }`}
        >
          {msg.loading && !msg.conteudo ? (
            <div className="flex items-center gap-2 text-zinc-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="text-xs">Pensando...</span>
            </div>
          ) : (
            msg.conteudo || <span className="text-zinc-500 text-xs italic">Aguardando resposta...</span>
          )}
        </div>

        {/* Botão WhatsApp — só para mensagens do assistente com conteúdo */}
        {!isUser && !msg.loading && msg.conteudo && (
          <div>
            {!wppAberto ? (
              <button
                onClick={() => setWppAberto(true)}
                className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-green-400 transition-colors"
                title="Enviar esta mensagem via WhatsApp"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Enviar por WhatsApp
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2">
                <MessageCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                <input
                  type="tel"
                  placeholder="Telefone (ex: 11999999999)"
                  value={wppTelefone}
                  onChange={e => setWppTelefone(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && enviarWhatsApp()}
                  className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 outline-none min-w-0"
                  autoFocus
                />
                {wppStatus === "ok" && <span className="text-xs text-green-400 shrink-0">Enviado!</span>}
                {wppStatus === "erro" && <span className="text-xs text-red-400 shrink-0">Erro</span>}
                <button
                  onClick={enviarWhatsApp}
                  disabled={wppEnviando || !wppTelefone.trim()}
                  className="p-1 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  {wppEnviando
                    ? <Loader2 className="w-3 h-3 text-white animate-spin" />
                    : <Send className="w-3 h-3 text-white" />
                  }
                </button>
                <button
                  onClick={() => { setWppAberto(false); setWppStatus(""); setWppTelefone("") }}
                  className="p-1 text-zinc-500 hover:text-white transition-colors shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AgenteCardUI({
  agente,
  executando,
  onExecutar,
}: {
  agente: AgenteCard
  executando: boolean
  onExecutar: () => void
}) {
  const Icon = agente.icon

  return (
    <div className="bg-zinc-800/60 rounded-xl border border-zinc-700/50 p-4 hover:border-zinc-600 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-zinc-700/50 flex items-center justify-center shrink-0">
            <Icon className={`w-4.5 h-4.5 ${agente.cor}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-white">{agente.nome}</p>
            <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{agente.descricao}</p>
          </div>
        </div>
      </div>
      <button
        onClick={onExecutar}
        disabled={executando}
        className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {executando ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Executando...
          </>
        ) : (
          <>
            <Zap className="w-3.5 h-3.5" />
            Executar Agente
          </>
        )}
      </button>
    </div>
  )
}

function ExecucaoCard({ exec }: { exec: ExecucaoAgente }) {
  const [expandido, setExpandido] = useState(false)
  const duracao = exec.status !== "executando"
    ? `${((Date.now() - exec.inicio) / 1000).toFixed(0)}s`
    : null

  return (
    <div
      className={`rounded-xl border p-4 transition-colors ${
        exec.status === "executando"
          ? "border-yellow-500/30 bg-yellow-500/5"
          : exec.status === "concluido"
          ? "border-green-500/20 bg-green-500/5"
          : "border-red-500/20 bg-red-500/5"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {exec.status === "executando" ? (
            <Loader2 className="w-4 h-4 text-yellow-400 animate-spin shrink-0" />
          ) : exec.status === "concluido" ? (
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
          ) : (
            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium text-white">{exec.agente}</p>
            <div className="flex items-center gap-3 mt-0.5">
              {exec.status === "executando" && (
                <span className="text-xs text-yellow-400">Executando...</span>
              )}
              {exec.alertasGerados != null && exec.alertasGerados > 0 && (
                <span className="text-xs text-orange-400">
                  {exec.alertasGerados} alerta{exec.alertasGerados > 1 ? "s" : ""} gerado{exec.alertasGerados > 1 ? "s" : ""}
                </span>
              )}
              {exec.tokens != null && exec.tokens > 0 && (
                <span className="text-xs text-zinc-500">{exec.tokens.toLocaleString()} tokens</span>
              )}
              {duracao && (
                <span className="text-xs text-zinc-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {duracao}
                </span>
              )}
            </div>
          </div>
        </div>

        {exec.resultado && (
          <button
            onClick={() => setExpandido(!expandido)}
            className="text-xs text-zinc-400 hover:text-white transition-colors shrink-0"
          >
            {expandido ? "Fechar" : "Ver resultado"}
          </button>
        )}
      </div>

      {expandido && exec.resultado && (
        <div className="mt-3 p-3 bg-zinc-900/60 rounded-lg border border-zinc-700/50">
          <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap">
            {exec.resultado.length > 800
              ? exec.resultado.slice(0, 800) + "..."
              : exec.resultado}
          </p>
        </div>
      )}
    </div>
  )
}

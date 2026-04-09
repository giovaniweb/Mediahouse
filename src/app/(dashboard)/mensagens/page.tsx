"use client"

import { useState } from "react"
import { Header } from "@/components/layout/Header"
import { Send, Phone, User, Search, MessageSquare, ChevronDown, ChevronUp } from "lucide-react"
import useSWR from "swr"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const fetcher = (url: string) => fetch(url).then(r => r.json())

const TEMPLATES = [
  {
    label: "Confirmação de captação",
    texto: "Olá! Confirma sua disponibilidade para a captação? Aguardamos retorno.",
  },
  {
    label: "Lembrete de envio dos brutos",
    texto: "Oi! Lembrete: os brutos da captação ainda não foram enviados. Pode enviar pelo link do sistema?",
  },
  {
    label: "Aviso de pagamento processado",
    texto: "Boas notícias! Seu pagamento foi processado e está a caminho. Qualquer dúvida, estamos à disposição! 🙏",
  },
  {
    label: "Solicitação de nota fiscal",
    texto: "Oi! Para fecharmos o processo, precisamos da sua nota fiscal. Pode enviar pelo link que mandamos?",
  },
  {
    label: "Atualização de status",
    texto: "Oi! Sua demanda está em andamento. Em breve entraremos em contato com mais detalhes.",
  },
  {
    label: "Mensagem de boas-vindas",
    texto: "Bem-vindo(a) à NuFlow! 🎬 Seu cadastro foi ativado. Em caso de dúvidas, é só chamar aqui no WhatsApp.",
  },
]

interface Contato {
  id: string
  nome: string
  telefone: string
  tipo: string
}

export default function MensagensPage() {
  const [telefone, setTelefone] = useState("")
  const [mensagem, setMensagem] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [busca, setBusca] = useState("")
  const [showContatos, setShowContatos] = useState(false)

  const { data: dataVMs } = useSWR<{ videomakers: Array<{ id: string; nome: string; telefone?: string }> }>(
    "/api/videomakers?status=ativo&limit=200",
    fetcher
  )
  const { data: dataEds } = useSWR<{ editores: Array<{ id: string; nome: string; telefone?: string }> }>(
    "/api/editores?status=ativo",
    fetcher
  )
  const { data: dataUsers } = useSWR<{ usuarios: Array<{ id: string; nome: string; telefone?: string; tipo: string }> }>(
    "/api/usuarios",
    fetcher
  )

  const contatos: Contato[] = [
    ...(dataVMs?.videomakers ?? [])
      .filter(v => v.telefone)
      .map(v => ({ id: v.id, nome: v.nome, telefone: v.telefone!, tipo: "videomaker" })),
    ...(dataEds?.editores ?? [])
      .filter(e => e.telefone)
      .map(e => ({ id: e.id, nome: e.nome, telefone: e.telefone!, tipo: "editor" })),
    ...(dataUsers?.usuarios ?? [])
      .filter(u => u.telefone && u.tipo !== "videomaker" && u.tipo !== "editor")
      .map(u => ({ id: u.id, nome: u.nome, telefone: u.telefone!, tipo: u.tipo })),
  ]

  const contatosFiltrados = busca.trim()
    ? contatos.filter(c =>
        c.nome.toLowerCase().includes(busca.toLowerCase()) ||
        c.telefone.includes(busca)
      )
    : contatos

  async function enviar() {
    if (!telefone.trim() || !mensagem.trim()) {
      toast.error("Preencha o telefone e a mensagem")
      return
    }
    setEnviando(true)
    try {
      const res = await fetch("/api/whatsapp/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefone: telefone.replace(/\D/g, ""), mensagem }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success("Mensagem enviada!")
      setMensagem("")
    } catch (e) {
      toast.error(String(e))
    } finally { setEnviando(false) }
  }

  function selecionarContato(c: Contato) {
    setTelefone(c.telefone)
    setBusca(c.nome)
    setShowContatos(false)
  }

  const tipoColor: Record<string, string> = {
    videomaker: "text-emerald-400",
    editor: "text-amber-400",
    admin: "text-purple-400",
    gestor: "text-blue-400",
    operacao: "text-zinc-300",
    solicitante: "text-zinc-400",
    social: "text-pink-400",
  }

  return (
    <>
      <Header title="Mensagens" />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Destinatário */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-zinc-100 flex items-center gap-2">
              <User className="w-4 h-4 text-purple-400" /> Destinatário
            </h2>

            {/* Busca de contato */}
            <div className="relative">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                  <input
                    value={busca}
                    onChange={e => { setBusca(e.target.value); setShowContatos(true) }}
                    onFocus={() => setShowContatos(true)}
                    placeholder="Buscar contato por nome..."
                    className="w-full pl-9 pr-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:ring-1 focus:ring-purple-500/50"
                  />
                </div>
                <button
                  onClick={() => setShowContatos(v => !v)}
                  className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-400 hover:text-zinc-200"
                >
                  {showContatos ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {showContatos && (
                <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-h-64 overflow-y-auto">
                  {contatosFiltrados.length === 0 ? (
                    <p className="p-4 text-sm text-zinc-500 text-center">Nenhum contato encontrado</p>
                  ) : (
                    contatosFiltrados.slice(0, 30).map(c => (
                      <button
                        key={c.id + c.tipo}
                        onClick={() => selecionarContato(c)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 text-left transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-200 truncate">{c.nome}</p>
                          <p className="text-xs text-zinc-500">{c.telefone}</p>
                        </div>
                        <span className={cn("text-xs capitalize", tipoColor[c.tipo] ?? "text-zinc-400")}>
                          {c.tipo}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Telefone manual */}
            <div>
              <label className="text-xs text-zinc-500 mb-1 block flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" /> Telefone (com DDD e DDI)
              </label>
              <input
                value={telefone}
                onChange={e => setTelefone(e.target.value)}
                placeholder="Ex: 5531999990000"
                className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:ring-1 focus:ring-purple-500/50 font-mono"
              />
              <p className="text-xs text-zinc-600 mt-1">Formato: país (55) + DDD + número, sem espaços ou hífens</p>
            </div>
          </div>

          {/* Templates */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-3">
            <h2 className="font-semibold text-zinc-100 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-purple-400" /> Templates Rápidos
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TEMPLATES.map((t, i) => (
                <button
                  key={i}
                  onClick={() => setMensagem(t.texto)}
                  className={cn(
                    "text-left px-3 py-2.5 rounded-xl border text-sm transition-all",
                    mensagem === t.texto
                      ? "border-purple-600 bg-purple-600/10 text-purple-300"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/50"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mensagem */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-zinc-100 flex items-center gap-2">
              <Send className="w-4 h-4 text-purple-400" /> Mensagem
            </h2>
            <textarea
              value={mensagem}
              onChange={e => setMensagem(e.target.value)}
              rows={5}
              placeholder="Digite ou selecione um template acima..."
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:ring-1 focus:ring-purple-500/50 resize-none"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-600">{mensagem.length} / 4096</span>
              <button
                onClick={enviar}
                disabled={enviando || !telefone.trim() || !mensagem.trim()}
                className="flex items-center gap-2 bg-white text-zinc-900 font-semibold text-sm px-5 py-2.5 rounded-xl hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {enviando ? (
                  <span className="animate-pulse">Enviando...</span>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Enviar WhatsApp
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}

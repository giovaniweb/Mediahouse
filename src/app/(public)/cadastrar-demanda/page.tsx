"use client"

import { useState } from "react"
import Link from "next/link"
import { Film, CheckCircle2, ArrowLeft } from "lucide-react"

const TIPOS_VIDEO = [
  "Vídeo Institucional", "Reel para Instagram", "Vídeo para YouTube", "Cobertura de Evento",
  "Clipe Musical", "Documentário", "Vídeo de Produto", "Treinamento Corporativo",
  "Entrevista / Depoimento", "Tour Virtual / Imóvel", "Outro",
]

export default function CadastrarDemandaPage() {
  const [enviado, setEnviado] = useState(false)
  const [codigoGerado, setCodigoGerado] = useState("")
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [form, setForm] = useState({
    nomeCliente: "", email: "", telefone: "", empresa: "",
    titulo: "", descricao: "", tipoVideo: "", cidade: "",
    dataLimite: "", dataEvento: "", localEvento: "", referencia: "",
  })

  function set(field: string, val: string) {
    setForm((f) => ({ ...f, [field]: val }))
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setErro(null)
    try {
      const res = await fetch("/api/publico/demanda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) {
        const msgs = typeof json.error === "object"
          ? Object.values(json.error).flat().join(", ")
          : json.error
        throw new Error(msgs || "Erro ao enviar")
      }
      setCodigoGerado(json.codigo)
      setEnviado(true)
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }

  if (enviado) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Solicitação enviada!</h2>
          {codigoGerado && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-6 py-4 mb-4">
              <p className="text-xs text-zinc-400 mb-1">Código do seu projeto</p>
              <p className="text-xl font-mono font-bold text-white">{codigoGerado}</p>
              <p className="text-xs text-zinc-500 mt-1">Guarde este código para acompanhar sua solicitação</p>
            </div>
          )}
          <p className="text-zinc-400 mb-6">
            Nossa equipe irá analisar sua solicitação e entrar em contato em até 24 horas úteis pelo e-mail ou WhatsApp informado.
          </p>
          <Link href="/sobre" className="text-zinc-400 hover:text-white transition-colors flex items-center gap-2 justify-center">
            <ArrowLeft className="w-4 h-4" /> Voltar ao início
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="border-b border-zinc-800">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/sobre" className="flex items-center gap-2">
            <div className="w-7 h-7 bg-white rounded-md flex items-center justify-center">
              <Film className="w-4 h-4 text-zinc-900" />
            </div>
            <span className="font-bold text-white">VideoOps</span>
          </Link>
          <Link href="/sobre" className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Link>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Solicitar Projeto de Vídeo</h1>
          <p className="text-zinc-400">Preencha os dados abaixo e nossa equipe entrará em contato em breve</p>
        </div>

        {erro && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-xl mb-6">
            {erro}
          </div>
        )}

        <form onSubmit={enviar} className="space-y-6">
          {/* Dados de contato */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-white">Seus dados</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">Nome Completo *</label>
                <input required className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                  value={form.nomeCliente} onChange={e => set("nomeCliente", e.target.value)} placeholder="João da Silva" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">Empresa</label>
                <input className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                  value={form.empresa} onChange={e => set("empresa", e.target.value)} placeholder="Nome da empresa (opcional)" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">E-mail *</label>
                <input required type="email" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                  value={form.email} onChange={e => set("email", e.target.value)} placeholder="joao@empresa.com" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">WhatsApp *</label>
                <input required className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                  value={form.telefone} onChange={e => set("telefone", e.target.value)} placeholder="(11) 99999-9999" />
              </div>
            </div>
          </div>

          {/* Dados do projeto */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
            <h2 className="font-semibold text-white">Sobre o projeto</h2>
            <div>
              <label className="text-xs font-medium text-zinc-400 block mb-1.5">Título do projeto *</label>
              <input required className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                value={form.titulo} onChange={e => set("titulo", e.target.value)} placeholder="Ex: Vídeo institucional da empresa" />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-400 block mb-1.5">Descrição do que você precisa *</label>
              <textarea required className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10 resize-none"
                rows={4} value={form.descricao} onChange={e => set("descricao", e.target.value)}
                placeholder="Descreva o objetivo do vídeo, público-alvo, tom da comunicação, referências, etc." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">Tipo de vídeo *</label>
                <select required className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/10"
                  value={form.tipoVideo} onChange={e => set("tipoVideo", e.target.value)}>
                  <option value="">Selecione...</option>
                  {TIPOS_VIDEO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">Cidade de gravação *</label>
                <input required className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                  value={form.cidade} onChange={e => set("cidade", e.target.value)} placeholder="São Paulo" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">Prazo desejado</label>
                <input type="date" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/10"
                  value={form.dataLimite} onChange={e => set("dataLimite", e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-400 block mb-1.5">Data do evento (se houver)</label>
                <input type="date" className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/10"
                  value={form.dataEvento} onChange={e => set("dataEvento", e.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-400 block mb-1.5">Local do evento / gravação</label>
              <input className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                value={form.localEvento} onChange={e => set("localEvento", e.target.value)} placeholder="Endereço ou local específico" />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-400 block mb-1.5">Referências (links, vídeos similares)</label>
              <input className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/10"
                value={form.referencia} onChange={e => set("referencia", e.target.value)} placeholder="https://youtube.com/..." />
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="w-full bg-white text-zinc-900 font-bold py-4 rounded-2xl hover:bg-zinc-100 transition-colors disabled:opacity-50 text-base">
            {loading ? "Enviando..." : "Enviar Solicitação →"}
          </button>

          <p className="text-center text-xs text-zinc-500">
            Ao enviar, você concorda com nossa política de privacidade. Retornaremos em até 24h úteis.
          </p>
        </form>
      </div>
    </div>
  )
}

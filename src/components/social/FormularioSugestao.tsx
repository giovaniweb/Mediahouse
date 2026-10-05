"use client"

// "Mandar para a social": ideia ou solicitação, curta. O mesmo formulário serve
// a quem está logado (/social/enviar) e a quem não tem login (/c/<slug>/ideia);
// sem login, pede também o nome e o WhatsApp. Cai em Ideias do quadro da social
// da linha escolhida — quem manda não aciona a equipe.
import { useState } from "react"
import { AlertTriangle, Loader2, Send } from "lucide-react"
import { cn } from "@/lib/utils"

export type EnvioSugestao = {
  tipo: "ideia" | "solicitacao"
  linhaProjetoId: string
  titulo: string
  linkReferencia: string
  area: "" | "audiovisual" | "design"
  nome?: string
  telefone?: string
}

const inputClass =
  "w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-500 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500/40"

function Escolha<T extends string>({ id, valor, opcoes, aoMudar }: { id: string; valor: T; opcoes: { v: T; t: string }[]; aoMudar: (v: T) => void }) {
  return (
    <div id={id} role="group" className="flex gap-2">
      {opcoes.map((o) => (
        <button key={o.v} type="button" aria-pressed={valor === o.v} onClick={() => aoMudar(o.v)}
          className={cn("flex-1 rounded-xl border py-2.5 text-sm font-medium transition-colors",
            valor === o.v ? "border-purple-500 bg-purple-600 text-white" : "border-zinc-700 bg-zinc-800/60 text-zinc-400 hover:text-zinc-200")}>
          {o.t}
        </button>
      ))}
    </div>
  )
}

export function FormularioSugestao({ linhas, semLogin, contatoInicial, aoEnviar }: {
  linhas: { id: string; nome: string }[]
  semLogin?: boolean
  contatoInicial?: { nome: string; telefone: string }
  /** Lança Error com a mensagem para mostrar. */
  aoEnviar: (envio: EnvioSugestao) => Promise<void>
}) {
  const [tipo, setTipo] = useState<"ideia" | "solicitacao">("ideia")
  const [linhaProjetoId, setLinha] = useState("")
  const [titulo, setTitulo] = useState("")
  const [linkReferencia, setLink] = useState("")
  const [area, setArea] = useState<"" | "audiovisual" | "design">("")
  const [nome, setNome] = useState(contatoInicial?.nome ?? "")
  const [telefone, setTelefone] = useState(contatoInicial?.telefone ?? "")
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (enviando) return
    setErro(null)
    if (!linhaProjetoId) return setErro("Escolha a linha de produto.")
    if (semLogin && telefone.replace(/\D/g, "").length < 10) return setErro("Confira o WhatsApp: com DDD, pelo menos 10 números.")
    setEnviando(true)
    try {
      await aoEnviar({ tipo, linhaProjetoId, titulo: titulo.trim(), linkReferencia: linkReferencia.trim(), area, ...(semLogin ? { nome: nome.trim(), telefone: telefone.trim() } : {}) })
      setTitulo(""); setLink(""); setArea("")
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar. Tente de novo.")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-5" aria-busy={enviando}>
      <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <div>
          <label htmlFor="sug-tipo" className="mb-1.5 block text-xs font-medium text-zinc-400">É uma…</label>
          <Escolha id="sug-tipo" valor={tipo} aoMudar={setTipo}
            opcoes={[{ v: "ideia", t: "💡 Ideia" }, { v: "solicitacao", t: "📌 Solicitação" }]} />
          <p className="mt-1 text-xs text-zinc-500">
            {tipo === "ideia" ? "Uma sugestão de post, vídeo ou referência que você viu." : "Algo que você precisa que seja postado ou produzido."}
          </p>
        </div>
        <div>
          <label htmlFor="sug-linha" className="mb-1.5 block text-xs font-medium text-zinc-400">Linha de produto</label>
          <select id="sug-linha" value={linhaProjetoId} onChange={(e) => setLinha(e.target.value)} required className={inputClass}>
            <option value="">Escolha…</option>
            {linhas.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="sug-oque" className="mb-1.5 block text-xs font-medium text-zinc-400">O que é</label>
          <textarea id="sug-oque" value={titulo} onChange={(e) => setTitulo(e.target.value)} required minLength={3} maxLength={2000} rows={3}
            placeholder="Ex.: vídeo mostrando o antes e depois com o equipamento novo" className={inputClass} />
        </div>
        <div>
          <label htmlFor="sug-link" className="mb-1.5 block text-xs font-medium text-zinc-400">Link de referência (opcional)</label>
          <input id="sug-link" value={linkReferencia} onChange={(e) => setLink(e.target.value)} maxLength={500} inputMode="url"
            placeholder="instagram.com/reel/…" className={inputClass} />
        </div>
        <div>
          <label htmlFor="sug-area" className="mb-1.5 block text-xs font-medium text-zinc-400">Vídeo ou arte? (opcional)</label>
          <Escolha id="sug-area" valor={area} aoMudar={(v) => setArea(area === v ? "" : v)}
            opcoes={[{ v: "audiovisual", t: "Vídeo" }, { v: "design", t: "Arte" }]} />
        </div>
      </section>

      {semLogin && (
        <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="font-semibold text-white">Quem está mandando</h2>
          <div>
            <label htmlFor="sug-nome" className="mb-1.5 block text-xs font-medium text-zinc-400">Seu nome</label>
            <input id="sug-nome" value={nome} onChange={(e) => setNome(e.target.value)} required minLength={2} maxLength={120} autoComplete="name" className={inputClass} />
          </div>
          <div>
            <label htmlFor="sug-tel" className="mb-1.5 block text-xs font-medium text-zinc-400">WhatsApp</label>
            <input id="sug-tel" type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} required autoComplete="tel" placeholder="(11) 99999-9999" className={inputClass} />
          </div>
        </section>
      )}

      {erro && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" /> {erro}
        </div>
      )}
      <button type="submit" disabled={enviando || linhas.length === 0}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-purple-700 disabled:opacity-60">
        {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
        {enviando ? "Enviando…" : "Mandar para a social media"}
      </button>
      <p className="text-center text-xs text-zinc-500">A social media da linha decide o que entra no planejamento.</p>
    </form>
  )
}

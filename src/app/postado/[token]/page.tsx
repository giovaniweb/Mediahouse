"use client"

// O link "foi postado" da cobrança a quem pediu (lib/cobranca-solicitante.ts):
// sem login, a pessoa só confirma que o vídeo (ou a arte) já está no ar. Onde
// foi postado e o link do post são opcionais — a confirmação é o que tira o
// card de Para Postar.
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { CheckCircle2, Loader2 } from "lucide-react"
import { LogoNuFlow } from "@/components/marca/Marca"
import { LinksJuridicos } from "@/components/juridico/LinksJuridicos"

type Dados = { codigo: string; titulo: string; ehArte: boolean; nome: string | null; esperando: boolean; postado: boolean }
const ONDE = [["reels", "Reels"], ["feed", "Feed"], ["story", "Story"], ["youtube", "YouTube"], ["outro", "Outro"]] as const

export default function PostadoPage() {
  const token = useParams()?.token as string
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [onde, setOnde] = useState<string | null>(null)
  const [link, setLink] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [feito, setFeito] = useState(false)

  useEffect(() => {
    if (!token) return
    fetch(`/api/publico/postagem/${token}`, { cache: "no-store" })
      .then(async (r) => {
        const corpo = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(r.status === 404 ? "Este link já foi usado ou venceu. Se o post ainda não foi marcado, peça um novo à equipe." : corpo.error ?? "Não foi possível abrir o link.")
        setDados(corpo as Dados)
      })
      .catch((e: Error) => setErro(e.message))
  }, [token])

  async function confirmar() {
    if (enviando) return
    setEnviando(true); setErro(null)
    try {
      const r = await fetch(`/api/publico/postagem/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: onde, link: link.trim() || null }),
      })
      const corpo = await r.json().catch(() => ({})) as { error?: string }
      if (!r.ok) throw new Error(corpo.error ?? "Não foi possível confirmar.")
      setFeito(true)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível confirmar.")
    } finally {
      setEnviando(false)
    }
  }

  const peca = dados?.ehArte ? "a arte" : "o vídeo"
  const campo = "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-base text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/40"

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <header className="border-b border-zinc-800">
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <LogoNuFlow className="text-lg text-white" />
          {dados && <p className="text-xs text-zinc-400">{dados.codigo}</p>}
        </div>
      </header>

      <main className="flex-1 w-full max-w-xl mx-auto px-4 py-10">
        {!dados && !erro && <p className="flex items-center gap-2 text-zinc-400"><Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Carregando…</p>}
        {!dados && erro && <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">{erro}</p>}

        {dados && (feito || dados.postado) && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-400" aria-hidden />
            <h1 className="text-xl font-semibold">Postagem confirmada</h1>
            <p className="mt-2 text-zinc-300">Obrigado{dados.nome ? `, ${dados.nome}` : ""}! <strong>{dados.titulo}</strong> saiu de Para Postar e a cobrança para por aqui.</p>
          </div>
        )}

        {dados && !feito && !dados.postado && !dados.esperando && (
          <p className="rounded-xl border border-zinc-700 p-4 text-zinc-300"><strong>{dados.titulo}</strong> não está mais esperando a postagem. Nada a fazer por aqui.</p>
        )}

        {dados && !feito && !dados.postado && dados.esperando && (
          <form className="grid gap-5" onSubmit={(e) => { e.preventDefault(); void confirmar() }}>
            <div>
              <h1 className="text-2xl font-semibold">Já foi postado?</h1>
              <p className="mt-2 text-zinc-300">{dados.nome ? `${dados.nome}, ` : ""}{peca} de <strong>{dados.titulo}</strong> ({dados.codigo}) está em Para Postar. Se já foi ao ar, confirme aqui.</p>
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm text-zinc-400">Onde foi postado? (opcional)</legend>
              <div className="flex flex-wrap gap-2">
                {ONDE.map(([valor, rotulo]) => (
                  <button key={valor} type="button" aria-pressed={onde === valor} onClick={() => setOnde(onde === valor ? null : valor)}
                    className={`min-h-11 rounded-lg border px-4 text-sm transition-colors ${onde === valor ? "border-purple-400 bg-purple-600 text-white" : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"}`}>
                    {rotulo}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="grid gap-1">
              <span className="text-sm text-zinc-400">Link do post (opcional)</span>
              <input className={campo} inputMode="url" placeholder="https://instagram.com/p/…" value={link} maxLength={500} onChange={(e) => setLink(e.target.value)} />
            </label>
            {erro && <p role="alert" className="text-sm text-amber-200">{erro}</p>}
            <button type="submit" disabled={enviando}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 text-base font-semibold text-white hover:bg-purple-500 disabled:opacity-60">
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <CheckCircle2 className="w-5 h-5" aria-hidden />}
              Sim, foi postado
            </button>
          </form>
        )}
      </main>

      <footer className="border-t border-zinc-800 py-6">
        <div className="max-w-xl mx-auto px-6 text-center text-xs text-zinc-500">
          <p>NuFlow</p>
          <LinksJuridicos className="mt-2 justify-center" apenas={["privacidade"]} />
        </div>
      </footer>
    </div>
  )
}

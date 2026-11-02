"use client"
// Configurações → Assistentes (MCP). Cada pessoa recebe a própria chave para
// ligar o assistente dela (Claude, Alfred…) ao NuFlow. O assistente age como
// ela: vê o que ela vê e cria pedidos em nome dela. Aqui a gestão gera e
// revoga a chave, vê o que cada assistente criou e desfaz o que ninguém mexeu.
import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { Bot, Check, Copy, KeyRound, Loader2, Undo2 } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { erroDaResposta, mensagemDeErro } from "@/lib/erro-cliente"

type Chave = {
  id: string; rotulo: string; pessoa: { id: string; nome: string }
  criadaEm: string; revogadaEm: string | null; demandasCriadas: number
}
type Pessoa = { id: string; nome: string; papel: string }
type DemandaDaChave = { id: string; codigo: string; titulo: string; status: string; criadaEm: string; motivoParaManter: string | null }

const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR")
const botao = "inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-200 hover:bg-white/5 disabled:opacity-50"
const campo = "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 outline-none focus:ring-1 focus:ring-zinc-500"

function OQueCriou({ chave, aoDesfazer }: { chave: Chave; aoDesfazer: () => void }) {
  const { data: r, mutate } = useSWR<{ demandas: DemandaDaChave[] }>(`/api/configuracoes/mcp/${chave.id}`, fetcher)
  const [desfazendo, setDesfazendo] = useState(false)
  const intocadas = r?.demandas.filter((d) => !d.motivoParaManter) ?? []

  async function desfazer() {
    if (!confirm(`Apagar ${intocadas.length} demanda(s) criada(s) por "${chave.rotulo}" que ninguém mexeu? Não dá para voltar atrás.`)) return
    setDesfazendo(true)
    try {
      const res = await fetch(`/api/configuracoes/mcp/${chave.id}`, { method: "POST" })
      if (!res.ok) throw await erroDaResposta(res, "Não foi possível desfazer.")
      const j: { apagadas: string[]; mantidas: { codigo: string; motivo: string }[] } = await res.json()
      toast.success(`${j.apagadas.length} apagada(s).${j.mantidas.length ? ` ${j.mantidas.length} ficaram porque alguém já mexeu.` : ""}`)
      await mutate()
      aoDesfazer() // a contagem de "demandas criadas" da chave mudou
    } catch (e) {
      toast.error(mensagemDeErro(e, "Não foi possível desfazer."))
    } finally {
      setDesfazendo(false)
    }
  }

  if (!r) return <p role="status" className="py-2 text-sm text-zinc-400">Carregando o que este assistente criou…</p>
  if (!r.demandas.length) return <p className="py-2 text-sm text-zinc-400">Este assistente ainda não criou nenhuma demanda.</p>
  return (
    <div className="mt-3 space-y-3">
      <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
        {r.demandas.map((d) => (
          <li key={d.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-sm">
            <span className="font-mono text-xs text-zinc-400">{d.codigo}</span>
            <span className="min-w-0 flex-1 text-zinc-100">{d.titulo}</span>
            <span className="text-zinc-400">{d.status} · {data(d.criadaEm)}</span>
            <span className={d.motivoParaManter ? "text-xs text-amber-300" : "text-xs text-emerald-300"}>
              {d.motivoParaManter ? `Fica: ${d.motivoParaManter}` : "Ninguém mexeu"}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={desfazer} disabled={!intocadas.length || desfazendo} className={botao}>
        {desfazendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Undo2 className="h-4 w-4" aria-hidden="true" />}
        Desfazer as que ninguém mexeu ({intocadas.length})
      </button>
      <p className="text-xs text-zinc-500">As que já andaram (saíram da Entrada, têm comentário, arquivo ou alteração) ficam para a equipe resolver no quadro.</p>
    </div>
  )
}

export function AssistentesMcp() {
  const { data: r, error, mutate } = useSWR<{ chaves: Chave[]; pessoas: Pessoa[] }>("/api/configuracoes/mcp", fetcher)
  const [pessoa, setPessoa] = useState("")
  const [rotulo, setRotulo] = useState("")
  const [gerando, setGerando] = useState(false)
  const [nova, setNova] = useState<{ rotulo: string; chave: string } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [aberta, setAberta] = useState<string | null>(null)

  async function gerar() {
    setGerando(true)
    try {
      const res = await fetch("/api/configuracoes/mcp", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuarioId: pessoa, rotulo }),
      })
      if (!res.ok) throw await erroDaResposta(res, "Não foi possível gerar a chave.")
      const j: { chave: string } = await res.json()
      setNova({ rotulo, chave: j.chave }); setCopiado(false); setPessoa(""); setRotulo("")
      await mutate()
    } catch (e) {
      toast.error(mensagemDeErro(e, "Não foi possível gerar a chave."))
    } finally {
      setGerando(false)
    }
  }

  async function revogar(c: Chave) {
    if (!confirm(`Revogar "${c.rotulo}"? O assistente de ${c.pessoa.nome} para de funcionar na hora. O que ele criou continua listado aqui.`)) return
    try {
      const res = await fetch("/api/configuracoes/mcp", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id }),
      })
      if (!res.ok) throw await erroDaResposta(res, "Não foi possível revogar.")
      toast.success("Chave revogada.")
      await mutate()
    } catch (e) {
      toast.error(mensagemDeErro(e, "Não foi possível revogar."))
    }
  }

  async function copiar(texto: string) {
    try { await navigator.clipboard.writeText(texto); setCopiado(true) } catch { setCopiado(false) }
  }

  if (error) return <p role="alert" className="text-sm text-amber-300">Não foi possível carregar os assistentes.</p>
  if (!r) return <p role="status" className="text-sm text-zinc-400">Carregando os assistentes…</p>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-100"><Bot className="h-4 w-4" aria-hidden="true" />Assistentes (MCP)</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Uma chave por pessoa, para ligar o assistente dela (Claude, Alfred…) ao NuFlow. O assistente age como ela: vê só o que ela vê e cria pedidos em nome dela, pelas mesmas regras da tela. Cada consulta e cada criação fica na Auditoria com o nome dela. Nada de valores ou custos sai por aqui.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-white/10 p-4">
        <p className="text-sm font-medium text-zinc-200">Gerar chave</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-zinc-300">Pessoa
            <select value={pessoa} onChange={(e) => setPessoa(e.target.value)} className={`${campo} mt-1`}>
              <option value="">Escolha…</option>
              {r.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.papel})</option>)}
            </select>
          </label>
          <label className="text-sm text-zinc-300">Nome da chave
            <input value={rotulo} onChange={(e) => setRotulo(e.target.value)} maxLength={60} placeholder="Ex.: Alfred do Cris" className={`${campo} mt-1`} />
          </label>
        </div>
        <button type="button" onClick={gerar} disabled={!pessoa || rotulo.trim().length < 2 || gerando} className={botao}>
          {gerando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
          Gerar chave
        </button>
        {nova && (
          <div role="status" className="space-y-2 rounded-lg border border-amber-400/40 bg-amber-400/5 p-3">
            <p className="text-sm text-amber-200">Chave &quot;{nova.rotulo}&quot;. Copie agora: ela não aparece de novo. Mande só para a pessoa, por mensagem privada.</p>
            <code className="block break-all rounded bg-black/30 px-2 py-1.5 text-xs text-zinc-100">{nova.chave}</code>
            <p className="text-xs text-zinc-400">Endereço do servidor: <code className="text-zinc-200">{`${window.location.origin}/api/mcp`}</code></p>
            <div className="flex gap-2">
              <button type="button" onClick={() => copiar(nova.chave)} className={botao}>
                {copiado ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                {copiado ? "Copiada" : "Copiar chave"}
              </button>
              <button type="button" onClick={() => setNova(null)} className={botao}>Já copiei</button>
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-zinc-200">Chaves</p>
        {!r.chaves.length && <p className="text-sm text-zinc-400">Nenhuma chave gerada ainda.</p>}
        <ul className="space-y-2">
          {r.chaves.map((c) => (
            <li key={c.id} className="rounded-xl border border-white/10 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-[1_1_14rem]">
                  <p className="text-sm font-medium text-zinc-100">{c.rotulo}</p>
                  <p className="text-sm text-zinc-400">
                    {c.pessoa.nome} · gerada em {data(c.criadaEm)} · {c.demandasCriadas} demanda(s) criada(s)
                  </p>
                </div>
                <span className={c.revogadaEm ? "text-xs text-zinc-500" : "text-xs text-emerald-300"}>
                  {c.revogadaEm ? `Revogada em ${data(c.revogadaEm)}` : "Ativa"}
                </span>
                <button type="button" onClick={() => setAberta(aberta === c.id ? null : c.id)} aria-expanded={aberta === c.id} className={botao}>
                  {aberta === c.id ? "Fechar" : "Ver o que criou"}
                </button>
                {!c.revogadaEm && <button type="button" onClick={() => revogar(c)} className={botao}>Revogar</button>}
              </div>
              {aberta === c.id && <OQueCriou chave={c} aoDesfazer={() => mutate()} />}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

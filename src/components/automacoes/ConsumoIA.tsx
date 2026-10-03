"use client"
import { useState } from "react"
import type { PoliticaEditavel } from "@/lib/ia-politica"
import useSWR from "swr"
import { useMe } from "@/hooks/usePermissoes"
import { fetcher } from "@/lib/fetcher"

type Resumo = {
  politica: PoliticaEditavel
  habilitadaEfetiva: boolean
  periodoUTC: string
  tokensMedidos: number
  tokensPendentes: number
  tokensResultadoDesconhecido: number
  estimativaCusto: { usd: number | null; subtotalUSD: number; chamadasEstimadas: number; chamadasSemPreco: number; chamadasPendentes: number; tabelaVigente: boolean; tabela: { consultadoEm: string; fonte: string } }
  tokensDisponiveis: number
}
const usd = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 6 })
const numero = (v: number) => v.toLocaleString("pt-BR")
export function ConsumoIA() {
  const { data: me } = useMe()
  const podeVer = me?.permissoes.gerenciarConfig === true
  const { data, error, isLoading, mutate } = useSWR<Resumo>(podeVer && me?.membership ? ["/api/ia/consumo", me.membership.organizacaoId] : null, () => fetcher("/api/ia/consumo"), { revalidateOnFocus: false, shouldRetryOnError: false })
  if (!podeVer) return null
  return <details className="mx-4 my-2 max-h-72 shrink-0 overflow-y-auto rounded-xl border border-zinc-800 p-4 text-sm">
    <summary className="cursor-pointer font-medium">Consumo de IA</summary>
    <div className="mt-3 space-y-3">
      <p className="text-zinc-400">Este controle cobre a análise opcional dos relatórios e a importação de briefing PDF.</p>
      {error ? <p role="alert">Não foi possível consultar o consumo. <button className="underline" onClick={() => mutate()}>Tentar novamente</button></p>
        : isLoading || !data ? <p>Consultando consumo…</p> : <>
          <p>{data.habilitadaEfetiva ? "Análise de IA disponível, sujeita ao saldo." : "Análise de IA desativada para esta empresa."} Os relatórios de dados continuam disponíveis.</p>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div><dt>Tokens confirmados do período</dt><dd>{numero(data.tokensMedidos)}</dd></div>
            <div><dt>Saldo disponível</dt><dd>{numero(data.tokensDisponiveis)} de {numero(data.politica.tokensDia)}</dd></div>
            <div><dt>Reservados para chamadas em andamento</dt><dd>{numero(data.tokensPendentes - data.tokensResultadoDesconhecido)}</dd></div>
            <div><dt>Reserva com resultado ainda desconhecido</dt><dd>{numero(data.tokensResultadoDesconhecido)}</dd></div>
          </dl>
          <div className="space-y-1">
            <p>Estimativa em USD: {data.estimativaCusto.usd === null ? "total indisponível" : usd(data.estimativaCusto.usd)}</p>
            {data.estimativaCusto.usd === null && <p>Subtotal das chamadas com preço conhecido: {usd(data.estimativaCusto.subtotalUSD)}.</p>}
            <p className="text-zinc-400">{data.estimativaCusto.chamadasEstimadas} chamadas estimadas; {data.estimativaCusto.chamadasSemPreco} sem preço aplicável; {data.estimativaCusto.chamadasPendentes} pendentes, incluindo reservas anteriores. Não representa a fatura; não inclui impostos, descontos ou câmbio.</p>
            <p className="text-zinc-400"><a className="underline" href={data.estimativaCusto.tabela.fonte} target="_blank" rel="noreferrer">Preços consultados em {data.estimativaCusto.tabela.consultadoEm}</a>. {!data.estimativaCusto.tabelaVigente && "Tabela fora da validade para novas chamadas; requer atualização."}</p>
          </div>
          <p className="text-zinc-400">Período por data da reserva: {data.periodoUTC} (UTC). Até {data.politica.simultaneas} chamadas simultâneas. Reservas sem confirmação de dias anteriores continuam comprometendo o saldo.</p>
          <button className="underline" onClick={() => mutate()}>Atualizar consumo</button>
          <EditorPolitica key={me?.membership?.organizacaoId} politica={data.politica} atualizar={() => mutate()} />
        </>}
    </div>
  </details>
}


function EditorPolitica({ politica, atualizar }: { politica: PoliticaEditavel; atualizar: () => Promise<unknown> }) {
  const [edicao, setEdicao] = useState<{ anterior: PoliticaEditavel; nova: PoliticaEditavel } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState("")
  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!edicao || salvando) return
    setSalvando(true); setMensagem("")
    try {
      const r = await fetch("/api/ia/politica", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edicao) })
      const body = await r.json()
      if (r.status === 409) { setEdicao(null); await atualizar(); throw new Error("Os limites mudaram. Abra Ajustar limites novamente para revisar os valores atuais.") }
      if (!r.ok) throw new Error(body.error ?? "Não foi possível confirmar a alteração.")
      setEdicao(null)
      setMensagem("Limites salvos. Alterações ficam no registro de auditoria.")
      await atualizar()
    } catch (e) { setMensagem(e instanceof Error ? e.message : "Não foi possível confirmar a alteração. Atualize o consumo.") }
    finally { setSalvando(false) }
  }
  return <div className="border-t border-zinc-700 pt-3">
    {!edicao ? <button className="underline" onClick={() => { const p = { habilitada: politica.habilitada, tokensDia: politica.tokensDia, simultaneas: politica.simultaneas }; setEdicao({ anterior: p, nova: { ...p } }); setMensagem("") }}>Ajustar limites</button> :
      <form onSubmit={salvar} className="space-y-3">
        <fieldset disabled={salvando} className="space-y-3">
          <legend className="font-medium">Limites de IA da empresa</legend>
          <label className="flex items-center gap-2"><input type="checkbox" checked={edicao.nova.habilitada} onChange={e => setEdicao({ ...edicao, nova: { ...edicao.nova, habilitada: e.target.checked } })} />Permitir análises de IA</label>
          <label className="block">Tokens por dia (UTC)
            <input className="block w-full rounded border border-zinc-600 bg-zinc-900 p-2" type="number" required min={0} max={1000000} step={1} value={Number.isNaN(edicao.nova.tokensDia) ? "" : edicao.nova.tokensDia} onChange={e => setEdicao({ ...edicao, nova: { ...edicao.nova, tokensDia: e.target.valueAsNumber } })} />
          </label>
          <label className="block">Chamadas simultâneas
            <input className="block w-full rounded border border-zinc-600 bg-zinc-900 p-2" type="number" required min={1} max={5} step={1} value={Number.isNaN(edicao.nova.simultaneas) ? "" : edicao.nova.simultaneas} onChange={e => setEdicao({ ...edicao, nova: { ...edicao.nova, simultaneas: e.target.valueAsNumber } })} />
          </label>
          <p className="text-zinc-400">Desativar impede novas chamadas; não cancela as já enviadas. Reduzir o limite não apaga consumo ou reservas. Estes limites são de tokens, não de reais.</p>
          <div className="flex gap-4"><button type="submit" className="rounded bg-teal-700 px-3 py-2">{salvando ? "Salvando…" : "Salvar limites"}</button><button type="button" onClick={() => { setEdicao(null); setMensagem("") }}>Cancelar</button></div>
        </fieldset>
      </form>}
    {mensagem && <p role="status" className="mt-2">{mensagem}</p>}
  </div>
}

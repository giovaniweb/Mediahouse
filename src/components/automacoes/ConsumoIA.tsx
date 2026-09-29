"use client"
import useSWR from "swr"
import { useMe } from "@/hooks/usePermissoes"
import { fetcher } from "@/lib/fetcher"

type Resumo = {
  politica: { tokensDia: number; simultaneas: number }
  habilitadaEfetiva: boolean
  periodoUTC: string
  tokensMedidos: number
  tokensPendentes: number
  tokensResultadoDesconhecido: number
  tokensDisponiveis: number
}
const numero = (v: number) => v.toLocaleString("pt-BR")
export function ConsumoIA() {
  const { data: me } = useMe()
  const podeVer = me?.permissoes.gerenciarConfig === true
  const { data, error, isLoading, mutate } = useSWR<Resumo>(podeVer && me?.membership ? ["/api/ia/consumo", me.membership.organizacaoId] : null, () => fetcher("/api/ia/consumo"), { revalidateOnFocus: false, shouldRetryOnError: false })
  if (!podeVer) return null
  return <details className="mx-4 my-2 max-h-72 shrink-0 overflow-y-auto rounded-xl border border-zinc-800 p-4 text-sm">
    <summary className="cursor-pointer font-medium">Uso de IA em relatórios</summary>
    <div className="mt-3 space-y-3">
      <p className="text-zinc-400">Este controle cobre a geração de relatórios. Chat e outras análises ainda não entram neste saldo.</p>
      {error ? <p role="alert">Não foi possível consultar o consumo. <button className="underline" onClick={() => mutate()}>Tentar novamente</button></p>
        : isLoading || !data ? <p>Consultando consumo…</p> : <>
          <p>{data.habilitadaEfetiva ? "Análise de IA disponível, sujeita ao saldo." : "Análise de IA desativada para esta empresa."} Os relatórios de dados continuam disponíveis.</p>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div><dt>Tokens confirmados do período</dt><dd>{numero(data.tokensMedidos)}</dd></div>
            <div><dt>Saldo disponível</dt><dd>{numero(data.tokensDisponiveis)} de {numero(data.politica.tokensDia)}</dd></div>
            <div><dt>Reservados para chamadas em andamento</dt><dd>{numero(data.tokensPendentes - data.tokensResultadoDesconhecido)}</dd></div>
            <div><dt>Reserva com resultado ainda desconhecido</dt><dd>{numero(data.tokensResultadoDesconhecido)}</dd></div>
          </dl>
          <p className="text-zinc-400">Valores em dinheiro: desconhecidos, sem tabela de preços cadastrada. Reservas são estimativas; não são cobrança confirmada.</p>
          <p className="text-zinc-400">Período por data da reserva: {data.periodoUTC} (UTC). Até {data.politica.simultaneas} chamadas simultâneas. Reservas sem confirmação de dias anteriores continuam comprometendo o saldo.</p>
          <button className="underline" onClick={() => mutate()}>Atualizar consumo</button>
        </>}
    </div>
  </details>
}

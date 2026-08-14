"use client"

// Qual versão está rodando agora.
//
// Existe porque não havia como responder "isso já foi corrigido?" sem abrir o
// painel da Vercel. Metade das queixas da equipe tinha correção entregue e
// ninguém sabia dizer se estava no ar — e quando o build falha (o comando de
// deploy roda as migrations), a produção fica na versão anterior sem aviso.
//
// Ao relatar um problema, a pessoa informa este código e dá para saber
// exatamente qual código ela estava usando.

import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"

export function VersaoNoAr() {
  const { data } = useSWR<{ versao?: string; banco?: string; em?: string }>(
    "/api/health",
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false }
  )

  if (!data?.versao) return null

  const bancoOk = data.banco === "ok"

  return (
    <div className="px-5 pb-2 flex items-center gap-1.5" title="Versão do sistema em execução. Informe este código ao relatar um problema.">
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${bancoOk ? "bg-emerald-500" : "bg-rose-500"}`}
        aria-hidden="true"
      />
      <span className="text-[10px] text-zinc-600 font-mono truncate">
        versão {data.versao}
      </span>
    </div>
  )
}

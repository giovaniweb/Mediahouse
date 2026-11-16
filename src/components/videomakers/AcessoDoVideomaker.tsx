"use client"

import { useState } from "react"
import useSWR from "swr"
import { toast } from "sonner"
import { KeyRound, Send } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { fetcher } from "@/lib/fetcher"

type Situacao = {
  conta: "sem_conta" | "aguardando_senha" | "com_senha"
  entrouEm: string | null
  compartilhada: boolean
  ultimoEnvio: { em: string; por: string | null; whatsapp: string | null } | null
  proximoEnvioEm: string | null
  destino: { whatsapp: string | null; email: string | null }
  bloqueio: string | null
}

const ESTADO_WHATSAPP: Record<string, string> = {
  aguardando: "na fila", desconhecido: "enviando", aceito: "enviado", entregue: "entregue", lido: "lido",
  falhou: "não saiu", cancelado: "cancelado (substituído)", expirado: "não saiu a tempo",
}

const quando = (iso: string) => format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })

/**
 * "Enviar acesso" (16/11/2026): só a gestão da empresa vê (a rota devolve 404
 * aos outros, e o botão e o quadro somem). O botão e o quadro leem a mesma
 * chave do SWR, então um envio atualiza os dois.
 */
function useSituacao(videomakerId: string) {
  return useSWR<Situacao>(`/api/videomakers/${videomakerId}/acesso`, fetcher, { shouldRetryOnError: false })
}
const valida = (d: unknown): d is Situacao => !!d && typeof d === "object" && "conta" in d

export function BotaoEnviarAcesso({ videomakerId, nome }: { videomakerId: string; nome: string }) {
  const { data, mutate } = useSituacao(videomakerId)
  const [enviando, setEnviando] = useState(false)
  if (!valida(data)) return null

  const reenviar = data.conta !== "sem_conta" && !!data.ultimoEnvio
  const esperando = data.proximoEnvioEm && new Date(data.proximoEnvioEm) > new Date()
  const desabilitado = enviando || !!data.bloqueio || !!esperando
  const titulo = data.bloqueio ?? (esperando ? `Acabou de ser enviado. Dá para mandar de novo às ${format(new Date(data.proximoEnvioEm!), "HH:mm")}.` : "Manda o link para ele criar a senha")

  async function enviar() {
    const para = [data!.destino.whatsapp && `WhatsApp ${data!.destino.whatsapp}`, data!.destino.email && `e-mail ${data!.destino.email}`].filter(Boolean).join(" e ")
    const aviso = data!.conta === "sem_conta" ? "\n\nEle ainda não tem conta: o envio cria a conta." : "\n\nO link enviado antes deixa de valer. A senha que ele já tem continua valendo até ele criar a nova."
    if (!confirm(`Mandar para ${nome} o link de criar a senha do NuFlow pelo ${para}?${aviso}`)) return
    setEnviando(true)
    try {
      const res = await fetch(`/api/videomakers/${videomakerId}/acesso`, { method: "POST" })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error ?? "Não foi possível mandar o acesso")
      const partes = [j.whatsapp === "na_fila" && "WhatsApp na fila", j.email === "enviado" && "e-mail enviado"].filter(Boolean).join(" e ")
      toast.success(`Acesso enviado: ${partes}.${j.contaCriada ? " A conta dele foi criada." : ""}`)
      if (j.whatsapp === "nao_enviado") toast.warning("O WhatsApp não saiu: o número está em mais de um cadastro ou ele não está ativo aqui.")
      if (j.email === "falhou") toast.warning("O e-mail não saiu.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível mandar o acesso")
    } finally {
      setEnviando(false)
      await mutate()
    }
  }

  return (
    <button
      onClick={enviar}
      disabled={desabilitado}
      title={titulo}
      className="flex items-center gap-1.5 text-sm border border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-lg px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Send className="w-4 h-4" /> {enviando ? "Enviando..." : reenviar ? "Reenviar acesso" : "Enviar acesso"}
    </button>
  )
}

export function SituacaoDoAcesso({ videomakerId }: { videomakerId: string }) {
  const { data } = useSituacao(videomakerId)
  if (!valida(data)) return null

  const situacao = data.conta === "sem_conta"
    ? "Ainda não tem conta. O envio cria a conta e manda o link para ele criar a senha."
    : data.conta === "aguardando_senha"
      ? "Conta criada, esperando ele criar a senha pelo link."
      : data.entrouEm
        ? `Tem acesso. Entrou no painel em ${quando(data.entrouEm)}.`
        : "Tem conta com senha, mas ainda não há registro de entrada no painel (o registro começou em 12/11/2026)."
  const destino = [data.destino.whatsapp && `WhatsApp ${data.destino.whatsapp}`, data.destino.email && `e-mail ${data.destino.email}`].filter(Boolean).join(" e ")

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4" data-testid="situacao-acesso">
      <p className="text-sm font-medium text-zinc-200 flex items-center gap-1.5">
        <KeyRound className="h-4 w-4 text-zinc-400" aria-hidden /> Acesso ao NuFlow
      </p>
      <p className="text-sm text-zinc-300 mt-2">{situacao}</p>
      <p className="text-xs text-zinc-500 mt-1">
        {data.ultimoEnvio
          ? `Último envio: ${quando(data.ultimoEnvio.em)}${data.ultimoEnvio.por ? ` por ${data.ultimoEnvio.por}` : ""}${data.ultimoEnvio.whatsapp ? ` · WhatsApp ${ESTADO_WHATSAPP[data.ultimoEnvio.whatsapp] ?? data.ultimoEnvio.whatsapp}` : ""}.`
          : "Nenhum acesso enviado por aqui ainda."}
      </p>
      {data.bloqueio
        ? <p className="text-xs text-amber-400 mt-1">{data.bloqueio}</p>
        : destino && <p className="text-xs text-zinc-500 mt-1">O próximo envio vai para o {destino}. É um link para ele criar a senha; nenhuma senha vai na mensagem.</p>}
      {data.compartilhada && (
        <p className="text-xs text-zinc-500 mt-1">A conta dele também é de outra empresa: o link vai só para o telefone e o e-mail da própria conta.</p>
      )}
    </div>
  )
}

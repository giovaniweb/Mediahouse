"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import useSWR from "swr"
import { toast } from "sonner"
import { fetcher } from "@/lib/fetcher"

/**
 * "Transferir para Demandas (audiovisual)" — o card que caiu em Jobs por
 * engano volta para o quadro de Demandas.
 *
 * NÃO CRIA NADA: é o mesmo registro trocando de quadro. A regra inteira —
 * status de destino, bloqueios, convites pendentes, histórico e auditoria — é
 * do servidor (`lib/transferir-para-demandas.ts`). Esta tela pede a PRÉVIA
 * antes de oferecer o botão, para que o bloqueio apareça como explicação e não
 * como erro depois do clique.
 *
 * Abre pelo botão "Mover para Demandas" do topo do Job, ao lado de Editar —
 * antes era um link miúdo no rodapé da operação, e quem precisava não o achava.
 * Quando o card virou Job por engano na aprovação, o histórico sabe como ele foi
 * pedido, e a transferência devolve departamento e tipo de antes.
 *
 * Só admin e gestor veem. A autorização de verdade está na rota.
 */

type Impedimento = { codigo: string; mensagem: string }
type Previa = {
  jaEstava: boolean
  impedimentos: Impedimento[]
  convitesPendentes: number
  statusAtual: string
  statusDestino: string | null
  origem: { departamento: string; tipoVideo: string } | null
}

const DESTINO_LABEL: Record<string, string> = {
  aguardando_triagem: "Entrada · aguardando triagem",
  urgencia_aprovada: "Produção · urgência aprovada",
  aguardando_aprovacao_interna: "Entrada · continua aguardando aprovação",
  urgencia_pendente_aprovacao: "Entrada · urgência continua aguardando aprovação",
  pedido_criado: "Entrada · continua aguardando aprovação",
  encerrado: "Continua recusada",
}

export function TransferirParaDemandas({ jobId, codigo, aberto, onFechar }: {
  jobId: string
  codigo: string
  aberto: boolean
  onFechar: () => void
}) {
  const router = useRouter()
  // null = ainda não escolhido: vale o tipo de antes do Job, ou "Outro".
  const [tipoEscolhido, setTipoEscolhido] = useState<string | null>(null)
  const [transferindo, setTransferindo] = useState(false)
  const secao = useRef<HTMLElement>(null)
  useEffect(() => {
    if (aberto) secao.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [aberto])

  const { data: me } = useSWR<{ membership?: { papel?: string }; tipo?: string }>("/api/me", fetcher)
  const papel = String(me?.membership?.papel ?? me?.tipo ?? "").toLowerCase()
  const podeTransferir = papel === "admin" || papel === "gestor"

  const { data: previa, error: erroPrevia, mutate: recarregarPrevia } = useSWR<Previa>(
    aberto ? `/api/jobs/${jobId}/transferir` : null,
    fetcher,
    { revalidateOnFocus: false }
  )
  const { data: dataTipos } = useSWR<{ parametros: { valor: string; label: string }[] }>(
    aberto ? "/api/configuracoes/parametros?grupo=tipos_video" : null,
    fetcher
  )
  // Sem tipos configurados, "Outro" sozinho já permite transferir.
  const configurados = (dataTipos?.parametros?.length ? dataTipos.parametros : [{ valor: "outro", label: "Outro" }])
    .filter((t) => t.valor !== "cobertura_evento")
  const origem = previa?.origem ?? null
  // O tipo de antes entra na lista mesmo que tenha saído da configuração.
  const tipos = origem && !configurados.some((t) => t.valor === origem.tipoVideo)
    ? [{ valor: origem.tipoVideo, label: origem.tipoVideo }, ...configurados]
    : configurados
  const tipoVideo = tipoEscolhido ?? origem?.tipoVideo ?? "outro"

  if (!me || !podeTransferir || !aberto) return null

  async function transferir() {
    setTransferindo(true)
    try {
      const res = await fetch(`/api/jobs/${jobId}/transferir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmar: true, tipoVideo }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Algo mudou entre a prévia e o clique (um aceite, um custo): mostra o
        // motivo atualizado em vez de só o erro.
        if (res.status === 409) void recarregarPrevia()
        throw new Error(json.error ?? "Não foi possível transferir")
      }
      toast.success(json.jaEstava ? "Já estava em Demandas." : `${codigo} foi para o quadro de Demandas.`)
      // O registro deixou de ser Job; ficar nesta tela mostraria um Job que não existe mais.
      router.push(`/demandas/${jobId}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao transferir")
      setTransferindo(false)
    }
  }

  const bloqueado = (previa?.impedimentos.length ?? 0) > 0

  return (
    <section
      ref={secao}
      aria-label="Mover para Demandas"
      className="bg-zinc-900 border border-purple-500/40 rounded-xl p-4 space-y-3 scroll-mt-4"
    >
      <div>
        <h2 className="text-sm font-semibold text-zinc-100">Mover para Demandas</h2>
        <p className="text-xs text-zinc-500 mt-1">
          Jobs são só captações externas, feitas por videomaker. Se este card não é isso, ele sai do
          quadro de Jobs e vai para o de Demandas. Continua sendo{" "}
          <span className="font-mono text-zinc-400">{codigo}</span>: briefing, arquivos, comentários e
          histórico não se movem.
        </p>
      </div>

      {!previa && !erroPrevia && <p className="text-xs text-zinc-500">Conferindo o Job…</p>}
      {erroPrevia && (
        <p className="text-xs text-red-300">
          {erroPrevia instanceof Error ? erroPrevia.message : "Não foi possível conferir o Job."}
        </p>
      )}

      {previa && bloqueado && (
        <div role="alert" className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 space-y-1">
          <p className="font-semibold">Não dá para transferir agora:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {previa.impedimentos.map((i) => (
              <li key={i.codigo}>{i.mensagem}</li>
            ))}
          </ul>
        </div>
      )}

      {previa && !bloqueado && !previa.jaEstava && (
        <>
          <dl className="text-xs space-y-1">
            <div className="flex gap-2">
              <dt className="text-zinc-500">Vai para</dt>
              <dd className="text-zinc-300">
                {(previa.statusDestino && DESTINO_LABEL[previa.statusDestino]) ?? "Início do quadro de Demandas"}
              </dd>
            </div>
            {origem && (
              <div className="flex gap-2">
                <dt className="text-zinc-500">Volta como foi pedido</dt>
                <dd className="text-zinc-300 capitalize">{origem.departamento}</dd>
              </div>
            )}
          </dl>
          {previa.convitesPendentes > 0 && (
            <p className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
              {previa.convitesPendentes === 1
                ? "Há 1 convite pendente para videomaker. Ele será cancelado."
                : `Há ${previa.convitesPendentes} convites pendentes para videomaker. Eles serão cancelados.`}
            </p>
          )}

          <label className="block">
            <span className="block text-[11px] uppercase tracking-wide text-zinc-500 mb-1">Tipo de vídeo</span>
            <select
              value={tipoVideo}
              onChange={(e) => setTipoEscolhido(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200"
            >
              {tipos.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.label}
                </option>
              ))}
            </select>
            <span className="block text-[11px] text-zinc-600 mt-1">
              O tipo de cobertura sai junto. Dá para trocar depois, na demanda.
            </span>
          </label>
        </>
      )}

      <div className="flex items-center gap-2">
        {previa && !bloqueado && (
          <button
            type="button"
            onClick={transferir}
            disabled={transferindo}
            className="text-sm bg-zinc-700 hover:bg-zinc-600 text-zinc-100 px-3 py-1.5 rounded-lg disabled:opacity-40"
          >
            {transferindo ? "Movendo…" : "Mover para Demandas"}
          </button>
        )}
        <button
          type="button"
          onClick={onFechar}
          disabled={transferindo}
          className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1.5 disabled:opacity-40"
        >
          {bloqueado ? "Fechar" : "Cancelar"}
        </button>
      </div>
    </section>
  )
}

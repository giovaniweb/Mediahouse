"use client"

import { useRef, useState } from "react"
import type { DropResult } from "@hello-pangea/dnd"
import { DemandaCard } from "@/components/demandas/DemandaCard"
import { DemandaModal } from "@/components/demandas/DemandaModal"
import { estaAtrasada } from "@/lib/status"
import { salvarOrdem } from "@/lib/kanban-order"
import type { EspelhoDoCard } from "@/components/demandas/TagEspelho"
import { AUDIOVISUAL_COLUNA_PARA_STATUS, PEDE_TEXTO } from "@/lib/kanban-movimento"
import { PedidoMotivo } from "./PedidoMotivo"
import { QuadroArrastavel } from "./QuadroArrastavel"

export type ColunaDef = { id: string; label: string; color: string; dot: string }

export const COLUNAS: ColunaDef[] = [
  { id: "entrada", label: "Entrada", color: "border-t-zinc-500", dot: "bg-zinc-400" },
  { id: "producao", label: "Produção", color: "border-t-blue-500", dot: "bg-blue-500" },
  { id: "edicao", label: "Edição", color: "border-t-purple-500", dot: "bg-purple-500" },
  { id: "aprovacao", label: "Aprovação", color: "border-t-amber-500", dot: "bg-amber-500" },
  { id: "para_postar", label: "Para Postar", color: "border-t-cyan-500", dot: "bg-cyan-500" },
  { id: "finalizado", label: "Concluído", color: "border-t-emerald-500", dot: "bg-emerald-500" },
]

interface Demanda {
  id: string
  codigo: string
  titulo: string
  departamento: string
  tipoVideo: string
  prioridade: "urgente" | "alta" | "normal" | "baixa"
  statusVisivel: string
  statusInterno: string
  dataLimite?: string | null
  posicaoKanban?: number | null
  videomakerId?: string | null
  editor?: { nome: string } | null
  solicitante?: { nome: string } | null
  eventoGestao?: { id: string; nome: string } | null
  espelho?: EspelhoDoCard | null
}

interface KanbanBoardProps {
  demandas: Demanda[]
  /** `extra.observacao` vem do pedido de motivo (ex.: Impedimento). */
  onMove: (demandaId: string, novaColuna: string, extra?: { observacao: string }) => void
  onDelete?: (demandaId: string) => void
  onDuplicate?: (demandaId: string) => void
  onMarkPosted?: (id: string, tipo: string, link?: string) => Promise<void>
  /** Papel na empresa ATIVA (session.user.papel), não o cargo global. */
  papel?: string | null
  /** Sobrescreve os rótulos das colunas (ex.: kanban de Design) */
  labels?: Record<string, string>
  /** Colunas customizadas (ex.: kanban do Growth). Default: COLUNAS (audiovisual). */
  colunas?: ColunaDef[]
  /** Mapeia uma demanda → id da coluna. Default: por statusVisivel (audiovisual). */
  getColuna?: (demanda: Demanda) => string
  /** Status aplicado ao soltar em cada coluna; diz quais pedem um texto antes. Default: audiovisual. */
  colunaParaStatus?: Record<string, string>
  /** Como abrir o card. Default: modal. Growth usa página completa. */
  openMode?: "modal" | "page"
  /** "Ver todos" do Finalizado: o histórico do departamento deste quadro. */
  historico?: string
}

// Colunas que videomakers externos NÃO podem mover cards para lá (audiovisual)
const COLUNAS_BLOQUEADAS_VM: string[] = ["para_postar", "finalizado"]

// Colunas fechadas para quem executa o card de OUTRA empresa. Aprovação,
// publicação e encerramento são de quem responde ao cliente final.
//
// É dica visual, não segurança: a autoridade está em `podeTransicionar`
// (STATUS_PERMITIDOS_AO_ESPELHO), no servidor. Foi confiar no `onDragEnd` que
// deixou o drag-and-drop livre por tanto tempo — ver AUDITORIA-JOB-WORKFLOW §2.1.
const COLUNAS_BLOQUEADAS_ESPELHO: string[] = ["para_postar", "finalizado"]

export function KanbanBoard({ demandas, onMove, onDelete, onDuplicate, onMarkPosted, papel, labels, colunas, getColuna, colunaParaStatus = AUDIOVISUAL_COLUNA_PARA_STATUS, openMode = "modal", historico = "/historico/audiovisual" }: KanbanBoardProps) {
  const COLS = colunas ?? COLUNAS
  const colDe = getColuna ?? ((d: Demanda) => d.statusVisivel)
  const savingOrder = useRef(false)
  const [orderStatus, setOrderStatus] = useState<"idle" | "saving" | "error">("idle")
  const [modalDemandaId, setModalDemandaId] = useState<string | null>(null)
  const [localOrder, setLocalOrder] = useState<Record<string, string[]>>({})
  // Movimento que espera o motivo. O card fica onde estava até o "Mover".
  const [aguardandoMotivo, setAguardandoMotivo] = useState<{ demandaId: string; coluna: string } | null>(null)
  const pedidoAberto = aguardandoMotivo ? PEDE_TEXTO[colunaParaStatus[aguardandoMotivo.coluna] as keyof typeof PEDE_TEXTO] : undefined

  async function handleDragEnd(result: DropResult) {
    if (savingOrder.current || orderStatus === "error") return
    if (!result.destination) return
    const destinoCol = result.destination.droppableId
    const origemCol = result.source.droppableId

    // Gestor de eventos é só acompanhamento — não move cards (quem move é o time)
    if (papel === "gestor_eventos") return

    // Restrição para videomakers externos: só podem mover até "aprovacao"
    if (papel === "videomaker" && COLUNAS_BLOQUEADAS_VM.includes(destinoCol)) {
      return // silently block — the lock icon communicates the restriction
    }

    // Card executado por espelhamento: o servidor recusaria com 403, e um card
    // que volta sozinho para a coluna anterior é pior de entender do que um card
    // que não sai do lugar.
    const arrastado = demandas.find((d) => d.id === result.draggableId)
    if (arrastado?.espelho?.papel === "destino") {
      if (arrastado.espelho.escopo === "acompanhar") return
      if (COLUNAS_BLOQUEADAS_ESPELHO.includes(destinoCol)) return
    }

    // Intra-column reorder
    if (destinoCol === origemCol) {
      const colItems = byCol(origemCol)
      const reordered = Array.from(colItems)
      const [moved] = reordered.splice(result.source.index, 1)
      reordered.splice(result.destination.index, 0, moved)

      // Update local order optimistically
      setLocalOrder(prev => ({ ...prev, [origemCol]: reordered.map(d => d.id) }))

      savingOrder.current = true
      setOrderStatus("saving")
      try {
        await salvarOrdem(reordered.map(d => d.id))
        setOrderStatus("idle")
      } catch {
        setLocalOrder(prev => ({ ...prev, [origemCol]: colItems.map(d => d.id) }))
        setOrderStatus("error")
      } finally {
        savingOrder.current = false
      }
      return
    }

    // A guarda do servidor recusa estas colunas sem um texto (ex.: motivo do
    // impedimento). Pergunta antes, em vez de mover e mostrar o erro depois.
    if (PEDE_TEXTO[colunaParaStatus[destinoCol] as keyof typeof PEDE_TEXTO]) {
      setAguardandoMotivo({ demandaId: result.draggableId, coluna: destinoCol })
      return
    }
    moverParaColuna(result.draggableId, destinoCol)
  }

  function moverParaColuna(demandaId: string, destinoCol: string, extra?: { observacao: string }) {
    // Move to different column — reset local order for destination
    setLocalOrder(prev => {
      const next = { ...prev }
      delete next[destinoCol]
      return next
    })
    onMove(demandaId, destinoCol, extra)
  }

  const byCol = (colId: string) => {
    const items = demandas.filter((d) => colDe(d) === colId)
    const order = localOrder[colId]
    if (!order) {
      // Atrasadas no topo, depois urgentes, depois a posição salva. Só vale quando
      // não há ordenação manual — arrastar continua mandando, como antes.
      return items.sort((a, b) => {
        const atrA = estaAtrasada(a), atrB = estaAtrasada(b)
        if (atrA !== atrB) return atrA ? -1 : 1
        if (a.prioridade === "urgente" && b.prioridade !== "urgente") return -1
        if (b.prioridade === "urgente" && a.prioridade !== "urgente") return 1
        const posA = a.posicaoKanban ?? 9999
        const posB = b.posicaoKanban ?? 9999
        return posA - posB
      })
    }
    // Apply local order
    const mapped = new Map(items.map(d => [d.id, d]))
    const ordered = order.map(id => mapped.get(id)).filter(Boolean) as Demanda[]
    const rest = items.filter(d => !order.includes(d.id))
    return [...ordered, ...rest]
  }

  const isBloqueada = (colId: string) => papel === "videomaker" && COLUNAS_BLOQUEADAS_VM.includes(colId)

  return (
    <>
    <QuadroArrastavel
      colunas={COLS.map((col) => ({ ...col, label: labels?.[col.id] ?? col.label }))}
      itensDaColuna={byCol}
      idDe={(d) => d.id}
      onDragEnd={handleDragEnd}
      nome={{ um: "demanda", varios: "demandas", vazio: "Nenhuma demanda nesta etapa." }}
      recolhivel="finalizado"
      verTodos={historico}
      novo={{ coluna: "entrada", rotulo: "Criar demanda", href: "/demandas?nova=1" }}
      bloqueada={isBloqueada}
      arrastoDesligado={orderStatus !== "idle"}
      aviso={orderStatus !== "idle" && (
        <div role={orderStatus === "error" ? "alert" : "status"} className="px-4 py-3 text-sm text-zinc-200">
          {orderStatus === "saving" ? "Salvando ordem…" : "Não foi possível salvar toda a ordem. Algumas posições podem ter sido gravadas."}
          {orderStatus === "error" && <button type="button" className="ml-3 underline" onClick={() => window.location.reload()}>Recarregar quadro para conferir</button>}
        </div>
      )}
      renderCard={(demanda, { arrastavel }) => (
        <DemandaCard
          demanda={demanda}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onOpen={openMode === "modal" ? setModalDemandaId : undefined}
          onMarkPosted={onMarkPosted}
          arrastavel={arrastavel}
        />
      )}
    />

    {openMode === "modal" && (
      <DemandaModal demandaId={modalDemandaId} onClose={() => setModalDemandaId(null)} />
    )}

    {aguardandoMotivo && pedidoAberto && (
      <PedidoMotivo
        pedido={pedidoAberto}
        tituloCard={demandas.find((d) => d.id === aguardandoMotivo.demandaId)?.titulo ?? ""}
        onCancelar={() => setAguardandoMotivo(null)}
        onConfirmar={(observacao) => {
          moverParaColuna(aguardandoMotivo.demandaId, aguardandoMotivo.coluna, { observacao })
          setAguardandoMotivo(null)
        }}
      />
    )}
    </>
  )
}

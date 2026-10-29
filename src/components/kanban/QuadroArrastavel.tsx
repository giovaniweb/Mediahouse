"use client"

// O quadro de arrastar, um só para Demandas, Growth, Jobs e Social Media.
//
// Antes cada quadro tinha o seu: o de Jobs não arrastava e abria o card em
// página inteira, o da social usava outro card e outro jeito de mover. O pedido
// de 07/10/2026 foi "tudo igual como Audiovisual Demandas e Growth usam". Aqui
// mora o que é igual — trilho, colunas, Concluído recolhido, alça e o arrasto
// no celular. O que cada quadro decide (o que acontece ao soltar, o card) vem
// de fora.
import { useState, type ReactNode } from "react"
import { DragDropContext, Draggable, useKeyboardSensor, useMouseSensor, useTouchSensor, type DropResult } from "@hello-pangea/dnd"
import { ChevronRight, Lock, Plus } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { StrictModeDroppable } from "./StrictModeDroppable"
import { useSensorAlca } from "./sensorAlca"
import { TrilhoQuadro } from "./TrilhoQuadro"
import styles from "./KanbanPreview.module.css"

// A alça vem antes dos sensores padrão: ela precisa ver o toque primeiro (sensorAlca.ts).
const SENSORES = [useSensorAlca, useMouseSensor, useKeyboardSensor, useTouchSensor]

export type ColunaQuadro = { id: string; label: string; color: string; dot: string; dica?: string }

export function QuadroArrastavel<T>({
  colunas, itensDaColuna, idDe, renderCard, onDragEnd, nome,
  recolhivel, abrirRecolhivel = false, verTodos, novo, bloqueada, arrastoDesligado = false, aviso, fimDaColuna,
}: {
  colunas: ColunaQuadro[]
  /** Os cards de cada coluna, já na ordem em que aparecem. */
  itensDaColuna: (colunaId: string) => T[]
  idDe: (item: T) => string
  renderCard: (item: T, contexto: { arrastavel: boolean }) => ReactNode
  /** O quadro decide o que soltar significa — mover, reordenar, perguntar ou recusar. */
  onDragEnd: (resultado: DropResult) => void
  /** Como chamar os cards: "demanda"/"demandas", "job"/"jobs". */
  nome: { um: string; varios: string; vazio: string }
  /** Coluna que começa recolhida (Concluído). Recolhida, continua recebendo card. */
  recolhivel?: string
  /** Abre a coluna recolhível por fora (ex.: um filtro que achou cards nela). */
  abrirRecolhivel?: boolean
  /** "Ver todos →" da coluna recolhível: o histórico daquele quadro. */
  verTodos?: string
  /** "+" no topo de uma coluna. */
  novo?: { coluna: string; rotulo: string; href?: string; onClick?: () => void }
  /** Coluna fechada para esta pessoa (cadeado e meia-luz). Dica visual: quem recusa é o servidor. */
  bloqueada?: (colunaId: string) => boolean
  arrastoDesligado?: boolean
  /** Linha acima do trilho (ex.: "Salvando ordem…"). */
  aviso?: ReactNode
  /** Algo no fim da lista de uma coluna (ex.: "+ Anotar ideia"). */
  fimDaColuna?: (colunaId: string) => ReactNode
}) {
  // Concluído começa recolhido: com seis colunas (oito no Growth) o quadro não
  // cabia em 1440 px e a coluna que sobrava para fora era a de trabalho em
  // andamento.
  const [recolhivelAberta, setRecolhivelAberta] = useState(false)
  const contar = (n: number) => `${n} ${n === 1 ? nome.um : nome.varios}`

  return (
    <DragDropContext onDragEnd={onDragEnd} sensors={SENSORES} enableDefaultSensors={false}>
      <TrilhoQuadro aviso={aviso}>
        {colunas.map((col) => {
          const itens = itensDaColuna(col.id)
          const fechada = bloqueada?.(col.id) ?? false
          const recolhida = col.id === recolhivel && !recolhivelAberta && !abrirRecolhivel
          return (
            <section
              key={col.id}
              aria-label={col.label}
              className={cn(
                "flex-shrink-0 bg-zinc-900/50 rounded-xl border border-zinc-800 border-t-[3px] flex flex-col",
                recolhida ? "w-14" : "w-72",
                col.color,
                styles.column,
                recolhida && styles.collapsed,
                fechada && "opacity-70"
              )}
            >
              {recolhida ? (
                <button
                  type="button"
                  onClick={() => setRecolhivelAberta(true)}
                  aria-expanded={false}
                  aria-label={`Mostrar ${col.label}: ${contar(itens.length)}`}
                  className="flex flex-col items-center gap-3 px-1 py-3 text-zinc-300 hover:text-white transition-colors"
                >
                  <span className="text-xs bg-zinc-800 text-zinc-400 rounded-full px-2 py-0.5 font-medium border border-zinc-700">
                    {itens.length}
                  </span>
                  <span className="font-semibold text-sm [writing-mode:vertical-rl] rotate-180">{col.label}</span>
                </button>
              ) : (
                <>
                  <div className={cn("flex items-center justify-between px-3 py-3", styles.heading)}>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn("w-2 h-2 rounded-full shrink-0", col.dot)} />
                      <h2 className="font-semibold text-sm text-zinc-200 truncate" title={col.label}>{col.label}</h2>
                      <span className="text-xs bg-zinc-800 text-zinc-400 rounded-full px-2 py-0.5 font-medium border border-zinc-700">
                        {itens.length}
                      </span>
                      {fechada && <Lock className="w-3 h-3 text-zinc-600" aria-label="Gerenciado pela equipe interna" />}
                    </div>
                    {novo?.coluna === col.id && !fechada && (
                      novo.href
                        ? <Link href={novo.href} aria-label={novo.rotulo} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"><Plus className="w-4 h-4" /></Link>
                        : <button type="button" onClick={novo.onClick} aria-label={novo.rotulo} className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"><Plus className="w-4 h-4" /></button>
                    )}
                    {col.id === recolhivel && (
                      <div className="ml-auto flex items-center gap-1.5">
                        {verTodos && (
                          <Link href={verTodos} className="text-[11px] text-zinc-500 hover:text-emerald-400 transition-colors">
                            Ver todos →
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => setRecolhivelAberta(false)}
                          aria-expanded={true}
                          aria-label={`Recolher ${col.label}`}
                          className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  {col.dica && <p className="-mt-2 px-4 pb-2 text-xs text-zinc-500">{col.dica}</p>}
                </>
              )}

              <StrictModeDroppable droppableId={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      // Cada coluna rola sozinha: assim a barra horizontal do quadro
                      // fica sempre no rodapé visível.
                      "flex-1 min-h-0 overflow-y-auto kanban-scroll px-2 pb-2 space-y-2 rounded-b-xl transition-colors",
                      snapshot.isDraggingOver && "bg-zinc-800/50"
                    )}
                  >
                    {!recolhida && itens.map((item, index) => (
                      <Draggable isDragDisabled={arrastoDesligado} key={idDe(item)} draggableId={idDe(item)} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            data-card
                            className={cn(snapshot.isDragging && "rotate-1 opacity-90", styles.card)}
                          >
                            {renderCard(item, { arrastavel: !arrastoDesligado })}
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {!recolhida && itens.length === 0 && <p className="m-2 rounded-xl border border-dashed border-zinc-700/60 p-5 text-center text-xs text-zinc-400">{nome.vazio}</p>}
                    {provided.placeholder}
                    {!recolhida && fimDaColuna?.(col.id)}
                  </div>
                )}
              </StrictModeDroppable>
            </section>
          )
        })}
      </TrilhoQuadro>
    </DragDropContext>
  )
}

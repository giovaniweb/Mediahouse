"use client"

import { useLayoutEffect } from "react"
import type { FluidDragActions, SensorAPI } from "@hello-pangea/dnd"

/** Marca o elemento que funciona como alça de arrastar dentro do card. */
export const ATRIBUTO_ALCA = "data-alca-arrastar"

// Toque na alça começa o arrasto na hora.
//
// O sensor de toque padrão da biblioteca espera o dedo ficar parado 120 ms antes
// de levantar o card — no resto do card isso é o certo, porque o mesmo gesto
// também rola a coluna. Na alça não há o que rolar: quem pôs o dedo ali quer
// arrastar, e esperar o "toque longo" faz o card parecer travado.
//
// No celular a alça também rola o quadro de lado quando o dedo encosta na
// borda. A rolagem automática da biblioteca olha o CENTRO do card, e com um
// card quase da largura da tela o centro nunca chega à borda: sem isto o card
// só alcançava a coluna vizinha.
//
// Precisa ser o PRIMEIRO sensor da lista (KanbanBoard): ele registra o
// touchstart em captura na janela antes do sensor padrão e marca o evento com
// preventDefault, que o padrão respeita e ignora.
const BORDA = 48 // px da borda do quadro em que a rolagem começa
const PASSO_MAXIMO = 14 // px por quadro de animação, com o dedo colado na borda

function quadroRolavel(el: Element | null): HTMLElement | null {
  for (let atual = el?.parentElement; atual; atual = atual.parentElement) {
    const { overflowX } = getComputedStyle(atual)
    if ((overflowX === "auto" || overflowX === "scroll") && atual.scrollWidth > atual.clientWidth) return atual
  }
  return null
}

export function useSensorAlca(api: SensorAPI) {
  useLayoutEffect(() => {
    let encerrar: (() => void) | null = null

    function aoTocar(evento: TouchEvent) {
      if (evento.defaultPrevented || encerrar) return
      const alvo = evento.target as Element | null
      if (!alvo?.closest?.(`[${ATRIBUTO_ALCA}]`)) return
      const id = api.findClosestDraggableId(evento)
      if (!id) return
      const pre = api.tryGetLock(id, () => encerrar?.(), { sourceEvent: evento })
      if (!pre) return
      evento.preventDefault()
      const toque = evento.touches[0]
      const arrasto: FluidDragActions = pre.fluidLift({ x: toque.clientX, y: toque.clientY })
      const quadro = quadroRolavel(alvo)
      let ponto = { x: toque.clientX, y: toque.clientY }
      let quadroAnimacao = 0

      // Enquanto o dedo estiver na borda, rola o quadro e repete o movimento
      // para a biblioteca recalcular a coluna de destino.
      const rolar = () => {
        quadroAnimacao = 0
        if (!quadro || !arrasto.isActive()) return
        const caixa = quadro.getBoundingClientRect()
        const esquerda = Math.max(caixa.left, 0), direita = Math.min(caixa.right, window.innerWidth)
        const dentro = ponto.x < esquerda + BORDA ? -(esquerda + BORDA - ponto.x) : ponto.x > direita - BORDA ? ponto.x - (direita - BORDA) : 0
        if (!dentro) return
        const passo = Math.sign(dentro) * Math.ceil(Math.min(1, Math.abs(dentro) / BORDA) * PASSO_MAXIMO)
        const antes = quadro.scrollLeft
        quadro.scrollLeft += passo
        if (quadro.scrollLeft === antes) return
        arrasto.move(ponto)
        quadroAnimacao = requestAnimationFrame(rolar)
      }

      const mover = (e: TouchEvent) => {
        e.preventDefault()
        const t = e.touches[0]
        if (!t || !arrasto.isActive()) return
        ponto = { x: t.clientX, y: t.clientY }
        arrasto.move(ponto)
        if (!quadroAnimacao) quadroAnimacao = requestAnimationFrame(rolar)
      }
      const soltar = (e: TouchEvent) => {
        e.preventDefault()
        if (arrasto.isActive()) arrasto.drop({ shouldBlockNextClick: true })
        encerrar?.()
      }
      const cancelar = () => {
        if (arrasto.isActive()) arrasto.cancel()
        encerrar?.()
      }
      const opcoes = { capture: true, passive: false } as const
      window.addEventListener("touchmove", mover, opcoes)
      window.addEventListener("touchend", soltar, opcoes)
      window.addEventListener("touchcancel", cancelar, opcoes)
      encerrar = () => {
        cancelAnimationFrame(quadroAnimacao)
        window.removeEventListener("touchmove", mover, opcoes)
        window.removeEventListener("touchend", soltar, opcoes)
        window.removeEventListener("touchcancel", cancelar, opcoes)
        encerrar = null
      }
    }

    const opcoes = { capture: true, passive: false } as const
    window.addEventListener("touchstart", aoTocar, opcoes)
    return () => {
      window.removeEventListener("touchstart", aoTocar, opcoes)
      encerrar?.()
    }
  }, [api])
}

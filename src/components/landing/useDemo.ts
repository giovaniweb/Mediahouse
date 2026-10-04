"use client"
import { useEffect, useRef, useState } from "react"

/** Quem pediu menos movimento no sistema vê as demonstrações já no estado final. */
export function useMovimentoReduzido(): boolean {
  const [reduzido, setReduzido] = useState(false)
  useEffect(() => {
    const mq = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")
    if (!mq) return
    const ler = () => setReduzido(mq.matches)
    ler()
    mq.addEventListener("change", ler)
    return () => mq.removeEventListener("change", ler)
  }, [])
  return reduzido
}

/** true enquanto o bloco está na tela: as demonstrações só rodam quando alguém está vendo. */
export function useEmVista<T extends Element>(limiar = 0.35) {
  const ref = useRef<T>(null)
  const [emVista, setEmVista] = useState(false)
  useEffect(() => {
    const alvo = ref.current
    if (!alvo || !globalThis.IntersectionObserver) { setEmVista(true); return }
    const obs = new IntersectionObserver(([e]) => setEmVista(e.isIntersecting), { threshold: limiar })
    obs.observe(alvo)
    return () => obs.disconnect()
  }, [limiar])
  return [ref, emVista] as const
}

/**
 * Roda passos com atraso (ms) e limpa tudo ao sair da tela ou desmontar.
 * `rodada` muda para repetir a sequência (botão "ver de novo").
 */
export function useSequencia(ativo: boolean, passos: [number, () => void][], rodada = 0) {
  const passosRef = useRef(passos)
  useEffect(() => { passosRef.current = passos })
  useEffect(() => {
    if (!ativo) return
    const timers = passosRef.current.map(([ms, fn]) => setTimeout(fn, ms))
    return () => timers.forEach(clearTimeout)
  }, [ativo, rodada])
}

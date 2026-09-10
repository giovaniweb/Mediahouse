"use client"

/**
 * O estado da gaveta de navegação, compartilhado entre a barra do topo (que
 * abre) e a lateral (que é aberta).
 *
 * Vive num contexto e não em cada página porque nem toda tela do dashboard usa
 * o `Header` — a barra móvel precisa existir no layout, acima de `children`,
 * para que a pessoa consiga abrir o menu em qualquer rota, inclusive nas que
 * desenham o próprio cabeçalho.
 *
 * O foco volta para o botão que abriu quando a gaveta fecha. Sem isso, quem
 * navega por teclado é devolvido ao início do documento a cada fechamento.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"

type Contexto = {
  aberta: boolean
  abrir: () => void
  fechar: () => void
  refGatilho: React.RefObject<HTMLButtonElement | null>
}

const NavegacaoMovelContexto = createContext<Contexto | null>(null)

export function useNavegacaoMovel(): Contexto {
  const ctx = useContext(NavegacaoMovelContexto)
  if (!ctx) throw new Error("useNavegacaoMovel precisa estar dentro de <NavegacaoMovelProvider>")
  return ctx
}

export function NavegacaoMovelProvider({ children }: { children: React.ReactNode }) {
  const [aberta, setAberta] = useState(false)
  const refGatilho = useRef<HTMLButtonElement | null>(null)
  const pathname = usePathname()

  const fechar = useCallback(() => {
    setAberta((estavaAberta) => {
      // Só devolve o foco se a gaveta estava mesmo aberta: fechar o que já está
      // fechado (troca de rota no desktop, por exemplo) não deve roubar o foco
      // de onde a pessoa estiver.
      if (estavaAberta) refGatilho.current?.focus()
      return false
    })
  }, [])

  const abrir = useCallback(() => setAberta(true), [])

  // Navegou? A gaveta cumpriu o papel dela e sai da frente. Sem isto, tocar num
  // link no celular carrega a página atrás de um painel que continua aberto.
  //
  // Ajuste durante a renderização, e não `useEffect`: com efeito, a tela nova
  // chega a pintar uma vez com a gaveta ainda aberta antes de fechar. Este é o
  // caminho que o React indica para estado que deriva de outro valor.
  const [pathAnterior, setPathAnterior] = useState(pathname)
  if (pathname !== pathAnterior) {
    setPathAnterior(pathname)
    setAberta(false)
  }

  // Esc fecha — é o que a pessoa tenta antes de procurar o botão.
  useEffect(() => {
    if (!aberta) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar()
    }
    document.addEventListener("keydown", aoTeclar)
    return () => document.removeEventListener("keydown", aoTeclar)
  }, [aberta, fechar])

  return (
    <NavegacaoMovelContexto.Provider value={{ aberta, abrir, fechar, refGatilho }}>
      {children}
    </NavegacaoMovelContexto.Provider>
  )
}

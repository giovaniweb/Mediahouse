"use client"

// Rascunho de formulário guardado no navegador.
//
// Nasceu dentro do modal de Nova Demanda do audiovisual: o modal fechava no
// clique fora e no ESC sem perguntar nada, e quem escrevia um briefing longo
// perdia tudo. Virou hook quando o modal do Growth passou a precisar da mesma
// proteção — a chave é o que separa um rascunho do outro.
//
// O que NÃO entra aqui: File. Anexo não sobrevive ao localStorage, então o
// aviso de fechamento não pode prometer os arquivos de volta.

import { useCallback, useEffect, useRef, useState } from "react"

interface OpcoesRascunho<T extends object> {
  /** Chave no localStorage. Uma por formulário. */
  chave: string
  /** Só grava e restaura enquanto o formulário está na tela. */
  aberto: boolean
  /** Fotografia serializável do formulário agora. */
  valores: T
  /** Há algo escrito? Rascunho vazio não é gravado nem avisa nada. */
  temConteudo: boolean
  /**
   * Aplica o que voltou do navegador. Recebe `{}` quando não havia rascunho ou
   * quando a pessoa pediu para começar do zero — então é o mesmo caminho do
   * reset, e não existe uma segunda lista de setters para manter em sincronia.
   */
  aoRestaurar: (salvo: Partial<T>) => void
}

export function useRascunho<T extends object>({
  chave, aberto, valores, temConteudo, aoRestaurar,
}: OpcoesRascunho<T>) {
  const [rascunhoRecuperado, setRascunhoRecuperado] = useState(false)

  // Refs para as effects não dependerem de identidade de objeto/função: o
  // formulário muda a cada tecla e reassinar listener a cada tecla é ruído.
  // A sincronia acontece numa effect (escrever ref durante o render é proibido)
  // e esta é a PRIMEIRA declarada, então roda antes das que leem os refs.
  const serializado = JSON.stringify(valores)
  const serializadoRef = useRef(serializado)
  const temConteudoRef = useRef(temConteudo)
  const aoRestaurarRef = useRef(aoRestaurar)

  useEffect(() => {
    serializadoRef.current = serializado
    temConteudoRef.current = temConteudo
    aoRestaurarRef.current = aoRestaurar
  })

  const gravar = useCallback(() => {
    if (typeof window === "undefined" || !temConteudoRef.current) return
    localStorage.setItem(chave, serializadoRef.current)
  }, [chave])

  const limpar = useCallback(() => {
    if (typeof window !== "undefined") localStorage.removeItem(chave)
  }, [chave])

  // Grava enquanto a pessoa escreve.
  useEffect(() => {
    if (!aberto || typeof window === "undefined") return
    const t = setTimeout(gravar, 500)
    return () => clearTimeout(t)
  }, [aberto, serializado, gravar])

  // Flush na saída: sem isto os últimos <500 ms de digitação nunca chegariam ao
  // localStorage, porque o timer pendente morre junto com o modal.
  useEffect(() => {
    if (!aberto || typeof window === "undefined") return
    return () => { gravar() }
  }, [aberto, gravar])

  // Fechar a aba, recarregar ou navegar não passa por nenhuma guarda do modal.
  useEffect(() => {
    if (!aberto || typeof window === "undefined") return
    const aoSair = (e: BeforeUnloadEvent) => {
      gravar()
      if (temConteudoRef.current) { e.preventDefault(); e.returnValue = "" }
    }
    window.addEventListener("beforeunload", aoSair)
    return () => window.removeEventListener("beforeunload", aoSair)
  }, [aberto, gravar])

  // Ao abrir: recupera o que havia, ou começa limpo.
  useEffect(() => {
    if (!aberto) return
    let salvo: Partial<T> | null = null
    if (typeof window !== "undefined") {
      try { salvo = JSON.parse(localStorage.getItem(chave) ?? "null") } catch { salvo = null }
    }
    aoRestaurarRef.current(salvo ?? {})
    // Objeto vazio não é rascunho: anunciar "recuperamos" sem nada preenchido
    // faz a pessoa procurar um texto que não existe.
    setRascunhoRecuperado(!!salvo && Object.keys(salvo).length > 0)
  }, [aberto, chave])

  const descartar = useCallback(() => {
    limpar()
    aoRestaurarRef.current({})
    setRascunhoRecuperado(false)
  }, [limpar])

  return { rascunhoRecuperado, limpar, descartar }
}

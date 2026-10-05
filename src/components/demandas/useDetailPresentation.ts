"use client"
import { useState } from "react"

// O detalhe abre sempre no painel lateral, com "Ampliar" dentro dele. Antes havia
// um seletor "Abrir em: Painel lateral / Janela ampliada" no topo do quadro e da
// agenda, guardado no navegador: quem trocou uma vez não lembrava por que tudo
// passou a abrir grande. Ampliar agora vale só para aquela abertura.
export function useDetailPresentation() {
  const [presentation, setPresentation] = useState<"drawer" | "modal">("drawer")
  return { presentation, setPresentation }
}

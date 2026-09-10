"use client"

/**
 * A barra que só existe no celular, com o botão que abre a navegação.
 *
 * Fica no layout, acima do conteúdo da página, e some a partir de `md` — no
 * desktop a lateral é permanente e não há o que abrir.
 */

import { Menu } from "lucide-react"
import { useNavegacaoMovel } from "@/components/layout/NavegacaoMovel"

export function BarraMovel() {
  const { aberta, abrir, refGatilho } = useNavegacaoMovel()

  return (
    <div className="md:hidden flex items-center gap-3 h-14 px-4 border-b border-zinc-800 bg-zinc-950 shrink-0">
      <button
        ref={refGatilho}
        type="button"
        onClick={abrir}
        aria-label="Abrir navegação"
        aria-expanded={aberta}
        aria-controls="navegacao-principal"
        // 44px de alvo: o mínimo confortável para o polegar. O ícone tem 20px;
        // o resto é área de toque, não decoração.
        className="flex items-center justify-center w-11 h-11 -ml-2 rounded-lg text-zinc-300 hover:text-white hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>
      <div className="flex items-center gap-2">
        <img src="/logo.png" alt="" className="w-6 h-6 rounded-md" />
        <span className="text-white font-semibold tracking-tight text-sm">NuFlow</span>
      </div>
    </div>
  )
}

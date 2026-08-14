"use client"

// Rede de segurança do painel. Sem este arquivo, um erro em QUALQUER componente
// da rota derrubava a árvore inteira — inclusive um modal aberto, com tudo que
// a pessoa tinha digitado dentro. É a explicação estrutural do "fecha sozinho":
// não era o modal fechando, era a página caindo e levando o modal junto.
//
// Aqui o erro fica contido, a pessoa vê o que houve e pode tentar de novo sem
// recarregar e sem perder o que o rascunho já guardou.

import { useEffect } from "react"
import { AlertTriangle, RotateCw } from "lucide-react"

export default function ErroDoPainel({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[painel] erro não tratado:", error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6 text-rose-400" />
        </div>

        <h2 className="text-zinc-100 font-semibold text-lg mb-2">
          Esta tela travou
        </h2>
        <p className="text-sm text-zinc-400 mb-1">
          O resto do sistema continua funcionando. Tente carregar de novo — se
          você estava escrevendo uma demanda, o rascunho foi guardado.
        </p>
        {error.digest && (
          <p className="text-[11px] text-zinc-600 font-mono mb-4">
            código {error.digest}
          </p>
        )}

        <div className="flex gap-2 justify-center mt-5">
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 text-sm bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
          >
            <RotateCw className="w-3.5 h-3.5" /> Tentar de novo
          </button>
          <a
            href="/dashboard"
            className="inline-flex items-center text-sm border border-zinc-700 text-zinc-300 px-4 py-2 rounded-lg hover:bg-zinc-800"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  )
}

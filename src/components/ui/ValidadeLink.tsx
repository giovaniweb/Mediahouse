"use client"
// Validade de um link público e o botão de trocar por outro.
//
// Gerar outro link desliga o antigo na hora: quem tinha o link velho precisa
// receber o novo. Por isso a confirmação diz isso com todas as letras.
import { useState } from "react"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"

export function ValidadeLink({ expiraEm, gerar }: { expiraEm: string | Date | null | undefined; gerar: () => Promise<boolean> }) {
  const [gerando, setGerando] = useState(false)
  const [agora] = useState(() => Date.now())
  const data = expiraEm ? new Date(expiraEm) : null
  const vencido = !data || data.getTime() <= agora

  async function trocar() {
    if (!confirm("Gerar um link novo? O link atual para de funcionar na hora, e quem o tem precisa receber o novo.")) return
    setGerando(true)
    try {
      if (await gerar()) toast.success("Link novo gerado. Copie e envie de novo.")
      else toast.error("Não foi possível gerar o link novo.")
    } finally {
      setGerando(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-2 text-[11px]">
      <span className={vencido ? "text-red-400" : "text-zinc-500"}>
        {vencido ? "Link vencido" : `Vale até ${data!.toLocaleDateString("pt-BR")}`}
      </span>
      <button type="button" onClick={trocar} disabled={gerando}
        className="inline-flex items-center gap-1 text-zinc-400 hover:text-white disabled:opacity-50">
        <RefreshCw className={`w-3 h-3 ${gerando ? "animate-spin" : ""}`} aria-hidden="true" />
        Gerar novo link
      </button>
    </span>
  )
}

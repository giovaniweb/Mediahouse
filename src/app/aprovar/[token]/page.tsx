"use client"

// O link que vai ao cliente. O miolo — player ou carrossel, "Aprovar" e
// "Solicitar ajuste" com o momento do vídeo — é o mesmo que a equipe usa dentro
// do detalhe da demanda (components/aprovacao/AprovacaoEntrega.tsx). Aqui fica
// só a moldura de quem está fora do NuFlow: a marca, o código e o título.
import { useParams } from "next/navigation"
import { LogoNuFlow } from "@/components/marca/Marca"
import { CorpoAprovacao, useAprovacao } from "@/components/aprovacao/AprovacaoEntrega"

export default function AprovarPage() {
  const params = useParams()
  const token = params?.token as string
  const estado = useAprovacao(token)
  const demanda = estado.dados?.aprovacao.demanda
  const ehArte = demanda?.area === "design"

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <header className="border-b border-zinc-800">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <LogoNuFlow className="text-lg text-white" />
          {demanda && (
            <div className="text-right min-w-0">
              <p className="text-xs text-zinc-400">{demanda.codigo}</p>
              <p className="text-sm font-medium text-white truncate">{demanda.titulo}</p>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {token && <CorpoAprovacao token={token} modo="cliente" estado={estado} />}
      </main>

      <footer className="border-t border-zinc-800 py-6 mt-8">
        <div className="max-w-5xl mx-auto px-6 text-center text-xs text-zinc-500">
          <p>NuFlow — {ehArte ? "Aprovação de criativo" : "Plataforma de Produção Audiovisual"}</p>
        </div>
      </footer>
    </div>
  )
}

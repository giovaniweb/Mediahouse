"use client"
// "Relatório externo": o link com a credencial da empresa, para mandar a quem
// não tem conta. O botão abria a página sem credencial, e ela respondia "só abre
// pelo link de compartilhamento" — que ninguém conseguia gerar. Agora quem
// administra a empresa gera o link (vale 180 dias) e troca quando quiser.
import { useState } from "react"
import useSWR from "swr"
import { ArrowUpRight, Copy } from "lucide-react"
import { toast } from "sonner"
import { ValidadeLink } from "@/components/ui/ValidadeLink"

const classe = "flex items-center gap-1.5 text-xs border border-zinc-700 text-zinc-300 hover:bg-zinc-800 px-3 py-1.5 rounded-lg"

async function lerLink(url: string) {
  const r = await fetch(url)
  if (!r.ok) return null
  return r.json() as Promise<{ token: string | null; expiraEm: string | null }>
}

export function LinkRelatorioExterno({ caminho }: { caminho: string }) {
  const { data, mutate } = useSWR("/api/relatorios/link-externo", lerLink)
  const [agora] = useState(() => Date.now())
  const vale = !!data?.token && !!data.expiraEm && new Date(data.expiraEm).getTime() > agora
  const link = vale && typeof window !== "undefined"
    ? `${window.location.origin}${caminho}${caminho.includes("?") ? "&" : "?"}token=${encodeURIComponent(data!.token!)}`
    : ""

  async function gerar() {
    const r = await fetch("/api/relatorios/link-externo", { method: "POST" })
    if (r.ok) await mutate()
    return r.ok
  }

  // Sem permissão de administrar a empresa (ou ainda carregando): o botão de sempre.
  if (!data) {
    return <a href={caminho} target="_blank" rel="noreferrer" className={classe}><ArrowUpRight className="w-3.5 h-3.5" /> Relatório externo</a>
  }
  if (!vale) {
    return (
      <button type="button" className={classe} onClick={async () => { if (await gerar()) toast.success("Link externo gerado. Vale 180 dias.") }}>
        <ArrowUpRight className="w-3.5 h-3.5" /> {data.token ? "Link externo vencido — gerar outro" : "Gerar link externo"}
      </button>
    )
  }
  return (
    <span className="flex items-center gap-2 flex-wrap">
      <a href={link} target="_blank" rel="noreferrer" className={classe}><ArrowUpRight className="w-3.5 h-3.5" /> Relatório externo</a>
      <button type="button" className={classe} onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copiado!") }}>
        <Copy className="w-3.5 h-3.5" /> Copiar link
      </button>
      <ValidadeLink expiraEm={data.expiraEm} gerar={gerar} />
    </span>
  )
}

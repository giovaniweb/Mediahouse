"use client"

// Troca de empresa no topo.
//
// Só aparece para quem é membro de mais de uma — para a maioria das pessoas o
// cabeçalho continua exatamente como era. Até 24/08/2026 ninguém tinha duas
// memberships e o sistema prendia a pessoa na mais antiga por `createdAt`.
//
// A escolha vira um cookie, e o cookie é só um palpite: `getOrgId` reconfere a
// membership no banco a cada requisição.
import { useState } from "react"
import useSWR from "swr"
import { Building2, Check, ChevronsUpDown } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"

type Org = { id: string; nome: string; slug: string; papel: string; ativa: boolean }

export function SeletorOrganizacao() {
  const { data, mutate } = useSWR<{ ativa: string | null; organizacoes: Org[] }>(
    "/api/me/organizacoes",
    fetcher
  )
  const [trocando, setTrocando] = useState(false)

  const orgs = data?.organizacoes ?? []
  // Uma empresa só: nada a escolher, e o topo fica como sempre foi.
  if (orgs.length < 2) return null

  const ativa = orgs.find((o) => o.ativa) ?? orgs[0]

  async function trocar(org: Org) {
    if (org.ativa || trocando) return
    setTrocando(true)
    try {
      const res = await fetch("/api/me/organizacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizacaoId: org.id }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? "Não foi possível trocar de empresa")
      }
      await mutate()
      // Recarrega de verdade: cada tela já buscou dados da empresa anterior, e
      // um refresh parcial deixaria número de uma misturado com lista de outra.
      window.location.reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao trocar de empresa")
      setTrocando(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={trocando}
        className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-sm text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-60"
      >
        <Building2 className="h-4 w-4 text-zinc-400" />
        <span className="max-w-[10rem] truncate">{ativa?.nome}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-zinc-500" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => trocar(org)}
            className="flex items-center justify-between gap-2"
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{org.nome}</span>
              <span className="text-xs text-zinc-500 capitalize">{org.papel}</span>
            </span>
            {org.ativa && <Check className="h-4 w-4 shrink-0 text-emerald-400" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

"use client"

import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error("Erro ao carregar")
  return r.json()
})

export interface MeData {
  id: string
  nome: string
  email: string
  tipo: string
  status: string
  avatarUrl: string | null
  videomakerRef: { id: string; nome: string; avaliacao: number } | null
  permissoes: Record<string, boolean> & { id: string; usuarioId: string }
}

export function useMe() {
  return useSWR<MeData>("/api/me", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  })
}

export function usePerm(key: string): boolean {
  const { data } = useMe()
  if (!data?.permissoes) return false
  // Admin/gestor sempre tem tudo
  if (data.tipo === "admin" || data.tipo === "gestor") return true
  return !!data.permissoes[key]
}

"use client"

import type { Modulo } from "@/lib/modulos"

import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"

export interface MeData {
  id: string
  nome: string
  email: string
  tipo: string
  status: string
  avatarUrl: string | null
  /** Administra a plataforma inteira, acima das empresas. */
  superAdmin: boolean
  videomakerRef: { id: string; nome: string; avaliacao: number } | null
  membership: {
    organizacaoId: string
    papel: string
    categoria: string
    funcaoProfissional: string | null
    areas: string[]
    /** Opera as Gravações Externas (a Débora): age como a gestão nelas. */
    operaGravacoes?: boolean
  } | null
  permissoes: Record<string, boolean> & { id: string; usuarioId: string }
  /** Módulos que ESTA empresa tem. Antes eram constantes compiladas no bundle,
   *  iguais para todo mundo — ver src/lib/modulos.ts. */
  // Tipo do catálogo, e não a lista escrita à mão: módulo novo (cutflow, 30/09)
  // entra aqui sozinho, sem o menu deixar de reconhecê-lo.
  modulos: Record<Modulo, boolean>
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
  // Admin/gestor DA EMPRESA ATIVA sempre tem tudo — pelo vínculo, não pelo cargo global
  if (data.membership?.papel === "admin" || data.membership?.papel === "gestor") return true
  return !!data.permissoes[key]
}

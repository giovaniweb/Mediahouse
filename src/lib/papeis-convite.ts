// Papéis do convite por e-mail (Onda 2A). Arquivo sem servidor: a tela de
// Pessoas & Acessos importa daqui; src/lib/convite-equipe.ts reexporta.
import type { TipoUsuario } from "@prisma/client"

/** Papéis que se convidam pela tela. Os outros continuam pela criação manual. */
export const PAPEIS_CONVITE = ["admin", "gestor", "social", "designer", "editor", "solicitante"] as const satisfies readonly TipoUsuario[]
export type PapelConvite = (typeof PAPEIS_CONVITE)[number]

export const NOME_PAPEL: Record<PapelConvite, string> = {
  admin: "Administrador",
  gestor: "Gestor",
  social: "Social Media",
  designer: "Designer",
  editor: "Videomaker interno",
  solicitante: "Solicitante",
}

export function ehPapelConvite(p: unknown): p is PapelConvite {
  return typeof p === "string" && (PAPEIS_CONVITE as readonly string[]).includes(p)
}


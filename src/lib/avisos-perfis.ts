// Perfis prontos de aviso (Giovani, 12/11/2026): a gestão aplica com um
// clique, em vez de marcar categoria por categoria. "O objetivo é não encher o
// WhatsApp das pessoas."
//
// Um perfil só preenche as caixas da página; nada muda até Salvar. E, como toda
// preferência, ele só TIRA: quem recebe cada aviso continua decidido onde
// sempre foi. O aviso que é trabalho da própria pessoa (entrou na fila dela,
// convite de gravação, kit, ajuste na peça dela) não tem categoria e chega em
// qualquer perfil.
//
// Função pura, sem banco: a página (AvisosPorPessoa) e o script
// scripts/perfis-avisos-contourline.mjs usam a mesma definição — o script
// confere isso num teste (tests/unit/avisos-perfis.spec.ts).
import { LISTA_CATEGORIAS, type CategoriaAviso, type Recorte, type Setor } from "@/lib/avisos-categorias"

export type PerfilAviso = "so_resumo" | "setor" | "pedi" | "videomaker" | "padrao"

export type EstadoDoPerfil = {
  categoria: CategoriaAviso
  sino: boolean
  email: boolean
  whatsapp: boolean
  recorte: Recorte
  setor: Setor | null
}

export const PERFIS_AVISO: Record<PerfilAviso, { titulo: string; resumo: string; precisaDeSetor: boolean }> = {
  so_resumo: {
    titulo: "Só o resumo do dia",
    resumo: "Recebe só os resumos. O resto desliga nos três canais.",
    precisaDeSetor: false,
  },
  setor: {
    titulo: "Tudo do meu setor",
    resumo: "Tudo dos cards do setor (Audiovisual ou Growth) e dos em que está, mais os resumos e os avisos do sistema. Eventos desliga.",
    precisaDeSetor: true,
  },
  pedi: {
    titulo: "Só o que eu pedi",
    resumo: "Só os avisos dos cards que a pessoa pediu, mais os resumos. Pedidos de outros, eventos e sistema desligam.",
    precisaDeSetor: false,
  },
  videomaker: {
    titulo: "Videomaker",
    resumo: "Nada se corta: o que chega ao videomaker já é só o que é dele (convite, \"tem job para você\", véspera, kit, nota), com a arte.",
    precisaDeSetor: false,
  },
  padrao: {
    titulo: "Tudo, como antes",
    resumo: "Volta ao padrão: recebe o que sempre recebeu.",
    precisaDeSetor: false,
  },
}

const ligado = (recorte: Recorte, setor: Setor | null = null) => ({ sino: true, email: true, whatsapp: true, recorte, setor })
const desligado = () => ({ sino: false, email: false, whatsapp: false, recorte: "tudo" as Recorte, setor: null })

/** O estado de cada categoria num perfil. `setor` é obrigatório no perfil "setor". */
export function estadoDoPerfil(perfil: PerfilAviso, setor?: Setor | null): EstadoDoPerfil[] {
  return LISTA_CATEGORIAS.map((categoria) => ({ categoria, ...porCategoria(perfil, categoria, setor ?? null) }))
}

function porCategoria(perfil: PerfilAviso, c: CategoriaAviso, setor: Setor | null): Omit<EstadoDoPerfil, "categoria"> {
  switch (perfil) {
    case "so_resumo":
      return c === "resumos" ? ligado("tudo") : desligado()
    case "setor":
      if (!setor) throw new Error("O perfil \"Tudo do meu setor\" precisa do setor")
      if (c === "eventos") return desligado()
      if (c === "resumos" || c === "sistema" || c === "parabens") return ligado("tudo")
      return ligado("setor", setor)
    case "pedi":
      if (c === "resumos" || c === "parabens") return ligado("tudo")
      if (c === "eventos" || c === "sistema") return desligado()
      return ligado("pedi")
    case "videomaker":
    case "padrao":
      return ligado("tudo")
  }
}

/** Qual perfil o estado atual é, se for exatamente um deles (para a página marcar). */
export function perfilDoEstado(estado: { categoria: string; sino: boolean; email: boolean; whatsapp: boolean; recorte: string; setor?: string | null }[]): PerfilAviso | null {
  const igual = (a: EstadoDoPerfil[]) => a.every((e) => {
    const x = estado.find((s) => s.categoria === e.categoria)
    return !!x && x.sino === e.sino && x.email === e.email && x.whatsapp === e.whatsapp && x.recorte === e.recorte && (x.setor ?? null) === e.setor
  })
  for (const p of ["so_resumo", "pedi", "padrao"] as const) if (igual(estadoDoPerfil(p))) return p
  for (const s of ["audiovisual", "growth"] as const) if (igual(estadoDoPerfil("setor", s))) return "setor"
  return null
}
